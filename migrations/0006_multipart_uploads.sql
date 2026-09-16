-- Tracks which tracks have an in-progress R2 multipart upload, so the daily
-- cleanup job (cleanupStalePendingTracks in src/routes/tracks.ts) can abort
-- the R2-side multipart upload -- not just delete the D1 row -- when a large
-- upload is abandoned. Without this, unfinished parts sit in R2 forever
-- (R2 does not auto-expire multipart uploads).
CREATE TABLE multipart_uploads (
    track_id TEXT PRIMARY KEY,
    r2_key TEXT NOT NULL,
    upload_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (track_id)
        REFERENCES tracks(id)
        ON DELETE CASCADE
);
