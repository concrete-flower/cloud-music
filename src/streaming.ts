import type { Context } from 'hono';
import type { Bindings } from './types';

/** Range-aware audio streaming from R2, shared by the authed and public (share-link) routes. */
export async function streamR2Object(
  c: Context<any>,
  r2Key: string,
  mimeType: string,
  fileSize: number
): Promise<Response> {
  const env = c.env as Bindings;
  const rangeHeader = c.req.header('Range');

  const commonHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': mimeType || 'audio/mpeg',
    'Cache-Control': 'private, no-store',
  };

  if (!rangeHeader) {
    const object = await env.R2_BUCKET.get(r2Key);
    if (!object) return c.text('File missing in R2', 404);

    const headers = new Headers(commonHeaders);
    object.writeHttpMetadata(headers);
    headers.set('Content-Length', fileSize.toString());

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
    end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
  } else {
    const suffixLength = parseInt(match[2], 10);
    if (!suffixLength) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      });
    }
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  }

  if (start >= fileSize || start > end) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${fileSize}` },
    });
  }

  end = Math.min(end, fileSize - 1);

  const object = await env.R2_BUCKET.get(r2Key, { range: { offset: start, length: end - start + 1 } });
  if (!object) return c.text('File missing in R2', 404);

  const headers = new Headers(commonHeaders);
  object.writeHttpMetadata(headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  headers.set('Content-Length', (end - start + 1).toString());

  return new Response(object.body, { status: 206, headers });
}

/** Serves a cover image from R2 with long-lived caching, shared by authed and public routes. */
export async function coverResponse(env: Bindings, coverKey: string | null): Promise<Response> {
  if (!coverKey) return new Response('Not found', { status: 404 });

  const object = await env.R2_BUCKET.get(coverKey);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  headers.set('ETag', object.httpEtag);

  return new Response(object.body, { headers });
}
