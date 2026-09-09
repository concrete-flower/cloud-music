import { Hono } from 'hono';
import type { AppEnv, TrackRow } from '../types';
import { requireAuth } from '../auth';

export const trackRoutes = new Hono<AppEnv>();

trackRoutes.use('*', requireAuth);

// Sane upper bound so a single object can't blow past what a Worker+R2
// single-shot PUT should ever see. Cloudflare also enforces a platform-level
// request body size cap (100MB on Free/Pro, higher on Business/Enterprise) —
// that cap applies regardless of streaming, so very large lossless files may
// need a paid plan or a multipart-upload flow.
const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
const MAX_COVER_BYTES = 15 * 1024 * 1024;

function coverUrl(track: Pick<TrackRow, 'id' | 'cover_key'>): string | null {
  return track.cover_key ? `/api/tracks/${track.id}/cover` : null;
}

// --- List ---
trackRoutes.get('/', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, artist, album, album_artist, year, genre, track_number, disc_number,
            duration_seconds, mime_type, file_size, cover_key, created_at
     FROM tracks
     WHERE user_id = ? AND status = 'ready'
     ORDER BY created_at DESC`
  )
    .bind(user.id)
    .all<TrackRow>();

  const tracks = (results || []).map((t) => ({ ...t, cover_url: coverUrl(t) }));
  return c.json({ tracks });
});

// --- Create (metadata only, status=pending) ---
trackRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}) as any);

  const title = String(body.title || '').trim();
  const fileExtension = String(body.file_extension || 'mp3').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp3';
  const mimeType = String(body.mime_type || 'audio/mpeg');
  const fileSize = Number(body.file_size) || 0;

  if (!title) return c.json({ error: 'Missing track title' }, 400);
  if (fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'Invalid file size' }, 400);
  }

  const trackId = crypto.randomUUID();
  const r2Key = `tracks/${user.id}/${trackId}.${fileExtension}`;
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO tracks (
       id, user_id, title, artist, album, album_artist, year, genre,
       track_number, disc_number, duration_seconds,
       mime_type, file_size, file_extension, r2_key, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  )
    .bind(
      trackId,
      user.id,
      title,
      String(body.artist || '').trim() || 'Unknown Artist',
      String(body.album || '').trim() || null,
      String(body.album_artist || '').trim() || null,
      Number.isFinite(body.year) ? body.year : null,
      String(body.genre || '').trim() || null,
      Number.isFinite(body.track_number) ? body.track_number : null,
      Number.isFinite(body.disc_number) ? body.disc_number : null,
      Number.isFinite(body.duration_seconds) ? body.duration_seconds : null,
      mimeType,
      fileSize,
      fileExtension,
      r2Key,
      now,
      now
    )
    .run();

  return c.json({ id: trackId, upload_url: `/api/tracks/${trackId}/audio` });
});

// --- Upload raw audio bytes (streamed straight into R2) ---
trackRoutes.put('/:id/audio', async (c) => {
  const user = c.get('user');
  const trackId = c.req.param('id');

  const track = await c.env.DB.prepare('SELECT id, r2_key, mime_type, file_size FROM tracks WHERE id = ? AND user_id = ?')
    .bind(trackId, user.id)
    .first<{ id: string; r2_key: string; mime_type: string; file_size: number }>();

  if (!track) return c.json({ error: 'Track not found' }, 404);
  if (!c.req.raw.body) return c.json({ error: 'Empty request body' }, 400);

  const contentLength = Number(c.req.header('Content-Length') || 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'File is too large' }, 413);
  }

  try {
    await c.env.R2_BUCKET.put(track.r2_key, c.req.raw.body, {
      httpMetadata: { contentType: track.mime_type || 'audio/mpeg' },
    });
  } catch (err: any) {
    console.error('Failed to upload audio to R2:', err);
    return c.json({ error: 'Could not save the file' }, 500);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare("UPDATE tracks SET status = 'ready', updated_at = ? WHERE id = ?").bind(now, trackId).run();

  return c.json({ status: 'ok' });
});

// --- Upload cover art (streamed into R2) ---
trackRoutes.put('/:id/cover', async (c) => {
  const user = c.get('user');
  const trackId = c.req.param('id');

  const track = await c.env.DB.prepare('SELECT id FROM tracks WHERE id = ? AND user_id = ?')
    .bind(trackId, user.id)
    .first<{ id: string }>();

  if (!track) return c.json({ error: 'Track not found' }, 404);
  if (!c.req.raw.body) return c.json({ error: 'Empty request body' }, 400);

  const contentLength = Number(c.req.header('Content-Length') || 0);
  if (contentLength > MAX_COVER_BYTES) {
    return c.json({ error: 'Cover image is too large' }, 413);
  }

  const contentType = c.req.header('Content-Type') || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const coverKey = `covers/${user.id}/${trackId}.${ext}`;

  try {
    await c.env.R2_BUCKET.put(coverKey, c.req.raw.body, { httpMetadata: { contentType } });
  } catch (err: any) {
    console.error('Failed to upload cover art to R2:', err);
    return c.json({ error: 'Could not save the cover art' }, 500);
  }

  await c.env.DB.prepare('UPDATE tracks SET cover_key = ? WHERE id = ?').bind(coverKey, trackId).run();

  return c.json({ status: 'ok', cover_url: `/api/tracks/${trackId}/cover` });
});

// --- Serve cover art ---
trackRoutes.get('/:id/cover', async (c) => {
  const user = c.get('user');
  const trackId = c.req.param('id');

  const track = await c.env.DB.prepare('SELECT cover_key FROM tracks WHERE id = ? AND user_id = ?')
    .bind(trackId, user.id)
    .first<{ cover_key: string | null }>();

  if (!track || !track.cover_key) return c.text('Not found', 404);

  const object = await c.env.R2_BUCKET.get(track.cover_key);
  if (!object) return c.text('Not found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  headers.set('ETag', object.httpEtag);

  return new Response(object.body, { headers });
});

// --- Range-aware audio streaming ---
trackRoutes.get('/:id/stream', async (c) => {
  try {
    const user = c.get('user');
    const trackId = c.req.param('id');

    const track = await c.env.DB.prepare(
      "SELECT r2_key, mime_type, file_size FROM tracks WHERE id = ? AND user_id = ? AND status = 'ready'"
    )
      .bind(trackId, user.id)
      .first<{ r2_key: string; mime_type: string; file_size: number }>();

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
    console.error('Streaming error:', err);
    return c.text('Internal Error', 500);
  }
});

// --- Edit metadata ---
trackRoutes.patch('/:id', async (c) => {
  const user = c.get('user');
  const trackId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}) as any);

  const track = await c.env.DB.prepare('SELECT id FROM tracks WHERE id = ? AND user_id = ?')
    .bind(trackId, user.id)
    .first();
  if (!track) return c.json({ error: 'Track not found' }, 404);

  const fields: Record<string, any> = {};
  for (const key of ['title', 'artist', 'album', 'album_artist', 'genre']) {
    if (typeof body[key] === 'string') fields[key] = body[key].trim() || null;
  }
  for (const key of ['year', 'track_number', 'disc_number']) {
    if (body[key] === null || Number.isFinite(body[key])) fields[key] = body[key] ?? null;
  }

  if (Object.keys(fields).length === 0) return c.json({ error: 'Nothing to update' }, 400);

  const setClause = Object.keys(fields)
    .map((k) => `${k} = ?`)
    .join(', ');
  const values = Object.values(fields);
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(`UPDATE tracks SET ${setClause}, updated_at = ? WHERE id = ?`)
    .bind(...values, now, trackId)
    .run();

  return c.json({ status: 'ok' });
});

// --- Delete ---
trackRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const trackId = c.req.param('id');

  const track = await c.env.DB.prepare('SELECT r2_key, cover_key FROM tracks WHERE id = ? AND user_id = ?')
    .bind(trackId, user.id)
    .first<{ r2_key: string; cover_key: string | null }>();

  if (!track) return c.json({ error: 'Track not found' }, 404);

  await c.env.R2_BUCKET.delete(track.r2_key).catch(() => {});
  if (track.cover_key) await c.env.R2_BUCKET.delete(track.cover_key).catch(() => {});
  await c.env.DB.prepare('DELETE FROM tracks WHERE id = ?').bind(trackId).run();

  return c.json({ status: 'ok' });
});
