CREATE TABLE shares (
    token TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('track', 'playlist')),
    target_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,

    FOREIGN KEY (owner_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_shares_owner
    ON shares(owner_user_id);

-- Marks a playlist as a system playlist (currently only 'liked'), so the
-- client can find-or-create a single, stable "Liked Songs" playlist per
-- user instead of matching on its display name.
ALTER TABLE playlists ADD COLUMN system_key TEXT;

CREATE UNIQUE INDEX idx_playlists_system_unique
    ON playlists(user_id, system_key)
    WHERE system_key IS NOT NULL;
