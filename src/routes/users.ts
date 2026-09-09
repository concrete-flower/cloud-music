import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth, requireAdmin, hashPassword } from '../auth';

export const userRoutes = new Hono<AppEnv>();

userRoutes.use('*', requireAuth, requireAdmin);

userRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC'
  ).all();
  return c.json({ users: results });
});

userRoutes.post('/', async (c) => {
  const { username, password, role } = await c.req.json().catch(() => ({}) as any);
  if (!username || !password) return c.json({ error: 'Enter a username and password' }, 400);
  if (password.length < 6) return c.json({ error: 'Password is too short (min. 6 characters)' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) return c.json({ error: 'That username is already taken' }, 400);

  if (role && role !== 'admin' && role !== 'user') {
    return c.json({ error: 'Invalid role' }, 400);
  }

  const fullHash = await hashPassword(password);
  const userId = 'usr_' + crypto.randomUUID().slice(0, 8);
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, username, fullHash, role || 'user', now)
    .run();

  return c.json({ status: 'ok', user: { id: userId, username, role: role || 'user' } });
});

userRoutes.delete('/:id', async (c) => {
  const userId = c.req.param('id');
  const currentUser = c.get('user');

  if (userId === currentUser.id) {
    return c.json({ error: "You can't delete your own account" }, 400);
  }

  // Clean up the user's R2 objects (tracks + covers) before dropping the row;
  // D1 foreign keys cascade the tracks/playlists rows themselves.
  const { results } = await c.env.DB.prepare('SELECT r2_key, cover_key FROM tracks WHERE user_id = ?')
    .bind(userId)
    .all<{ r2_key: string; cover_key: string | null }>();

  for (const row of results || []) {
    await c.env.R2_BUCKET.delete(row.r2_key).catch(() => {});
    if (row.cover_key) await c.env.R2_BUCKET.delete(row.cover_key).catch(() => {});
  }

  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

  return c.json({ status: 'ok' });
});
