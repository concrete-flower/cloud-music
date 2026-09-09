import { STYLES } from './styles';
import { CLIENT_SCRIPT } from './client';
import { icon } from './icons';

// Icons used directly by the client script (looked up by short name at
// runtime via the `ICONS` object below).
const CLIENT_ICONS: Record<string, string> = {
  music: icon('music-4', 30),
  more: icon('more-horizontal', 18),
  playlist: icon('list-music', 20),
  search: icon('search', 30),
  trash: icon('trash-2', 18),
  play: icon('play', 22),
  pause: icon('pause', 22),
};

function iconsScriptTag(): string {
  const entries = Object.entries(CLIENT_ICONS)
    .map(([key, svg]) => `${JSON.stringify(key)}: ${JSON.stringify(svg)}`)
    .join(',\n    ');
  return `var ICONS = {\n    ${entries}\n  };`;
}

export function renderPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="apple-mobile-web-app-title" content="Music Cloud">
  <meta name="mobile-web-app-capable" content="yes">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icon-180.png">
  <title>Music Cloud</title>
  <style>${STYLES}</style>
</head>
<body>
  <section id="login-screen" class="hidden">
    <div class="login-logo"><img src="/icon-192.png" alt=""></div>
    <h1 class="login-title">Music Cloud</h1>
    <p class="login-subtitle">Your music. No subscription.</p>
    <form id="login-form" class="login-form">
      <input type="text" id="login-username" placeholder="Username" autocomplete="username" required>
      <input type="password" id="login-password" placeholder="Password" autocomplete="current-password" required>
      <button class="primary-button" type="submit">Sign In</button>
    </form>
    <div id="login-error" class="hidden form-error"></div>
  </section>

  <main id="app-screen" class="app-shell hidden">
    <header class="topbar">
      <div class="brand"><img src="/icon-192.png" alt=""> Music Cloud</div>
      <button class="user-button" id="user-button" aria-label="Profile"><span id="user-initial"></span></button>
    </header>

    <!-- ===== Listen ===== -->
    <section id="home-view" class="view">
      <div class="hero">
        <div class="artwork" id="hero-art">${icon('music-4', 56)}</div>
        <div class="hero-title" id="hero-title">Nothing playing</div>
        <div class="hero-subtitle" id="hero-subtitle">Pick a track from your library</div>

        <div class="progress-wrap">
          <input id="progress" type="range" min="0" max="1000" value="0" aria-label="Seek">
          <div class="time-row">
            <span id="current-time">0:00</span>
            <span id="total-time">0:00</span>
          </div>
        </div>

        <div class="controls">
          <button class="icon-button" id="prev-button" aria-label="Previous">${icon('skip-back', 24)}</button>
          <button class="play-button" id="play-button" aria-label="Play">${icon('play', 24)}</button>
          <button class="icon-button" id="next-button" aria-label="Next">${icon('skip-forward', 24)}</button>
        </div>

        <div class="sub-controls">
          <button id="shuffle-button" aria-label="Shuffle">${icon('shuffle', 19)}</button>
          <button id="repeat-button" aria-label="Repeat">${icon('repeat', 19)}</button>
        </div>
      </div>
    </section>

    <!-- ===== Library ===== -->
    <section id="library-view" class="view hidden">
      <div class="view-header"><h1 class="view-title">Library</h1></div>

      <div class="segmented">
        <button class="library-tab active" data-tab="tracks">Tracks</button>
        <button class="library-tab" data-tab="playlists">Playlists</button>
      </div>

      <div id="library-tracks-panel">
        <div id="library-list" class="track-list"></div>
      </div>

      <div id="library-playlists-panel" class="hidden">
        <div id="playlist-list-view">
          <button id="new-playlist-button" class="secondary-button" style="width:100%;margin-bottom:14px;">
            ${icon('plus', 17)} New Playlist
          </button>
          <div id="playlists-list" class="track-list"></div>
        </div>

        <div id="playlist-detail-view" class="hidden">
          <div class="view-header">
            <button id="playlist-back" class="icon-button muted">${icon('chevron-left', 24)}</button>
            <h1 class="view-title" id="playlist-detail-title" style="font-size:22px;"></h1>
            <span style="width:38px;"></span>
          </div>
          <div id="playlist-detail-list" class="track-list"></div>
        </div>
      </div>
    </section>

    <!-- ===== Search ===== -->
    <section id="search-view" class="view hidden">
      <h1 class="view-title" style="margin-bottom:16px;">Search</h1>
      <div class="search-box">
        ${icon('search', 17)}
        <input type="search" id="search-input" placeholder="Title or artist">
      </div>
      <div id="search-results" class="track-list"></div>
    </section>

    <!-- ===== Profile ===== -->
    <section id="profile-view" class="view hidden">
      <h1 class="view-title">Profile</h1>

      <div class="profile-row">
        <div class="profile-avatar" id="profile-initial"></div>
        <div>
          <div class="profile-name" id="profile-name"></div>
          <div class="profile-role" id="profile-role"></div>
        </div>
      </div>

      <div class="card">
        <h2>Add Music</h2>
        <div id="drop-zone" class="drop-zone">
          ${icon('upload-cloud', 30)}
          <div class="drop-zone-title">Choose files or drop them here</div>
          <div class="drop-zone-sub">MP3, FLAC, M4A, WAV -- multiple at once is fine</div>
        </div>
        <input type="file" id="upload-file-input" accept="audio/*,.flac,.alac" multiple class="hidden">
        <div id="upload-queue" class="upload-queue"></div>
      </div>

      <div id="admin-section" class="card hidden">
        <h2>Users</h2>
        <form id="create-user-form" class="form">
          <input type="text" id="new-username" placeholder="New username" required>
          <input type="password" id="new-password" placeholder="Password (min. 6 characters)" required>
          <select id="new-role">
            <option value="user">Member</option>
            <option value="admin">Administrator</option>
          </select>
          <button type="submit" class="secondary-button">Create User</button>
        </form>
        <div id="users-list" style="margin-top:14px;"></div>
      </div>

      <div class="menu-list">
        <button id="logout-button" class="menu-item danger">${icon('log-out', 19)} Sign Out</button>
      </div>
    </section>
  </main>

  <div id="mini-player" class="mini-player hidden">
    <div class="mini-progress"><div class="mini-progress-fill" id="mini-progress-fill"></div></div>
    <div class="mini-art" id="mini-art"></div>
    <div class="mini-info">
      <div id="mini-title" class="mini-title"></div>
      <div id="mini-artist" class="mini-artist"></div>
    </div>
    <button id="mini-play" class="mini-play" aria-label="Play">${icon('play', 20)}</button>
    <button id="mini-next" class="mini-next" aria-label="Next">${icon('skip-forward', 18)}</button>
  </div>

  <nav id="bottom-nav" class="bottom-nav hidden" aria-label="Navigation">
    <button class="nav-button active" data-view="home-view">
      ${icon('house', 22)}
      <span>Listen</span>
    </button>
    <button class="nav-button" data-view="library-view">
      ${icon('library', 22)}
      <span>Library</span>
    </button>
    <button class="nav-button" data-view="search-view">
      ${icon('search', 22)}
      <span>Search</span>
    </button>
    <button class="nav-button" data-view="profile-view">
      ${icon('user-round', 22)}
      <span>Profile</span>
    </button>
  </nav>

  <div id="toast"></div>

  <!-- New playlist modal -->
  <div id="new-playlist-modal" class="modal-backdrop hidden">
    <div class="modal-sheet">
      <div class="modal-title">
        New Playlist
        <button id="new-playlist-cancel" class="icon-button muted">${icon('x', 20)}</button>
      </div>
      <form id="create-playlist-form" class="form">
        <input type="text" id="new-playlist-name" placeholder="Playlist name" required>
        <button type="submit" class="primary-button">Create</button>
      </form>
    </div>
  </div>

  <!-- Add-to-playlist modal -->
  <div id="add-to-playlist-modal" class="modal-backdrop hidden">
    <div id="add-to-playlist-backdrop" style="position:absolute;inset:0;"></div>
    <div class="modal-sheet" style="position:relative;">
      <div class="modal-title">Add to Playlist</div>
      <div id="add-to-playlist-list"></div>
    </div>
  </div>

  <!-- Track context menu -->
  <div id="track-menu-modal" class="modal-backdrop hidden">
    <div id="track-menu-backdrop" style="position:absolute;inset:0;"></div>
    <div class="modal-sheet" style="position:relative;">
      <div class="modal-title" id="track-menu-title"></div>
      <div id="track-menu-list"></div>
    </div>
  </div>

  <audio id="audio-player" preload="metadata" playsinline></audio>

  <script>
  ${iconsScriptTag()}
  ${CLIENT_SCRIPT}
  </script>
</body>
</html>`;
}
