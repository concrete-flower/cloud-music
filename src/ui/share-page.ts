// Standalone page for /s/:token -- intentionally NOT the full app shell.
// A friend opening a share link isn't signed in and shouldn't need to be;
// this is a small self-contained page that fetches the public share JSON
// and renders native <audio> players. Kept separate from ui/page.ts so the
// full app's client script (auth, upload, playlists...) never loads here.
export function renderSharePage(token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <title>Music Cloud -- Shared</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100dvh; background: #000; color: #f5f5f7;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      display: flex; justify-content: center;
      padding: 48px 18px;
    }
    .sheet { width: 100%; max-width: 420px; }
    .brand { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: #98989d; margin-bottom: 28px; }
    .brand img { width: 20px; height: 20px; border-radius: 6px; }
    .art {
      width: 100%; aspect-ratio: 1; border-radius: 16px; overflow: hidden;
      background: linear-gradient(135deg, #3a3a3d, #0c0c0d);
      display: grid; place-items: center; margin-bottom: 20px;
      box-shadow: 0 20px 50px rgba(0,0,0,.5);
    }
    .art img { width: 100%; height: 100%; object-fit: cover; display: block; }
    h1 { font-size: 22px; font-weight: 700; letter-spacing: -.4px; margin: 0 0 4px; }
    .sub { color: #98989d; font-size: 14.5px; margin: 0 0 22px; }
    audio { width: 100%; }
    .track-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
    .track-row:last-child { border-bottom: 0; }
    .track-thumb { width: 44px; height: 44px; flex: 0 0 44px; border-radius: 6px; background: #212124; overflow: hidden; }
    .track-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .track-meta { min-width: 0; flex: 1; }
    .track-title { font-size: 14.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .track-artist { font-size: 12.5px; color: #98989d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .error { padding: 60px 0; text-align: center; color: #98989d; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand"><img src="/icon-192.png" alt=""> Music Cloud</div>
    <div id="content">Loading&hellip;</div>
  </div>
  <script>
  (function () {
    var token = ${JSON.stringify(token)};
    var content = document.getElementById("content");

    function el(tag, className, text) {
      var e = document.createElement(tag);
      if (className) e.className = className;
      if (text) e.textContent = text;
      return e;
    }

    fetch("/api/public/shares/" + encodeURIComponent(token))
      .then(function (res) { if (!res.ok) throw new Error(); return res.json(); })
      .then(function (data) {
        content.replaceChildren();
        if (data.kind === "track") {
          var t = data.track;
          var art = el("div", "art");
          if (t.cover_url) { var img = document.createElement("img"); img.src = t.cover_url; art.appendChild(img); }
          content.appendChild(art);
          content.appendChild(el("h1", null, t.title || "Untitled"));
          content.appendChild(el("p", "sub", t.artist || "Unknown Artist"));
          var audio = document.createElement("audio");
          audio.controls = true;
          audio.preload = "metadata";
          audio.src = t.stream_url;
          content.appendChild(audio);
        } else {
          content.appendChild(el("h1", null, data.playlist.name));
          content.appendChild(el("p", "sub", data.tracks.length + (data.tracks.length === 1 ? " track" : " tracks")));
          data.tracks.forEach(function (t) {
            var row = el("div", "track-row");
            var thumb = el("div", "track-thumb");
            if (t.cover_url) { var img = document.createElement("img"); img.src = t.cover_url; thumb.appendChild(img); }
            row.appendChild(thumb);
            var meta = el("div", "track-meta");
            meta.appendChild(el("div", "track-title", t.title || "Untitled"));
            meta.appendChild(el("div", "track-artist", t.artist || "Unknown Artist"));
            row.appendChild(meta);
            content.appendChild(row);
            var audio = document.createElement("audio");
            audio.controls = true;
            audio.preload = "none";
            audio.style.marginBottom = "14px";
            audio.src = t.stream_url;
            content.appendChild(audio);
          });
        }
      })
      .catch(function () {
        content.replaceChildren();
        content.appendChild(el("div", "error", "This link is invalid or has expired."));
      });
  })();
  </script>
</body>
</html>`;
}
