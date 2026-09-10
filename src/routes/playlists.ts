import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../auth';

export const playlistRoutes = new Hono<AppEnv>();

playlistRoutes.use('*', requireAuth);

playlistRoutes.get('/', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.description, p.created_at,
            (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) as track_count
     FROM playlists p
     WHERE p.user_id = ?
     ORDER BY p.created_at DESC`
  )
    .bind(user.id)
    .all();

  return c.json({ playlists: results });
});

playlistRoutes.post('/', async (c) => {
  const user = c.get('user');
  const { name, description } = await c.req.json().catch(() => ({}) as any);
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return c.json({ error: 'Enter a playlist name' }, 400);

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    'INSERT INTO playlists (id, user_id, name, description, is_shared, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
  )
    .bind(id, user.id, trimmedName, String(description || '').trim() || null, now, now)
    .run();

  return c.json({ id, name: trimmedName });
});

// Find-or-create the user's single "Liked Songs" playlist. Registered before
// GET /:id so "liked" is never swallowed as a playlist id param.
playlistRoutes.get('/liked', async (c) => {
  const user = c.get('user');

  try {
    let liked = await c.env.DB.prepare("SELECT id FROM playlists WHERE user_id = ? AND system_key = 'liked'")
      .bind(user.id)
      .first<{ id: string }>();

    if (!liked) {
      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await c.env.DB.prepare(
        "INSERT INTO playlists (id, user_id, name, is_shared, system_key, created_at, updated_at) VALUES (?, ?, 'Liked Songs', 0, 'liked', ?, ?)"
      )
        .bind(id, user.id, now, now)
        .run();
      liked = { id };
    }

    const { results } = await c.env.DB.prepare(
      'SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC'
    )
      .bind(liked.id)
      .all<{ track_id: string }>();

    return c.json({ id: liked.id, track_ids: (results || []).map((r) => r.track_id) });
  } catch (err: any) {
    console.error('Failed to load/create Liked Songs:', err);
    // Most likely cause: migrations/0004_shares_and_liked_songs.sql hasn't
    // been applied to this database yet (no "system_key" column).
    return c.json({ error: 'Could not load Liked Songs -- has the latest database migration been applied?' }, 500);
  }
});

playlistRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const playlist = await c.env.DB.prepare('SELECT id, name, description, created_at FROM playlists WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first();
  if (!playlist) return c.json({ error: 'Playlist not found' }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.title, t.artist, t.album, t.duration_seconds, t.cover_key, pt.position
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     WHERE pt.playlist_id = ? AND t.status = 'ready'
     ORDER BY pt.position ASC`
  )
    .bind(id)
    .all<any>();

  const tracks = (results || []).map((t) => ({ ...t, cover_url: t.cover_key ? `/api/tracks/${t.id}/cover` : null }));

  return c.json({ playlist, tracks });
});

playlistRoutes.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { name, description } = await c.req.json().catch(() => ({}) as any);

  const playlist = await c.env.DB.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!playlist) return c.json({ error: 'Playlist not found' }, 404);

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare('UPDATE playlists SET name = COALESCE(?, name), description = ?, updated_at = ? WHERE id = ?')
    .bind(name ? String(name).trim() : null, description !== undefined ? String(description || '').trim() || null : null, now, id)
    .run();

  return c.json({ status: 'ok' });
});

playlistRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const playlist = await c.env.DB.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!playlist) return c.json({ error: 'Playlist not found' }, 404);

  await c.env.DB.prepare('DELETE FROM playlists WHERE id = ?').bind(id).run();
  return c.json({ status: 'ok' });
});

playlistRoutes.post('/:id/tracks', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { track_id } = await c.req.json().catch(() => ({}) as any);
  if (!track_id) return c.json({ error: 'Missing track id' }, 400);

  const playlist = await c.env.DB.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!playlist) return c.json({ error: 'Playlist not found' }, 404);

  const track = await c.env.DB.prepare("SELECT id FROM tracks WHERE id = ? AND user_id = ? AND status = 'ready'")
    .bind(track_id, user.id)
    .first();
  if (!track) return c.json({ error: 'Track not found' }, 404);

  const last = await c.env.DB.prepare('SELECT MAX(position) as max_pos FROM playlist_tracks WHERE playlist_id = ?')
    .bind(id)
    .first<{ max_pos: number | null }>();
  const nextPosition = (last?.max_pos ?? -1) + 1;

  await c.env.DB.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)')
    .bind(id, track_id, nextPosition)
    .run();

  return c.json({ status: 'ok' });
});

playlistRoutes.delete('/:id/tracks/:trackId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const trackId = c.req.param('trackId');

  const playlist = await c.env.DB.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!playlist) return c.json({ error: 'Playlist not found' }, 404);

  await c.env.DB.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').bind(id, trackId).run();
  return c.json({ status: 'ok' });
});

playlistRoutes.put('/:id/tracks/reorder', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { order } = await c.req.json().catch(() => ({}) as any);
  if (!Array.isArray(order)) return c.json({ error: 'Invalid order' }, 400);

  const playlist = await c.env.DB.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!playlist) return c.json({ error: 'Playlist not found' }, 404);

  const statements = order.map((trackId: string, index: number) =>
    c.env.DB.prepare('UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?').bind(index, id, trackId)
  );
  await c.env.DB.batch(statements);

  return c.json({ status: 'ok' });
});
