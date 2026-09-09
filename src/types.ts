export type Bindings = {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
};

export type AuthUser = {
  id: string;
  username: string;
  role: 'admin' | 'user';
};

export type Variables = {
  user: AuthUser;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };

export type TrackRow = {
  id: string;
  user_id: string;
  title: string;
  artist: string;
  album: string | null;
  album_artist: string | null;
  year: number | null;
  genre: string | null;
  track_number: number | null;
  disc_number: number | null;
  duration_seconds: number | null;
  mime_type: string;
  file_size: number;
  file_extension: string;
  r2_key: string;
  cover_key: string | null;
  status: 'pending' | 'ready';
  created_at: number;
  updated_at: number;
};
