import { getCookie, deleteCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';
import type { AppEnv } from './types';

const SESSION_COOKIE = 'music_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** PBKDF2 password hashing. Stored as "saltHex:hashHex". */
export async function hashPassword(password: string, storedHash?: string): Promise<string> {
  const enc = new TextEncoder();
  let salt: Uint8Array;

  if (storedHash && storedHash.includes(':')) {
    const saltHex = storedHash.split(':')[0];
    const match = saltHex.match(/.{1,2}/g);
    salt = new Uint8Array(match ? match.map((b) => parseInt(b, 16)) : []);
  } else {
    salt = crypto.getRandomValues(new Uint8Array(16));
  }

  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, [
    'deriveBits',
    'deriveKey',
  ]);

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    true,
    ['sign', 'verify']
  );

  const exported = await crypto.subtle.exportKey('raw', key);
  const hashHex = Array.from(new Uint8Array(exported))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${saltHex}:${hashHex}`;
}

export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const sessionId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;

  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, userId, expiresAt, now)
    .run();

  const { setCookie } = await import('hono/cookie');
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    deleteCookie(c, SESSION_COOKIE);
  }
}

export const requireAuth = async (c: Context<AppEnv>, next: Next) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = await c.env.DB.prepare(
    `SELECT s.id, s.expires_at, u.id as user_id, u.username, u.role
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = ?`
  )
    .bind(sessionId)
    .first<{ id: string; expires_at: number; user_id: string; username: string; role: string }>();

  if (!session || session.expires_at < Math.floor(Date.now() / 1000)) {
    if (session) {
      await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(session.id).run();
    }
    deleteCookie(c, SESSION_COOKIE);
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', {
    id: session.user_id,
    username: session.username,
    role: session.role as 'admin' | 'user',
  });

  await next();
};

export const requireAdmin = async (c: Context<AppEnv>, next: Next) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
};
