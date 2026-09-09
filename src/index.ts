import { Hono } from 'hono';
import type { AppEnv } from './types';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { trackRoutes } from './routes/tracks';
import { playlistRoutes } from './routes/playlists';
import { renderPage } from './ui/page';
import { SW_SCRIPT } from './ui/sw';
import { ICON_PNG_32, ICON_PNG_180, ICON_PNG_192, ICON_PNG_512 } from './ui/icon-assets';

const app = new Hono<AppEnv>();

// --- App shell ---
app.get('/', (c) => c.html(renderPage()));

app.get('/sw.js', (c) => c.body(SW_SCRIPT, 200, { 'Content-Type': 'text/javascript; charset=UTF-8' }));

app.get('/manifest.webmanifest', (c) => {
  return c.json({
    name: 'Music Cloud',
    short_name: 'Music Cloud',
    description: 'Personal cloud music library',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
});

app.get('/icon.svg', (c) => {
  return c.body(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3a3a3c"/><stop offset="1" stop-color="#0a0a0b"/>
      </linearGradient></defs>
      <rect width="512" height="512" rx="112" fill="url(#g)"/>
      <path d="M204 128v186.2c-11-5.3-23.8-8.2-37.5-8.2-38.4 0-69.5 24.6-69.5 55s31.1 55 69.5 55 69.5-24.6 69.5-55V196l144-32v122.2c-11-5.3-23.8-8.2-37.5-8.2-38.4 0-69.5 24.6-69.5 55s31.1 55 69.5 55 69.5-24.6 69.5-55V96l-208 32z" fill="#f5f5f7"/>
    </svg>`,
    200,
    { 'Content-Type': 'image/svg+xml; charset=UTF-8' }
  );
});

function pngRoute(path: string, base64: string) {
  app.get(path, (c) => {
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    return c.body(bytes, 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  });
}

pngRoute('/icon-32.png', ICON_PNG_32);
pngRoute('/icon-180.png', ICON_PNG_180);
pngRoute('/icon-192.png', ICON_PNG_192);
pngRoute('/icon-512.png', ICON_PNG_512);

// --- API ---
app.route('/api/auth', authRoutes);
app.route('/api/users', userRoutes);
app.route('/api/tracks', trackRoutes);
app.route('/api/playlists', playlistRoutes);

export default app;
