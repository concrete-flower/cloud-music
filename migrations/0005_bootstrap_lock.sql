-- Single-row lock used to make "first account ever created becomes admin"
-- atomic. Without this, two concurrent first logins could both pass the
-- `COUNT(*) = 0` check in src/routes/auth.ts and both become admin.
CREATE TABLE bootstrap_lock (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    claimed_by TEXT NOT NULL,
    claimed_at INTEGER NOT NULL
);
