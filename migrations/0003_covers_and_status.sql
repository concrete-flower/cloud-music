ALTER TABLE tracks ADD COLUMN cover_key TEXT;

ALTER TABLE tracks ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('pending', 'ready'));

CREATE INDEX idx_tracks_status
    ON tracks(user_id, status);
