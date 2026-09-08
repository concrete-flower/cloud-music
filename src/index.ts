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
    if (session) {
      await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(session.id).run();
    }
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
app.get('/manifest.webmanifest', (c) => {
  return c.json({
    name: 'Music Cloud',
    short_name: 'Music Cloud',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
  });
});

app.get('/icon.svg', (c) => {
  return c.body(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <rect width="512" height="512" rx="112" fill="#111"/>
      <circle cx="256" cy="256" r="150" fill="none" stroke="#fff" stroke-width="34"/>
      <circle cx="256" cy="256" r="48" fill="#fff"/>
      <path d="M256 106v150" stroke="#fff" stroke-width="34" stroke-linecap="round"/>
    </svg>`,
    200,
    { 'Content-Type': 'image/svg+xml; charset=UTF-8' }
  );
});

app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="apple-mobile-web-app-title" content="Music Cloud">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <title>Music Cloud</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #000;
      --surface: #171719;
      --surface-2: #222224;
      --text: #f5f5f7;
      --muted: #8e8e93;
      --accent: #fff;
      --line: rgba(255,255,255,.09);
      --nav-height: 76px;
      --mini-height: 68px;
    }

    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

    html, body {
      margin: 0;
      min-height: 100%;
      background: var(--bg);
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
      color: var(--text);
      overscroll-behavior-y: none;
    }

    button, input { font: inherit; }

    button {
      border: 0;
      color: inherit;
      cursor: pointer;
    }

    .hidden { display: none !important; }

    #login-screen {
      width: min(420px, 100%);
      min-height: 100dvh;
      margin: 0 auto;
      padding: 32px 20px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .login-logo {
      width: 72px;
      height: 72px;
      margin: 0 auto 28px;
      border-radius: 22px;
      background: #171719;
      display: grid;
      place-items: center;
      font-size: 32px;
    }

    .login-title { margin: 0 0 8px; text-align: center; font-size: 28px; letter-spacing: -.7px; }
    .login-subtitle { margin: 0 0 28px; text-align: center; color: var(--muted); font-size: 14px; }

    .login-form { display: grid; gap: 10px; }

    input, select {
      width: 100%;
      height: 48px;
      padding: 0 14px;
      border: 1px solid transparent;
      border-radius: 12px;
      outline: none;
      background: var(--surface);
      color: var(--text);
    }

    input:focus, select:focus { border-color: rgba(255,255,255,.2); }

    .primary-button {
      height: 48px;
      border-radius: 12px;
      background: var(--accent);
      color: #000;
      font-weight: 650;
    }

    .app-shell {
      min-height: 100dvh;
      width: min(760px, 100%);
      margin: 0 auto;
      padding: env(safe-area-inset-top) 18px calc(var(--nav-height) + 24px + env(safe-area-inset-bottom));
    }

    .topbar {
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand { font-size: 20px; font-weight: 700; letter-spacing: -.4px; }
    .user-button {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--surface);
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    .view { padding-top: 10px; }
    .view-title { margin: 12px 0 20px; font-size: 32px; line-height: 1.05; letter-spacing: -1.1px; }
    .section-title { margin: 28px 0 12px; font-size: 19px; letter-spacing: -.3px; }

    .hero {
      text-align: center;
      padding: 18px 0 8px;
    }

    .artwork {
      width: min(78vw, 330px);
      aspect-ratio: 1;
      margin: 0 auto;
      border-radius: 18px;
      background:
        radial-gradient(circle at 30% 25%, #777 0, #39393d 22%, transparent 23%),
        radial-gradient(circle at 70% 70%, #444 0, #19191b 48%, #0c0c0d 100%);
      box-shadow: 0 22px 60px rgba(0,0,0,.55);
      display: grid;
      place-items: center;
      font-size: 62px;
      color: rgba(255,255,255,.78);
      overflow: hidden;
    }

    .hero-title {
      margin: 22px 0 5px;
      font-size: 25px;
      font-weight: 700;
      letter-spacing: -.6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .hero-subtitle {
      color: var(--muted);
      font-size: 15px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .progress-wrap { margin: 26px 2px 8px; }
    input[type="range"] {
      appearance: none;
      width: 100%;
      height: 4px;
      padding: 0;
      border: 0;
      border-radius: 2px;
      background: #4a4a4c;
    }

    input[type="range"]::-webkit-slider-thumb {
      appearance: none;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: #fff;
    }

    .time-row {
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 11px;
      margin-top: 7px;
    }

    .controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 28px;
      margin: 22px 0 10px;
    }

    .icon-button {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: transparent;
      display: grid;
      place-items: center;
      font-size: 23px;
    }

    .play-button {
      width: 62px;
      height: 62px;
      border-radius: 50%;
      background: #fff;
      color: #000;
      display: grid;
      place-items: center;
      font-size: 24px;
      padding-left: 3px;
    }

    .sub-controls {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-top: 2px;
      color: var(--muted);
    }

    .sub-controls button {
      background: transparent;
      font-size: 13px;
      padding: 8px;
    }

    .track-list { display: grid; gap: 2px; }

    .track-row {
      width: 100%;
      min-height: 64px;
      padding: 8px 4px;
      border-radius: 12px;
      background: transparent;
      display: flex;
      align-items: center;
      gap: 12px;
      text-align: left;
    }

    .track-row:active { background: var(--surface); }

    .track-thumb {
      width: 48px;
      height: 48px;
      flex: 0 0 48px;
      border-radius: 8px;
      background: var(--surface);
      display: grid;
      place-items: center;
      color: var(--muted);
      font-size: 20px;
    }

    .track-info { min-width: 0; flex: 1; }
    .track-name {
      font-size: 15px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .track-meta {
      margin-top: 3px;
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .track-more {
      width: 32px;
      background: transparent;
      color: var(--muted);
      font-size: 20px;
    }

    .empty {
      padding: 50px 20px;
      text-align: center;
      color: var(--muted);
    }

    .card {
      padding: 16px;
      border-radius: 16px;
      background: var(--surface);
      margin-bottom: 12px;
    }

    .form { display: grid; gap: 10px; }
    .form h2 { margin: 0 0 4px; font-size: 18px; }
    .secondary-button, .danger-button {
      height: 44px;
      border-radius: 11px;
      background: var(--surface-2);
      font-weight: 600;
    }
    .danger-button { background: #3a1717; color: #ff6961; }

    .admin-user {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid var(--line);
    }

    .admin-user:last-child { border-bottom: 0; }
    .admin-user-name { font-size: 14px; }
    .admin-user-role { color: var(--muted); font-size: 12px; margin-top: 2px; }

    .mini-player {
      position: fixed;
      z-index: 20;
      left: 10px;
      right: 10px;
      bottom: calc(var(--nav-height) + env(safe-area-inset-bottom) + 8px);
      height: var(--mini-height);
      padding: 8px 10px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 14px;
      background: rgba(28,28,30,.94);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 10px 35px rgba(0,0,0,.4);
    }

    .mini-art {
      width: 50px;
      height: 50px;
      flex: 0 0 50px;
      border-radius: 8px;
      background: var(--surface-2);
      display: grid;
      place-items: center;
    }

    .mini-info { min-width: 0; flex: 1; }
    .mini-title, .mini-artist {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mini-title { font-size: 14px; font-weight: 650; }
    .mini-artist { margin-top: 2px; color: var(--muted); font-size: 12px; }
    .mini-play { width: 42px; height: 42px; background: transparent; font-size: 21px; }
    .mini-next { width: 36px; height: 42px; background: transparent; font-size: 17px; }

    .bottom-nav {
      position: fixed;
      z-index: 21;
      left: 0;
      right: 0;
      bottom: 0;
      height: calc(var(--nav-height) + env(safe-area-inset-bottom));
      padding: 5px 14px env(safe-area-inset-bottom);
      background: rgba(10,10,10,.9);
      border-top: 1px solid var(--line);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
      display: flex;
      justify-content: center;
      gap: 12px;
    }

    .nav-button {
      width: min(140px, 45%);
      background: transparent;
      color: var(--muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
    }

    .nav-button.active { color: #fff; }
    .nav-icon { font-size: 22px; line-height: 1; }

    @media (min-width: 700px) {
      .app-shell { padding-left: 28px; padding-right: 28px; }
      .mini-player { left: 50%; right: auto; width: 520px; transform: translateX(-50%); }
    }
  </style>
</head>
<body>
  <section id="login-screen" class="hidden">
    <div class="login-logo">♫</div>
    <h1 class="login-title">Music Cloud</h1>
    <p class="login-subtitle">Твоя музыка. Без подписки.</p>
    <form id="login-form" class="login-form">
      <input type="text" id="login-username" placeholder="Логин" autocomplete="username" required>
      <input type="password" id="login-password" placeholder="Пароль" autocomplete="current-password" required>
      <button class="primary-button" type="submit">Войти</button>
    </form>
    <div id="login-error" class="hidden" style="color:#ff453a;font-size:14px;margin-top:12px;text-align:center;"></div>
  </section>

  <main id="app-screen" class="app-shell hidden">
    <header class="topbar">
      <div class="brand">Music Cloud</div>
      <button class="user-button" id="user-button" aria-label="Профиль"></button>
    </header>

    <section id="home-view" class="view">
      <div class="hero">
        <div class="artwork" id="hero-art">♫</div>
        <div class="hero-title" id="hero-title">Ничего не играет</div>
        <div class="hero-subtitle" id="hero-subtitle">Выбери трек из библиотеки</div>

        <div class="progress-wrap">
          <input id="progress" type="range" min="0" max="1000" value="0" aria-label="Позиция">
          <div class="time-row">
            <span id="current-time">0:00</span>
            <span id="total-time">0:00</span>
          </div>
        </div>

        <div class="controls">
          <button class="icon-button" id="prev-button" aria-label="Предыдущий">↶</button>
          <button class="play-button" id="play-button" aria-label="Воспроизвести">▶</button>
          <button class="icon-button" id="next-button" aria-label="Следующий">↷</button>
        </div>

        <div class="sub-controls">
          <button id="shuffle-button">Перемешать</button>
          <button id="repeat-button">Повтор: выкл.</button>
        </div>
      </div>

      <h2 class="section-title">Недавно добавленные</h2>
      <div id="recent-list" class="track-list"></div>
    </section>

    <section id="library-view" class="view hidden">
      <h1 class="view-title">Медиатека</h1>
      <div id="library-list" class="track-list"></div>
    </section>

    <section id="more-view" class="view hidden">
      <h1 class="view-title">Ещё</h1>

      <div class="card">
        <form id="upload-form" class="form">
          <h2>Добавить музыку</h2>
          <input type="file" id="upload-file" accept="audio/*" required>
          <input type="text" id="upload-title" placeholder="Название">
          <input type="text" id="upload-artist" placeholder="Исполнитель">
          <input type="text" id="upload-album" placeholder="Альбом">
          <button type="submit" id="upload-btn" class="primary-button">Загрузить</button>
        </form>
      </div>

      <div id="admin-section" class="card hidden">
        <form id="create-user-form" class="form">
          <h2>Пользователи</h2>
          <input type="text" id="new-username" placeholder="Новый логин" required>
          <input type="password" id="new-password" placeholder="Пароль" required>
          <select id="new-role">
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
          </select>
          <button type="submit" class="secondary-button">Создать пользователя</button>
        </form>
        <div id="users-list" style="margin-top:14px;"></div>
      </div>

      <button id="logout-button" class="secondary-button" style="width:100%;margin-top:4px;">Выйти</button>
    </section>
  </main>

  <div id="mini-player" class="mini-player hidden">
    <div class="mini-art">♫</div>
    <div class="mini-info">
      <div id="mini-title" class="mini-title"></div>
      <div id="mini-artist" class="mini-artist"></div>
    </div>
    <button id="mini-play" class="mini-play" aria-label="Воспроизвести">▶</button>
    <button id="mini-next" class="mini-next" aria-label="Следующий">↷</button>
  </div>

  <nav id="bottom-nav" class="bottom-nav hidden" aria-label="Навигация">
    <button class="nav-button active" data-view="home-view">
      <span class="nav-icon">⌂</span>
      <span>Слушать</span>
    </button>
    <button class="nav-button" data-view="library-view">
      <span class="nav-icon">♫</span>
      <span>Медиатека</span>
    </button>
    <button class="nav-button" data-view="more-view">
      <span class="nav-icon">•••</span>
      <span>Ещё</span>
    </button>
  </nav>

  <audio id="audio-player" preload="metadata" playsinline></audio>

  <script>
    const audio = document.getElementById('audio-player');
    const state = {
      user: null,
      tracks: [],
      currentIndex: -1,
      shuffle: false,
      repeat: false,
      view: 'home-view'
    };

    const $ = (id) => document.getElementById(id);

    function formatTime(value) {
      if (!Number.isFinite(value) || value < 0) return '0:00';
      const total = Math.floor(value);
      const minutes = Math.floor(total / 60);
      const seconds = String(total % 60).padStart(2, '0');
      return minutes + ':' + seconds;
    }

    function setText(id, value) {
      $(id).textContent = value ?? '';
    }

    function trackArtist(track) {
      return track.artist || 'Unknown Artist';
    }

    function trackAlbum(track) {
      return track.album || 'Unknown Album';
    }

    function renderTrackRow(track, index) {
      const row = document.createElement('button');
      row.className = 'track-row';
      row.type = 'button';

      const thumb = document.createElement('span');
      thumb.className = 'track-thumb';
      thumb.textContent = '♫';

      const info = document.createElement('span');
      info.className = 'track-info';

      const title = document.createElement('span');
      title.className = 'track-name';
      title.textContent = track.title || 'Untitled';

      const meta = document.createElement('span');
      meta.className = 'track-meta';
      meta.textContent = trackArtist(track) + ' — ' + trackAlbum(track);

      info.append(title, meta);
      row.append(thumb, info);

      const more = document.createElement('span');
      more.className = 'track-more';
      more.textContent = '•••';
      more.setAttribute('aria-hidden', 'true');
      row.append(more);

      row.addEventListener('click', () => playTrack(index));
      return row;
    }

    function renderLists() {
      const recent = $('recent-list');
      const library = $('library-list');
      recent.replaceChildren();
      library.replaceChildren();

      if (!state.tracks.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Библиотека пока пуста';
        recent.append(empty);
        library.append(empty.cloneNode(true));
        return;
      }

      state.tracks.forEach((track, index) => {
        library.append(renderTrackRow(track, index));
      });

      state.tracks.slice(0, 5).forEach((track) => {
        const index = state.tracks.indexOf(track);
        recent.append(renderTrackRow(track, index));
      });
    }

    function updateNowPlaying() {
      const track = state.tracks[state.currentIndex];
      const hasTrack = Boolean(track);

      $('mini-player').classList.toggle('hidden', !hasTrack);
      if (!hasTrack) {
        setText('hero-title', 'Ничего не играет');
        setText('hero-subtitle', 'Выбери трек из библиотеки');
        return;
      }

      const title = track.title || 'Untitled';
      const subtitle = trackArtist(track) + ' — ' + trackAlbum(track);

      setText('hero-title', title);
      setText('hero-subtitle', subtitle);
      setText('mini-title', title);
      setText('mini-artist', subtitle);

      $('play-button').textContent = audio.paused ? '▶' : 'Ⅱ';
      $('mini-play').textContent = audio.paused ? '▶' : 'Ⅱ';
      $('progress').value = audio.duration ? Math.round((audio.currentTime / audio.duration) * 1000) : 0;
      setText('current-time', formatTime(audio.currentTime));
      setText('total-time', formatTime(audio.duration));
    }

    async function playTrack(index) {
      if (!state.tracks[index]) return;

      state.currentIndex = index;
      const track = state.tracks[index];
      audio.src = '/api/tracks/' + encodeURIComponent(track.id) + '/stream';
      updateNowPlaying();

      try {
        await audio.play();
      } catch {
        // Safari may reject autoplay; the selected track remains loaded.
      }

      updateNowPlaying();
    }

    async function togglePlay() {
      if (state.currentIndex < 0 && state.tracks.length) {
        await playTrack(0);
        return;
      }

      if (audio.paused) {
        try { await audio.play(); } catch {}
      } else {
        audio.pause();
      }
      updateNowPlaying();
    }

    function nextTrack() {
      if (!state.tracks.length) return;

      if (state.shuffle && state.tracks.length > 1) {
        let next;
        do { next = Math.floor(Math.random() * state.tracks.length); }
        while (next === state.currentIndex);
        playTrack(next);
        return;
      }

      const next = state.currentIndex + 1;
      if (next < state.tracks.length) {
        playTrack(next);
      } else if (state.repeat) {
        playTrack(0);
      }
    }

    function previousTrack() {
      if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
      }
      const previous = state.currentIndex - 1;
      if (previous >= 0) playTrack(previous);
    }

    function switchView(viewId) {
      state.view = viewId;
      ['home-view', 'library-view', 'more-view'].forEach(id => {
        $(id).classList.toggle('hidden', id !== viewId);
      });

      document.querySelectorAll('.nav-button').forEach(button => {
        button.classList.toggle('active', button.dataset.view === viewId);
      });

      window.scrollTo(0, 0);
    }

    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) throw new Error();
        const data = await res.json();
        state.user = data.user;
        showApp();
      } catch {
        showLogin();
      }
    }

    function showLogin() {
      $('login-screen').classList.remove('hidden');
      $('app-screen').classList.add('hidden');
      $('bottom-nav').classList.add('hidden');
      $('mini-player').classList.add('hidden');
    }

    function showApp() {
      $('login-screen').classList.add('hidden');
      $('app-screen').classList.remove('hidden');
      $('bottom-nav').classList.remove('hidden');
      $('user-button').textContent = (state.user.username || '?').slice(0, 1).toUpperCase();
      $('admin-section').classList.toggle('hidden', state.user.role !== 'admin');
      loadTracks();
      if (state.user.role === 'admin') loadUsers();
    }

    async function loadTracks() {
      try {
        const res = await fetch('/api/tracks');
        if (!res.ok) return;
        const data = await res.json();
        state.tracks = data.tracks || [];

        if (state.currentIndex >= state.tracks.length) {
          state.currentIndex = -1;
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        }

        renderLists();
        updateNowPlaying();
      } catch {
        // Keep the current UI if the network disappears.
      }
    }

    $('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const username = $('login-username').value.trim();
      const password = $('login-password').value;
      $('login-error').classList.add('hidden');

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setText('login-error', data.error || 'Ошибка входа');
          $('login-error').classList.remove('hidden');
          return;
        }

        await checkAuth();
      } catch {
        setText('login-error', 'Не удалось подключиться к серверу');
        $('login-error').classList.remove('hidden');
      }
    });

    async function logout() {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      state.user = null;
      state.tracks = [];
      state.currentIndex = -1;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      showLogin();
    }

    $('logout-button').addEventListener('click', logout);
    $('user-button').addEventListener('click', () => switchView('more-view'));
    $('play-button').addEventListener('click', togglePlay);
    $('mini-play').addEventListener('click', togglePlay);
    $('next-button').addEventListener('click', nextTrack);
    $('mini-next').addEventListener('click', nextTrack);
    $('prev-button').addEventListener('click', previousTrack);

    $('shuffle-button').addEventListener('click', () => {
      state.shuffle = !state.shuffle;
      $('shuffle-button').textContent = state.shuffle ? 'Перемешать: вкл.' : 'Перемешать';
    });

    $('repeat-button').addEventListener('click', () => {
      state.repeat = !state.repeat;
      $('repeat-button').textContent = state.repeat ? 'Повтор: вкл.' : 'Повтор: выкл.';
    });

    $('progress').addEventListener('input', () => {
      if (audio.duration) {
        audio.currentTime = (Number($('progress').value) / 1000) * audio.duration;
      }
    });

    $('mini-player').addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      switchView('home-view');
    });

    document.querySelectorAll('.nav-button').forEach(button => {
      button.addEventListener('click', () => switchView(button.dataset.view));
    });

    audio.addEventListener('play', updateNowPlaying);
    audio.addEventListener('pause', updateNowPlaying);
    audio.addEventListener('loadedmetadata', updateNowPlaying);
    audio.addEventListener('timeupdate', updateNowPlaying);
    audio.addEventListener('ended', () => {
      if (state.repeat && state.currentIndex >= 0 && !state.shuffle) {
        playTrack(state.currentIndex);
      } else {
        nextTrack();
      }
    });

    $('upload-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const file = $('upload-file').files[0];
      if (!file) return;

      const button = $('upload-btn');
      button.disabled = true;
      button.textContent = 'Загрузка…';

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', $('upload-title').value);
        formData.append('artist', $('upload-artist').value);
        formData.append('album', $('upload-album').value);

        const res = await fetch('/api/tracks', { method: 'POST', body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || 'Ошибка загрузки');
          return;
        }

        $('upload-form').reset();
        await loadTracks();
        switchView('library-view');
      } catch {
        alert('Не удалось загрузить файл');
      } finally {
        button.disabled = false;
        button.textContent = 'Загрузить';
      }
    });

    async function loadUsers() {
      const res = await fetch('/api/users');
      if (!res.ok) return;
      const data = await res.json();
      const container = $('users-list');
      container.replaceChildren();

      (data.users || []).forEach(user => {
        const row = document.createElement('div');
        row.className = 'admin-user';

        const info = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'admin-user-name';
        name.textContent = user.username;
        const role = document.createElement('div');
        role.className = 'admin-user-role';
        role.textContent = user.role;
        info.append(name, role);
        row.append(info);

        if (user.username !== state.user.username) {
          const button = document.createElement('button');
          button.className = 'danger-button';
          button.textContent = 'Удалить';
          button.style.height = '34px';
          button.style.padding = '0 12px';
          button.addEventListener('click', () => deleteUser(user.id));
          row.append(button);
        }

        container.append(row);
      });
    }

    $('create-user-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: $('new-username').value.trim(),
          password: $('new-password').value,
          role: $('new-role').value
        })
      });

      if (res.ok) {
        $('create-user-form').reset();
        await loadUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Ошибка создания пользователя');
      }
    });

    async function deleteUser(id) {
      if (!confirm('Удалить пользователя?')) return;

      const res = await fetch('/api/users/' + encodeURIComponent(id), { method: 'DELETE' });
      if (res.ok) {
        loadUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Ошибка удаления');
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

  if (role && role !== 'admin' && role !== 'user') {
    return c.json({ error: 'Недопустимая роль' }, 400);
  }

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

    const commonHeaders = {
      'Accept-Ranges': 'bytes',
      'Content-Type': track.mime_type || 'audio/mpeg',
      'Cache-Control': 'private, no-store',
    };

    if (!rangeHeader) {
      const object = await c.env.R2_BUCKET.get(track.r2_key);
      if (!object) return c.text('File missing in R2', 404);

      const headers = new Headers(commonHeaders);
      object.writeHttpMetadata(headers);
      headers.set('Content-Length', track.file_size.toString());

      return new Response(object.body, { headers });
    }

    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (!match[1] && !match[2])) {
      return c.text('Invalid Range Header', 416);
    }

    let start: number;
    let end: number;

    if (match[1]) {
      start = parseInt(match[1], 10);
      end = match[2] ? parseInt(match[2], 10) : track.file_size - 1;
    } else {
      const suffixLength = parseInt(match[2], 10);
      if (!suffixLength) {
        return new Response('Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${track.file_size}` },
        });
      }
      start = Math.max(track.file_size - suffixLength, 0);
      end = track.file_size - 1;
    }

    if (start >= track.file_size || start > end) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${track.file_size}` },
      });
    }

    end = Math.min(end, track.file_size - 1);

    const object = await c.env.R2_BUCKET.get(track.r2_key, {
      range: { offset: start, length: end - start + 1 },
    });

    if (!object) return c.text('File missing in R2', 404);

    const headers = new Headers(commonHeaders);
    object.writeHttpMetadata(headers);
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

    // Upload to R2 first; remove the object if metadata persistence fails.
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
    try {
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
    } catch (dbError) {
      await c.env.R2_BUCKET.delete(r2Key);
      throw dbError;
    }

    return c.json({ id: trackId, title, artist, album });
  } catch (err: any) {
    console.error('Ошибка при загрузке трека:', err);
    return c.json({ error: err?.message || 'Ошибка сервера при сохранении трека' }, 500);
  }
});

export default app;