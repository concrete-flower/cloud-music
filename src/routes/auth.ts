import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { hashPassword, createSession, destroySession, requireAuth } from '../auth';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', async (c) => {
  const { username, password } = await c.req.json().catch(() => ({}) as any);
  if (!username || !password) return c.json({ error: 'Enter a username and password' }, 400);

  const userCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<any>();

  if (userCount?.count === 0) {
    // First account ever created on this deployment becomes the admin.
    const fullHash = await hashPassword(password);
    const userId = 'usr_' + crypto.randomUUID().slice(0, 8);
    const now = Math.floor(Date.now() / 1000);

    await c.env.DB.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, username, fullHash, 'admin', now)
      .run();

    user = { id: userId, username, password_hash: fullHash, role: 'admin' };
  } else if (!user) {
    return c.json({ error: 'Incorrect username or password' }, 401);
  } else {
    const calculatedHash = await hashPassword(password, user.password_hash);
    if (calculatedHash !== user.password_hash) {
      return c.json({ error: 'Incorrect username or password' }, 401);
    }
  }

  await createSession(c, user.id);

  return c.json({ status: 'ok', user: { id: user.id, username: user.username, role: user.role } });
});

authRoutes.get('/me', requireAuth, (c) => {
  return c.json({ user: c.get('user') });
});

authRoutes.post('/logout', requireAuth, async (c) => {
  await destroySession(c);
  return c.json({ status: 'ok' });
});
