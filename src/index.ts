import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

type Bindings = {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
};

type Variables = {
  user: {
    id: string;
    username: string;
    role: string;
  };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// --- Хэширование PBKDF2 (соль:хэш) ---
async function hashPassword(password: string, storedHash?: string): Promise<string> {
  const enc = new TextEncoder();
  let salt: Uint8Array;

  if (storedHash && storedHash.includes(':')) {
    const saltHex = storedHash.split(':')[0];
    const match = saltHex.match(/.{1,2}/g);
    salt = new Uint8Array(match ? match.map(b => parseInt(b, 16)) : []);
  } else {
    salt = crypto.getRandomValues(new Uint8Array(16));
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    true,
    ['sign', 'verify']
  );

  const exported = await crypto.subtle.exportKey('raw', key);
  const hashHex = Array.from(new Uint8Array(exported)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

  return `${saltHex}:${hashHex}`;
}

// --- Middlewares ---
const requireAuth = async (c: any, next: any) => {
  const sessionId = getCookie(c, 'music_session');
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = await c.env.DB.prepare(
    `SELECT s.id, s.expires_at, u.id as user_id, u.username, u.role 
     FROM sessions s 
     JOIN users u ON s.user_id = u.id 
     WHERE s.id = ?`
  ).bind(sessionId).first();

  if (!session || (session.expires_at as number) < Math.floor(Date.now() / 1000)) {
    deleteCookie(c, 'music_session');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', {
    id: session.user_id,
    username: session.username,
    role: session.role,
  });

  await next();
};

const requireAdmin = async (c: any, next: any) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
};

// --- Web UI ---
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Music Cloud</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #000; color: #fff; margin: 0; padding: 16px; max-width: 600px; margin: 0 auto; }
    h1, h2 { font-weight: 700; margin-top: 24px; margin-bottom: 12px; }
    .card { background: #1c1c1e; padding: 16px; border-radius: 12px; margin-bottom: 16px; }
    input, button, select { width: 100%; padding: 12px; border-radius: 8px; border: none; margin-bottom: 10px; font-size: 15px; }
    input { background: #2c2c2e; color: #fff; }
    button { background: #0a84ff; color: #fff; font-weight: 600; cursor: pointer; }
    button.danger { background: #ff453a; }
    button.secondary { background: #3a3a3c; }
    .hidden { display: none !important; }
    .track-item { padding: 12px; background: #2c2c2e; border-radius: 8px; margin-bottom: 8px; cursor: pointer; }
    .track-name { font-weight: 600; font-size: 16px; }
    .track-sub { color: #8e8e93; font-size: 13px; margin-top: 2px; }
    audio { width: 100%; margin-top: 12px; }
    .user-row { display: flex; justify-content: space-between; align-items: center; background: #2c2c2e; padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; }
    .user-row button { width: auto; margin-bottom: 0; padding: 6px 12px; font-size: 13px; }
    .header-bar { display: flex; justify-content: space-between; align-items: center; }
    .header-bar button { width: auto; margin: 0; padding: 6px 12px; }
  </style>
</head>
<body>

  <!-- Вход -->
  <div id="login-screen" class="card">
    <h2>Вход в Music Cloud</h2>
    <p style="color:#8e8e93; font-size:13px; margin-top:-8px; margin-bottom:12px;">
      Если база пуста, первый вход автоматически создаст аккаунт администратора.
    </p>
    <form id="login-form">
      <input type="text" id="login-username" placeholder="Логин (например, admin)" required>
      <input type="password" id="login-password" placeholder="Пароль" required>
      <button type="submit">Войти / Зарегистрировать админа</button>
    </form>
    <div id="login-error" style="color:#ff453a; font-size:14px; display:none; margin-top:8px;"></div>
  </div>

  <!-- Главный экран -->
  <div id="app-screen" class="hidden">
    <div class="header-bar">
      <span id="user-info" style="color: #8e8e93; font-weight: 500;"></span>
      <button onclick="logout()" class="secondary">Выйти</button>
    </div>

    <h1>Music Cloud</h1>

    <!-- Плеер -->
    <div class="card">
      <div id="np-title" style="font-size:18px; font-weight:bold;">Ничего не играет</div>
      <div id="np-artist" style="color:#8e8e93; font-size:14px; margin-top:4px;">Выберите трек</div>
      <audio id="audio-player" controls playsinline></audio>
    </div>

    <!-- Загрузка -->
    <div class="card">
      <h2>Загрузить трек</h2>
      <form id="upload-form">
        <input type="file" id="upload-file" accept="audio/*" required>
        <input type="text" id="upload-title" placeholder="Название (опционально)">
        <input type="text" id="upload-artist" placeholder="Исполнитель">
        <input type="text" id="upload-album" placeholder="Альбом">
        <button type="submit" id="upload-btn">Загрузить</button>
      </form>
    </div>

    <!-- Админка -->
    <div id="admin-section" class="card hidden">
      <h2>Управление пользователями</h2>
      <form id="create-user-form">
        <input type="text" id="new-username" placeholder="Новый логин" required>
        <input type="password" id="new-password" placeholder="Новый пароль" required>
        <select id="new-role">
          <option value="user">Пользователь</option>
          <option value="admin">Администратор</option>
        </select>
        <button type="submit">Создать пользователя</button>
      </form>
      <div id="users-list" style="margin-top:16px;"></div>
    </div>

    <!-- Список Треков -->
    <h2>Моя библиотека</h2>
    <div id="track-list">Загрузка...</div>
  </div>

  <script>
    const audio = document.getElementById('audio-player');
    let currentUser = null;

    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          currentUser = data.user;
          showApp();
        } else {
          showLogin();
        }
      } catch {
        showLogin();
      }
    }

    function showLogin() {
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('app-screen').classList.add('hidden');
    }

    function showApp() {
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app-screen').classList.remove('hidden');
      document.getElementById('user-info').innerText = \`Пользователь: \${currentUser.username} (\${currentUser.role})\`;

      if (currentUser.role === 'admin') {
        document.getElementById('admin-section').classList.remove('hidden');
        loadUsers();
      } else {
        document.getElementById('admin-section').classList.add('hidden');
      }

      loadTracks();
    }

    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errDiv = document.getElementById('login-error');
      errDiv.style.display = 'none';

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        checkAuth();
      } else {
        const data = await res.json();
        errDiv.innerText = data.error || 'Ошибка входа';
        errDiv.style.display = 'block';
      }
    };

    async function logout() {
      await fetch('/api/auth/logout', { method: 'POST' });
      showLogin();
    }

    async function loadTracks() {
      const res = await fetch('/api/tracks');
      if (!res.ok) return;
      const data = await res.json();
      const container = document.getElementById('track-list');
      container.innerHTML = '';

      if (!data.tracks || data.tracks.length === 0) {
        container.innerHTML = '<div style="color:#8e8e93;">Список пуст</div>';
        return;
      }

      data.tracks.forEach(track => {
        const item = document.createElement('div');
        item.className = 'track-item';
        item.innerHTML = \`
          <div class="track-name">\${track.title}</div>
          <div class="track-sub">\${track.artist || 'Unknown Artist'} — \${track.album || 'Unknown Album'}</div>
        \`;
        item.onclick = () => {
          document.getElementById('np-title').innerText = track.title;
          document.getElementById('np-artist').innerText = \`\${track.artist || 'Unknown Artist'} — \${track.album || 'Unknown Album'}\`;
          audio.src = \`/api/tracks/\${track.id}/stream\`;
          audio.play();
        };
        container.appendChild(item);
      });
    }

    document.getElementById('upload-form').onsubmit = async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('upload-file');
      if (!fileInput.files[0]) return;

      const btn = document.getElementById('upload-btn');
      btn.disabled = true;
      btn.innerText = 'Загрузка...';

      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('title', document.getElementById('upload-title').value);
      formData.append('artist', document.getElementById('upload-artist').value);
      formData.append('album', document.getElementById('upload-album').value);

      const res = await fetch('/api/tracks', { method: 'POST', body: formData });
      btn.disabled = false;
      btn.innerText = 'Загрузить';

      if (res.ok) {
        document.getElementById('upload-form').reset();
        loadTracks();
      } else {
        alert('Ошибка загрузки файла');
      }
    };

    async function loadUsers() {
      const res = await fetch('/api/users');
      if (!res.ok) return;
      const data = await res.json();
      const container = document.getElementById('users-list');
      container.innerHTML = '';

      data.users.forEach(u => {
        const row = document.createElement('div');
        row.className = 'user-row';
        row.innerHTML = \`
          <div><strong>\${u.username}</strong> (\${u.role})</div>
          \${u.username !== currentUser.username ? \`<button class="danger" onclick="deleteUser('\${u.id}')">Удалить</button>\` : ''}
        \`;
        container.appendChild(row);
      });
    }

    document.getElementById('create-user-form').onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('new-username').value;
      const password = document.getElementById('new-password').value;
      const role = document.getElementById('new-role').value;

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });

      if (res.ok) {
        document.getElementById('create-user-form').reset();
        loadUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'Ошибка создания пользователя');
      }
    };

    async function deleteUser(id) {
      if (!confirm('Удалить пользователя?')) return;
      const res = await fetch(\`/api/users/\${id}\`, { method: 'DELETE' });
      if (res.ok) {
        loadUsers();
      } else {
        alert('Ошибка удаления');
      }
    }

    checkAuth();
  </script>
</body>
</html>`);
});

// --- Auth Endpoints ---
app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json().catch(() => ({}));
  if (!username || !password) return c.json({ error: 'Заполните логин и пароль' }, 400);

  const userCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<any>();

  if (userCount?.count === 0) {
    const fullHash = await hashPassword(password);
    const userId = 'usr_' + crypto.randomUUID().slice(0, 8);
    const now = Math.floor(Date.now() / 1000);

    await c.env.DB.prepare(
      'INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, username, fullHash, 'admin', now).run();

    user = { id: userId, username, password_hash: fullHash, role: 'admin' };
  } else if (!user) {
    return c.json({ error: 'Неверный логин или пароль' }, 401);
  } else {
    const calculatedHash = await hashPassword(password, user.password_hash);
    if (calculatedHash !== user.password_hash) {
      return c.json({ error: 'Неверный логин или пароль' }, 401);
    }
  }

  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).bind(sessionId, user.id, expiresAt, Math.floor(Date.now() / 1000)).run();

  setCookie(c, 'music_session', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  return c.json({ status: 'ok', user: { id: user.id, username: user.username, role: user.role } });
});

app.get('/api/auth/me', requireAuth, (c) => {
  return c.json({ user: c.get('user') });
});

app.post('/api/auth/logout', requireAuth, async (c) => {
  const sessionId = getCookie(c, 'music_session');
  if (sessionId) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    deleteCookie(c, 'music_session');
  }
  return c.json({ status: 'ok' });
});

// --- Users Management ---
app.get('/api/users', requireAuth, requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC').all();
  return c.json({ users: results });
});

app.post('/api/users', requireAuth, requireAdmin, async (c) => {
  const { username, password, role } = await c.req.json().catch(() => ({}));
  if (!username || !password) return c.json({ error: 'Заполните логин и пароль' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) return c.json({ error: 'Пользователь уже существует' }, 400);

  const fullHash = await hashPassword(password);
  const userId = 'usr_' + crypto.randomUUID().slice(0, 8);
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, username, fullHash, role || 'user', now).run();

  return c.json({ status: 'ok' });
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (c) => {
  const userId = c.req.param('id');
  const currentUser = c.get('user');

  if (userId === currentUser.id) {
    return c.json({ error: 'Нельзя удалить самого себя' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

  return c.json({ status: 'ok' });
});

// --- Tracks API ---
app.get('/api/tracks', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    const { results } = await c.env.DB.prepare(
      'SELECT id, title, artist, album, mime_type, file_size, created_at FROM tracks WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(user.id).all();

    return c.json({ tracks: results || [] });
  } catch (err: any) {
    console.error('Ошибка получения списка треков:', err);
    return c.json({ error: 'Не удалось загрузить список треков' }, 500);
  }
});

app.get('/api/tracks/:id/stream', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    const trackId = c.req.param('id');

    const track = await c.env.DB.prepare(
      'SELECT r2_key, mime_type, file_size FROM tracks WHERE id = ? AND user_id = ?'
    ).bind(trackId, user.id).first<{ r2_key: string; mime_type: string; file_size: number }>();

    if (!track) return c.text('Track not found', 404);

    const rangeHeader = c.req.header('Range');

    if (!rangeHeader) {
      const object = await c.env.R2_BUCKET.get(track.r2_key);
      if (!object) return c.text('File missing in R2', 404);

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Content-Type', track.mime_type || 'audio/mpeg');
      headers.set('Content-Length', track.file_size.toString());

      return new Response(object.body, { headers });
    }

    const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
    if (!match) return c.text('Invalid Range Header', 416);

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : track.file_size - 1;

    if (start >= track.file_size || end >= track.file_size) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${track.file_size}` },
      });
    }

    const object = await c.env.R2_BUCKET.get(track.r2_key, {
      range: { offset: start, length: end - start + 1 },
    });

    if (!object) return c.text('File missing in R2', 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Type', track.mime_type || 'audio/mpeg');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Range', `bytes ${start}-${end}/${track.file_size}`);
    headers.set('Content-Length', (end - start + 1).toString());

    return new Response(object.body, { status: 206, headers });
  } catch (err: any) {
    console.error('Ошибка стриминга:', err);
    return c.text('Internal Error', 500);
  }
});

app.post('/api/tracks', requireAuth, async (c) => {
  try {
    const user = c.get('user');
    const formData = await c.req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return c.json({ error: 'Файл не выбран' }, 400);
    }

    const trackId = crypto.randomUUID();
    const fileName = file.name || 'track.mp3';
    const parts = fileName.split('.');
    const fileExtension = parts.length > 1 ? parts.pop()! : 'mp3';
    const r2Key = `tracks/${user.id}/${trackId}.${fileExtension}`;

    // Загрузка файла в R2 бакет
    const arrayBuffer = await file.arrayBuffer();
    await c.env.R2_BUCKET.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'audio/mpeg' },
    });

    // Извлечение полей с дефолтными значениями (гарантия NOT NULL)
    const title = ((formData.get('title') as string) || '').trim() || fileName;
    const artist = ((formData.get('artist') as string) || '').trim() || 'Unknown Artist';
    const album = ((formData.get('album') as string) || '').trim() || 'Unknown Album';
    const mimeType = file.type || 'audio/mpeg';
    const fileSize = file.size || arrayBuffer.byteLength || 0;
    const now = Math.floor(Date.now() / 1000);

    // Запись в D1 с учетом структуры таблицы
    await c.env.DB.prepare(`
      INSERT INTO tracks (
        id, user_id, title, artist, album, mime_type, file_size,
        file_extension, r2_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      trackId,
      user.id,
      title,
      artist,
      album,
      mimeType,
      fileSize,
      fileExtension,
      r2Key,
      now,
      now
    ).run();

    return c.json({ id: trackId, title, artist, album });
  } catch (err: any) {
    console.error('Ошибка при загрузке трека:', err);
    return c.json({ error: err?.message || 'Ошибка сервера при сохранении трека' }, 500);
  }
});

export default app;