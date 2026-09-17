import { Hono } from 'hono';
import { secureHeaders, NONCE } from 'hono/secure-headers';
import type { AppEnv, Bindings } from './types';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { trackRoutes, cleanupStalePendingTracks } from './routes/tracks';
import { playlistRoutes } from './routes/playlists';
import { shareRoutes, publicShareRoutes } from './routes/share';
import { renderPage } from './ui/page';
import { renderSharePage } from './ui/share-page';
import { SW_SCRIPT } from './ui/sw';
import { ICON_PNG_32, ICON_PNG_180, ICON_PNG_192, ICON_PNG_512, APP_LOGO_SVG, ICON_ASSET_VERSION } from './ui/icon-assets';
import { MUSIC_METADATA_BUNDLE_B64, VENDOR_ASSET_VERSION } from './ui/vendor-assets';

const app = new Hono<AppEnv>();

app.use(
  '*',
  secureHeaders({
    // Album art fallback still calls out to iTunes at runtime (see
    // fetchFallbackCover in client.ts); everything else is same-origin,
    // including the vendored tag-parsing lib at /vendor/music-metadata.js.
    //
    // page.ts/share-page.ts embed the whole client script inline rather
    // than as a separate file, so it needs a per-request nonce rather than
    // just 'self' -- see NONCE below and the nonce="..." attribute on each
    // <script> tag. If you have "Web Analytics" auto-injection turned on
    // for this zone in the Cloudflare dashboard, Cloudflare inserts its own
    // beacon script at the edge (not something this app's HTML controls),
    // hence the cloudflareinsights.com allowance below; turn that toggle
    // off in the dashboard and remove it here if you'd rather not have it.
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", NONCE, 'https://static.cloudflareinsights.com'],
      connectSrc: [
        "'self'",
        'https://itunes.apple.com',
        'https://*.mzstatic.com',
        'https://cloudflareinsights.com',
      ],
      imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  })
);

// --- App shell ---
app.get('/', (c) =>
  c.html(renderPage(c.get('secureHeadersNonce') || '', ICON_ASSET_VERSION, VENDOR_ASSET_VERSION))
);

// Public share page -- deliberately outside the app shell, no auth.
app.get('/s/:token', (c) =>
  c.html(renderSharePage(c.req.param('token'), c.get('secureHeadersNonce') || '', ICON_ASSET_VERSION))
);

app.get('/sw.js', (c) =>
  c.body(SW_SCRIPT.replace(/__ICON_ASSET_VERSION__/g, ICON_ASSET_VERSION), 200, {
    'Content-Type': 'text/javascript; charset=UTF-8',
  })
);

app.get('/manifest.webmanifest', (c) => {
  return c.json({
    name: 'Unsubscribed',
    short_name: 'Unsubscribed',
    description: 'Personal cloud music library',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: `/icon.svg?v=${ICON_ASSET_VERSION}`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: `/icon-192.png?v=${ICON_ASSET_VERSION}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/icon-512.png?v=${ICON_ASSET_VERSION}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/icon-512.png?v=${ICON_ASSET_VERSION}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
});

app.get('/icon.svg', (c) => {
  return c.body(APP_LOGO_SVG, 200, { 'Content-Type': 'image/svg+xml; charset=UTF-8' });
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

// Vendored tag-parsing library, served same-origin instead of pulled from
// esm.sh at runtime -- see src/ui/vendor-assets.ts for how it's built.
app.get('/vendor/music-metadata.js', (c) => {
  const bytes = Uint8Array.from(atob(MUSIC_METADATA_BUNDLE_B64), (ch) => ch.charCodeAt(0));
  return c.body(bytes, 200, {
    'Content-Type': 'application/javascript; charset=UTF-8',
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
});

// --- API ---
app.route('/api/auth', authRoutes);
app.route('/api/users', userRoutes);
app.route('/api/tracks', trackRoutes);
app.route('/api/playlists', playlistRoutes);
app.route('/api/shares', shareRoutes);
app.route('/api/public/shares', publicShareRoutes);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      cleanupStalePendingTracks(env).then((count) => {
        if (count) console.log(`Cleaned up ${count} stale pending track(s)`);
      })
    );
  },
};
