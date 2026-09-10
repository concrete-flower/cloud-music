import { Hono } from 'hono';
import type { AppEnv, Bindings, TrackRow } from '../types';
import { requireAuth } from '../auth';
import { streamR2Object, coverResponse } from '../streaming';

const SHARE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type ShareRow = {
  token: string;
  owner_user_id: string;
  kind: 'track' | 'playlist';
  target_id: string;
  expires_at: number | null;
};

async function loadShare(env: Bindings, token: string): Promise<ShareRow | null> {
  const share = await env.DB.prepare('SELECT * FROM shares WHERE token = ?').bind(token).first<ShareRow>();
  if (!share) return null;
  if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) return null;
  return share;
}

// --- Create a share link (authed) ---
export const shareRoutes = new Hono<AppEnv>();
shareRoutes.use('*', requireAuth);

shareRoutes.post('/', async (c) => {
  const user = c.get('user');
  const { kind, target_id } = await c.req.json().catch(() => ({}) as any);

  if (kind !== 'track' && kind !== 'playlist') return c.json({ error: 'Invalid share kind' }, 400);
  if (!target_id) return c.json({ error: 'Missing target id' }, 400);

  const table = kind === 'track' ? 'tracks' : 'playlists';
  const owned = await c.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`)
    .bind(target_id, user.id)
    .first();
  if (!owned) return c.json({ error: kind === 'track' ? 'Track not found' : 'Playlist not found' }, 404);

  const token = randomToken();
  const now = Math.floor(Date.now() / 1000);

  try {
    await c.env.DB.prepare(
      'INSERT INTO shares (token, owner_user_id, kind, target_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(token, user.id, kind, target_id, now, now + SHARE_TTL_SECONDS)
      .run();
  } catch (err: any) {
    console.error('Failed to create share:', err);
    // Most likely cause: migrations/0004_shares_and_liked_songs.sql hasn't
    // been applied to this database yet (no "shares" table).
    return c.json({ error: 'Could not create share link -- has the latest database migration been applied?' }, 500);
  }

  const origin = new URL(c.req.url).origin;
  return c.json({ token, url: `${origin}/s/${token}` });
});

// --- Public, token-authorized playback (no login required) ---
export const publicShareRoutes = new Hono<AppEnv>();

publicShareRoutes.get('/:token', async (c) => {
  const token = c.req.param('token');
  const share = await loadShare(c.env, token);
  if (!share) return c.json({ error: 'This link is invalid or has expired' }, 404);

  if (share.kind === 'track') {
    const track = await c.env.DB.prepare(
      "SELECT id, title, artist, album, cover_key, duration_seconds FROM tracks WHERE id = ? AND status = 'ready'"
    )
      .bind(share.target_id)
      .first<TrackRow>();
    if (!track) return c.json({ error: 'Track not found' }, 404);

    return c.json({
      kind: 'track',
      track: {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration_seconds: track.duration_seconds,
        cover_url: track.cover_key ? `/api/public/shares/${token}/cover` : null,
        stream_url: `/api/public/shares/${token}/stream`,
      },
    });
  }

  const playlist = await c.env.DB.prepare('SELECT id, name FROM playlists WHERE id = ?')
    .bind(share.target_id)
    .first<{ id: string; name: string }>();
  if (!playlist) return c.json({ error: 'Playlist not found' }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.title, t.artist, t.album, t.cover_key, t.duration_seconds
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     WHERE pt.playlist_id = ? AND t.status = 'ready'
     ORDER BY pt.position ASC`
  )
    .bind(playlist.id)
    .all<TrackRow>();

  const tracks = (results || []).map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration_seconds: t.duration_seconds,
    cover_url: t.cover_key ? `/api/public/shares/${token}/tracks/${t.id}/cover` : null,
    stream_url: `/api/public/shares/${token}/tracks/${t.id}/stream`,
  }));

  return c.json({ kind: 'playlist', playlist: { name: playlist.name }, tracks });
});

publicShareRoutes.get('/:token/stream', async (c) => {
  const token = c.req.param('token');
  const share = await loadShare(c.env, token);
  if (!share || share.kind !== 'track') return c.text('Not found', 404);

  const track = await c.env.DB.prepare(
    "SELECT r2_key, mime_type, file_size FROM tracks WHERE id = ? AND status = 'ready'"
  )
    .bind(share.target_id)
    .first<{ r2_key: string; mime_type: string; file_size: number }>();
  if (!track) return c.text('Not found', 404);

  return streamR2Object(c, track.r2_key, track.mime_type, track.file_size);
});

publicShareRoutes.get('/:token/cover', async (c) => {
  const token = c.req.param('token');
  const share = await loadShare(c.env, token);
  if (!share || share.kind !== 'track') return c.text('Not found', 404);

  const track = await c.env.DB.prepare('SELECT cover_key FROM tracks WHERE id = ?')
    .bind(share.target_id)
    .first<{ cover_key: string | null }>();
  return coverResponse(c.env, track ? track.cover_key : null);
});

publicShareRoutes.get('/:token/tracks/:trackId/stream', async (c) => {
  const token = c.req.param('token');
  const trackId = c.req.param('trackId');
  const share = await loadShare(c.env, token);
  if (!share || share.kind !== 'playlist') return c.text('Not found', 404);

  const track = await c.env.DB.prepare(
    `SELECT t.r2_key, t.mime_type, t.file_size FROM tracks t
     JOIN playlist_tracks pt ON pt.track_id = t.id
     WHERE t.id = ? AND pt.playlist_id = ? AND t.status = 'ready'`
  )
    .bind(trackId, share.target_id)
    .first<{ r2_key: string; mime_type: string; file_size: number }>();
  if (!track) return c.text('Not found', 404);

  return streamR2Object(c, track.r2_key, track.mime_type, track.file_size);
});

publicShareRoutes.get('/:token/tracks/:trackId/cover', async (c) => {
  const token = c.req.param('token');
  const trackId = c.req.param('trackId');
  const share = await loadShare(c.env, token);
  if (!share || share.kind !== 'playlist') return c.text('Not found', 404);

  const track = await c.env.DB.prepare(
    `SELECT t.cover_key FROM tracks t
     JOIN playlist_tracks pt ON pt.track_id = t.id
     WHERE t.id = ? AND pt.playlist_id = ?`
  )
    .bind(trackId, share.target_id)
    .first<{ cover_key: string | null }>();
  return coverResponse(c.env, track ? track.cover_key : null);
});
