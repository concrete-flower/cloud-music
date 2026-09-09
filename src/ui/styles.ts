export const STYLES = `
  :root {
    color-scheme: dark;
    --bg: #000;
    --surface: #161618;
    --surface-2: #212124;
    --surface-3: #2c2c2f;
    --text: #f5f5f7;
    --muted: #98989d;
    --muted-2: #6e6e73;
    --accent: #fa2d48;
    --line: rgba(255,255,255,.08);
    --nav-height: 78px;
    --mini-height: 64px;
    --safe-t: env(safe-area-inset-top);
    --safe-b: env(safe-area-inset-bottom);
  }

  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

  html {
    height: 100%;
    overflow-x: hidden;
    /* Installed PWAs shouldn't rubber-band sideways or pinch-zoom like a
       regular webpage -- this keeps the whole app feeling like a native
       screen rather than a website in a frame. */
    overscroll-behavior: none;
    touch-action: pan-y;
  }

  body {
    margin: 0;
    min-height: 100%;
    width: 100%;
    max-width: 100vw;
    overflow-x: hidden;
    background: var(--bg);
    overscroll-behavior-y: none;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif;
    color: var(--text);
    -webkit-font-smoothing: antialiased;
  }

  img, svg { max-width: 100%; }

  button, input, select, textarea { font: inherit; color: inherit; }
  button { border: 0; background: transparent; cursor: pointer; touch-action: manipulation; }
  a { color: inherit; }

  .hidden { display: none !important; }
  .icon { display: block; flex-shrink: 0; }

  .spin { animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ---------- Login ---------- */
  #login-screen {
    width: min(400px, 100%);
    min-height: 100dvh;
    margin: 0 auto;
    padding: calc(40px + var(--safe-t)) 22px 40px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .login-logo {
    width: 76px;
    height: 76px;
    margin: 0 auto 26px;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 16px 40px rgba(250,45,72,.28);
  }
  .login-logo img { width: 100%; height: 100%; display: block; }

  .login-title { margin: 0 0 6px; text-align: center; font-size: 27px; font-weight: 700; letter-spacing: -.6px; }
  .login-subtitle { margin: 0 0 30px; text-align: center; color: var(--muted); font-size: 14.5px; }
  .login-form { display: grid; gap: 10px; }

  input[type="text"], input[type="password"], input[type="number"], input[type="search"], select {
    width: 100%;
    height: 48px;
    padding: 0 15px;
    border: 1px solid transparent;
    border-radius: 12px;
    outline: none;
    background: var(--surface);
    color: var(--text);
    -webkit-appearance: none;
  }
  input::placeholder { color: var(--muted-2); }
  input:focus, select:focus { border-color: rgba(255,255,255,.22); }

  .primary-button {
    height: 48px;
    border-radius: 12px;
    background: var(--text);
    color: #000;
    font-weight: 650;
    font-size: 15px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .primary-button:disabled { opacity: .5; }

  .secondary-button {
    height: 44px;
    border-radius: 11px;
    background: var(--surface-2);
    font-weight: 600;
    font-size: 14.5px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }

  .danger-button { background: rgba(255,69,58,.14); color: #ff6961; }
  .ghost-button { background: transparent; color: var(--muted); }

  .form-error { color: #ff6961; font-size: 13.5px; margin-top: 10px; text-align: center; }

  /* ---------- App shell ---------- */
  .app-shell {
    min-height: 100dvh;
    width: min(480px, 100%);
    margin: 0 auto;
    padding: var(--safe-t) 18px calc(var(--nav-height) + 20px + var(--safe-b));
  }

  .topbar {
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 5;
    background: linear-gradient(var(--bg) 60%, transparent);
    margin: 0 -18px;
    padding: 0 18px;
  }

  .brand { display: flex; align-items: center; gap: 9px; font-size: 18px; font-weight: 700; letter-spacing: -.3px; }
  .brand img { width: 26px; height: 26px; border-radius: 7px; }

  .user-button {
    width: 34px; height: 34px; border-radius: 50%;
    background: var(--surface-2); color: var(--muted);
    font-size: 13px; font-weight: 700;
    display: grid; place-items: center;
  }

  .view { padding-top: 6px; }

  #home-view {
    min-height: calc(100dvh - 56px - var(--safe-t) - var(--nav-height) - var(--safe-b) - 30px);
    display: flex;
    align-items: center;
  }
  #home-view .hero { width: 100%; }
  .view-header { display: flex; align-items: center; justify-content: space-between; margin: 10px 0 18px; gap: 10px; }
  .view-title { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -1px; }
  .section-title { margin: 26px 0 12px; font-size: 19px; font-weight: 700; letter-spacing: -.3px; }
  .section-title:first-child { margin-top: 0; }

  .icon-button {
    width: 38px; height: 38px; border-radius: 50%;
    display: grid; place-items: center; color: var(--text);
  }
  .icon-button.muted { color: var(--muted); }
  .icon-button:active { background: var(--surface); }

  /* ---------- Segmented control ---------- */
  .segmented {
    display: flex;
    background: var(--surface);
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
    margin-bottom: 18px;
  }
  .segmented button {
    flex: 1;
    height: 34px;
    border-radius: 8px;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--muted);
  }
  .segmented button.active { background: var(--surface-3); color: var(--text); }

  /* ---------- Now playing hero ---------- */
  .hero { text-align: center; padding: 12px 0 6px; }

  .artwork {
    width: min(72vw, 300px);
    aspect-ratio: 1;
    margin: 0 auto;
    border-radius: 16px;
    background: linear-gradient(135deg, #3a3a3d, #0c0c0d);
    box-shadow: 0 20px 50px rgba(0,0,0,.55);
    display: grid; place-items: center;
    color: rgba(255,255,255,.55);
    overflow: hidden;
  }
  .artwork img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .hero-title {
    margin: 20px 0 4px; font-size: 22px; font-weight: 700; letter-spacing: -.4px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 10px;
  }
  .hero-subtitle {
    color: var(--muted); font-size: 14.5px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 10px;
  }

  .progress-wrap { margin: 22px 2px 6px; }
  input[type="range"] {
    appearance: none; -webkit-appearance: none;
    width: 100%; height: 4px; padding: 0; border: 0; border-radius: 2px;
    background: var(--surface-3);
  }
  input[type="range"]::-webkit-slider-thumb {
    appearance: none; -webkit-appearance: none;
    width: 13px; height: 13px; border-radius: 50%; background: #fff;
  }

  .time-row { display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; margin-top: 6px; }

  .controls { display: flex; align-items: center; justify-content: center; gap: 30px; margin: 18px 0 8px; }
  .play-button {
    width: 60px; height: 60px; border-radius: 50%; background: #fff; color: #000;
    display: flex; align-items: center; justify-content: center;
  }
  /* Lucide's play triangle is already ~centered in its own box; only the
     play glyph (not pause) needs a hair of optical correction to the right. */
  .play-button svg.icon-play { position: relative; left: 1px; }

  .sub-controls { display: flex; justify-content: center; gap: 26px; margin-top: 4px; }
  .sub-controls button { color: var(--muted); }
  .sub-controls button.active { color: var(--accent); }

  /* ---------- Track rows ---------- */
  .track-list { display: grid; gap: 1px; }

  .track-row {
    width: 100%; min-height: 60px; padding: 6px 4px;
    border-radius: 10px; display: flex; align-items: center; gap: 12px; text-align: left;
  }
  .track-row:active { background: var(--surface); }
  .track-row.playing .track-name { color: var(--accent); }

  .track-thumb {
    width: 46px; height: 46px; flex: 0 0 46px; border-radius: 7px;
    background: var(--surface-2); color: var(--muted-2);
    display: grid; place-items: center; overflow: hidden;
  }
  .track-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .track-info { min-width: 0; flex: 1; }
  .track-name { font-size: 14.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .track-meta { margin-top: 2px; color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .track-more { width: 32px; flex: 0 0 32px; color: var(--muted); display: grid; place-items: center; }

  .empty { padding: 60px 20px; text-align: center; color: var(--muted); }
  .empty .icon { margin: 0 auto 14px; color: var(--muted-2); }

  /* ---------- Search ---------- */
  .search-box {
    display: flex; align-items: center; gap: 8px;
    height: 40px; padding: 0 12px; border-radius: 10px;
    background: var(--surface); color: var(--muted); margin-bottom: 18px;
  }
  .search-box input { flex: 1; height: 100%; padding: 0; background: transparent; border: 0; }
  .search-box input:focus { border: 0; }

  /* ---------- Cards / forms ---------- */
  .card { padding: 16px; border-radius: 16px; background: var(--surface); margin-bottom: 14px; }
  .card h2 { margin: 0 0 12px; font-size: 17px; font-weight: 700; }
  .form { display: grid; gap: 10px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  .profile-row {
    display: flex; align-items: center; gap: 14px; padding: 6px 2px 20px;
  }
  .profile-avatar {
    width: 56px; height: 56px; border-radius: 50%; background: var(--surface-2);
    color: var(--muted); font-size: 20px; font-weight: 700; display: grid; place-items: center;
  }
  .profile-name { font-size: 19px; font-weight: 700; }
  .profile-role { color: var(--muted); font-size: 13px; margin-top: 2px; }

  .menu-list { border-radius: 14px; background: var(--surface); overflow: hidden; margin-bottom: 14px; }
  .menu-item {
    width: 100%; display: flex; align-items: center; gap: 12px; padding: 13px 14px;
    border-bottom: 1px solid var(--line); text-align: left; font-size: 15px;
  }
  .menu-item:last-child { border-bottom: 0; }
  .menu-item .icon { color: var(--muted); }
  .menu-item.danger { color: #ff6961; }
  .menu-item.danger .icon { color: #ff6961; }

  /* ---------- Upload ---------- */
  .drop-zone {
    border: 1.5px dashed rgba(255,255,255,.16);
    border-radius: 14px;
    padding: 26px 16px;
    text-align: center;
    color: var(--muted);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .drop-zone .icon { color: var(--muted-2); }
  .drop-zone.drag-over { border-color: var(--accent); color: var(--text); }
  .drop-zone-title { font-size: 14.5px; font-weight: 600; color: var(--text); }
  .drop-zone-sub { font-size: 12.5px; }

  .upload-queue { display: grid; gap: 10px; margin-top: 14px; }
  .upload-item { padding: 10px 12px; border-radius: 12px; background: var(--surface-2); }
  .upload-item-top { display: flex; justify-content: space-between; gap: 10px; font-size: 13.5px; margin-bottom: 8px; }
  .upload-item-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
  .upload-item-status { color: var(--muted); flex: 0 0 auto; }
  .upload-item-status.error { color: #ff6961; }
  .upload-item-status.done { color: #32d74b; }
  .upload-bar { height: 4px; border-radius: 2px; background: var(--surface-3); overflow: hidden; }
  .upload-bar-fill { height: 100%; background: var(--text); width: 0%; transition: width .15s; }

  /* ---------- Admin ---------- */
  .admin-user {
    display: flex; align-items: center; justify-content: space-between;
    padding: 11px 0; border-bottom: 1px solid var(--line);
  }
  .admin-user:last-child { border-bottom: 0; }
  .admin-user-name { font-size: 14.5px; font-weight: 600; }
  .admin-user-role { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .admin-user button { width: 32px; height: 32px; border-radius: 50%; color: #ff6961; display: grid; place-items: center; }

  /* ---------- Mini player ---------- */
  .mini-player {
    position: fixed; z-index: 20; left: 10px; right: 10px;
    bottom: calc(var(--nav-height) + var(--safe-b) + 8px);
    height: var(--mini-height); padding: 7px 8px 7px 7px;
    border: 1px solid rgba(255,255,255,.08); border-radius: 13px;
    background: rgba(30,30,32,.92);
    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
    display: flex; align-items: center; gap: 10px;
    box-shadow: 0 10px 35px rgba(0,0,0,.4);
  }

  .mini-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--surface-3); border-radius: 0 0 13px 13px; overflow: hidden; }
  .mini-progress-fill { height: 100%; background: var(--text); width: 0%; }

  .mini-art { width: 48px; height: 48px; flex: 0 0 48px; border-radius: 7px; background: var(--surface-2); overflow: hidden; }
  .mini-art img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .mini-info { min-width: 0; flex: 1; }
  .mini-title, .mini-artist { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mini-title { font-size: 13.5px; font-weight: 650; }
  .mini-artist { margin-top: 1px; color: var(--muted); font-size: 12px; }
  .mini-play, .mini-next { width: 38px; height: 38px; display: grid; place-items: center; }

  /* ---------- Bottom nav ---------- */
  .bottom-nav {
    position: fixed; z-index: 21; left: 0; right: 0; bottom: 0;
    height: calc(var(--nav-height) + var(--safe-b));
    padding: 6px 6px var(--safe-b);
    background: rgba(12,12,13,.88);
    border-top: 1px solid var(--line);
    backdrop-filter: blur(26px); -webkit-backdrop-filter: blur(26px);
    display: flex; justify-content: space-around;
  }

  .nav-button {
    flex: 1; max-width: 110px; color: var(--muted);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    font-size: 10.5px; font-weight: 600;
  }
  .nav-button.active { color: var(--accent); }

  /* ---------- Toast ---------- */
  #toast {
    position: fixed; left: 50%; bottom: calc(var(--nav-height) + var(--safe-b) + 76px);
    transform: translateX(-50%) translateY(10px);
    background: rgba(40,40,42,.95); color: #fff; font-size: 13.5px;
    padding: 10px 16px; border-radius: 11px; z-index: 40;
    opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s;
    max-width: 86vw; text-align: center;
    backdrop-filter: blur(14px);
  }
  #toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* ---------- Modal (playlist picker) ---------- */
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.5);
    display: flex; align-items: flex-end; justify-content: center;
  }
  .modal-sheet {
    width: 100%; max-width: 480px; max-height: 78vh; overflow-y: auto;
    background: #1c1c1e; border-radius: 18px 18px 0 0; padding: 18px 18px calc(20px + var(--safe-b));
  }
  .modal-title { font-size: 17px; font-weight: 700; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
  .modal-list-item {
    width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 12px 4px; border-bottom: 1px solid var(--line); font-size: 15px; text-align: left;
  }
  .modal-list-item:last-child { border-bottom: 0; }

  /* On anything wider than a phone, render the app as a fixed-width phone-like
     column instead of stretching everything edge to edge -- keeps the player
     and lists readable and stops track rows from looking absurdly wide. */
  @media (min-width: 620px) {
    body { background: #000; }
    #login-screen { width: min(400px, 100%); }
    .app-shell {
      width: 480px;
      box-shadow: 0 0 0 1px var(--line);
    }
    .topbar { background: var(--bg); }
    .mini-player, .bottom-nav { left: 50%; right: auto; transform: translateX(-50%); }
    .mini-player { width: 444px; }
    .bottom-nav { width: 480px; }
    .form-row { grid-template-columns: 1fr 1fr 1fr; }
  }
`;
