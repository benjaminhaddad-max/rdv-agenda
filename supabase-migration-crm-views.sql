CREATE TABLE IF NOT EXISTS crm_saved_views (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  filter_groups JSONB NOT NULL DEFAULT '[]',
  preset_flags  JSONB,
  position    INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
