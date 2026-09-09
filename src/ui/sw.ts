// Kept deliberately small: audio streaming and API calls always go to the
// network (range requests + auth cookies don't play well with the Cache API),
// this only makes the app shell and icons available instantly / offline.
export const SW_SCRIPT = [
'var CACHE_NAME = "music-cloud-shell-v1";',
'var SHELL_URLS = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-32.png", "/icon-180.png", "/icon-192.png", "/icon-512.png"];',

'self.addEventListener("install", function (event) {',
'  event.waitUntil(',
'    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL_URLS); }).then(function () { return self.skipWaiting(); })',
'  );',
'});',

'self.addEventListener("activate", function (event) {',
'  event.waitUntil(',
'    caches.keys().then(function (keys) {',
'      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));',
'    }).then(function () { return self.clients.claim(); })',
'  );',
'});',

'self.addEventListener("fetch", function (event) {',
'  var url = new URL(event.request.url);',
'  if (event.request.method !== "GET") return;',
'  if (url.pathname.indexOf("/api/") === 0) return;',
'  if (url.origin !== self.location.origin) return;',

'  event.respondWith(',
'    caches.match(event.request).then(function (cached) {',
'      var networkFetch = fetch(event.request).then(function (response) {',
'        if (response.ok) {',
'          var copy = response.clone();',
'          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });',
'        }',
'        return response;',
'      }).catch(function () { return cached; });',
'      return cached || networkFetch;',
'    })',
'  );',
'});'
].join('\n');
