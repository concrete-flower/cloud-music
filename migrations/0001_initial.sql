PRAGMA foreign_keys = ON;

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
        CHECK (role IN ('admin', 'user')),
    created_at INTEGER NOT NULL
);

CREATE TABLE tracks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,

    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    album_artist TEXT,
    year INTEGER,
    genre TEXT,
    track_number INTEGER,
    disc_number INTEGER,
    duration_seconds INTEGER,

    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_extension TEXT NOT NULL,

    r2_key TEXT NOT NULL UNIQUE,

    musicbrainz_recording_id TEXT,
    musicbrainz_release_id TEXT,
    musicbrainz_artist_id TEXT,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_tracks_user_id
    ON tracks(user_id);

CREATE INDEX idx_tracks_artist
    ON tracks(user_id, artist);

CREATE INDEX idx_tracks_album
    ON tracks(user_id, album);

CREATE TABLE playlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_shared INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_playlists_user_id
    ON playlists(user_id);

CREATE TABLE playlist_tracks (
    playlist_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    position INTEGER NOT NULL,

    PRIMARY KEY (playlist_id, track_id),

    FOREIGN KEY (playlist_id)
        REFERENCES playlists(id)
        ON DELETE CASCADE,

    FOREIGN KEY (track_id)
        REFERENCES tracks(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_playlist_tracks_position
    ON playlist_tracks(playlist_id, position);