CREATE TABLE IF NOT EXISTS crm_user_prefs (
  user_id    UUID PRIMARY KEY,
  col_order  JSONB,
  col_widths JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
