-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Module Dashboards & Rapports (style HubSpot)
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables :
--   • dashboards         : définitions des tableaux de bord
--   • dashboard_widgets  : widgets (graphiques, métriques) sur un dashboard
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. DASHBOARDS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  description    TEXT,
  icon           TEXT DEFAULT 'LayoutDashboard',
  color          TEXT DEFAULT '#ccac71',
  is_default     BOOLEAN DEFAULT false,
  is_shared      BOOLEAN DEFAULT true,
  created_by     UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboards_created_at ON dashboards(created_at DESC);

-- ─── 2. WIDGETS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id   UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,

  -- Affichage
  title          TEXT NOT NULL,
  description    TEXT,
  widget_type    TEXT NOT NULL,
    -- 'metric' | 'bar_chart' | 'line_chart' | 'pie_chart'
    -- | 'table' | 'funnel' | 'progress'

  position       INT DEFAULT 0,
  size           TEXT DEFAULT 'medium',
    -- 'small' (1 col) | 'medium' (2 col) | 'large' (3 col) | 'xlarge' (4 col)
  height         TEXT DEFAULT 'normal',
    -- 'normal' | 'tall' (double hauteur)

  -- Source de données
  data_source    TEXT NOT NULL,
    -- 'contacts' | 'deals' | 'appointments' | 'campaigns' | 'forms'
    -- | 'form_submissions' | 'users'
  metric         TEXT DEFAULT 'count',
    -- 'count' | 'sum' | 'avg' | 'max' | 'min' | 'rate'
  metric_field   TEXT, -- champ sur lequel appliquer la métrique (si pas count)

  -- Groupement / axe X
  group_by       TEXT,
    -- 'day' | 'week' | 'month' | 'owner' | 'stage' | 'source'
    -- | 'formation' | 'classe' | 'zone' | 'status'

  -- Filtres
  filters        JSONB DEFAULT '{}'::jsonb,
  time_range     TEXT DEFAULT 'last_30_days',
    -- 'today' | 'yesterday' | 'last_7_days' | 'last_30_days'
    -- | 'this_month' | 'last_month' | 'this_year' | 'all_time' | 'custom'
  time_start     DATE,
  time_end       DATE,

  -- Apparence
  color          TEXT DEFAULT '#ccac71',
  show_total     BOOLEAN DEFAULT true,
  show_trend     BOOLEAN DEFAULT true,

  -- Options diverses par widget (limit, sort, etc.)
  options        JSONB DEFAULT '{}'::jsonb,

  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_widgets_dashboard ON dashboard_widgets(dashboard_id, position);

-- ─── 3. TRIGGER updated_at ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_dashboards ON dashboards;
CREATE TRIGGER set_updated_at_dashboards
  BEFORE UPDATE ON dashboards
  FOR EACH ROW EXECUTE FUNCTION trigger_set_reports_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_widgets ON dashboard_widgets;
CREATE TRIGGER set_updated_at_widgets
  BEFORE UPDATE ON dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION trigger_set_reports_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED : un dashboard "Vue d'ensemble" avec 8 widgets utiles
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  dash_id UUID;
BEGIN
  -- Ne crée le dashboard par défaut que s'il n'existe pas déjà
  IF NOT EXISTS (SELECT 1 FROM dashboards WHERE is_default = true) THEN
    INSERT INTO dashboards (name, description, icon, color, is_default, is_shared)
    VALUES (
      'Vue d''ensemble',
      'Dashboard principal avec les KPIs essentiels de l''activité commerciale',
      'LayoutDashboard',
      '#ccac71',
      true,
      true
    )
    RETURNING id INTO dash_id;

    -- ─── KPIs en haut (4 métriques petites) ──────────────────────────────
    INSERT INTO dashboard_widgets (dashboard_id, title, widget_type, position, size, data_source, metric, time_range, color, options) VALUES
    (dash_id, 'Contacts total',     'metric', 0, 'small', 'contacts',   'count', 'all_time',     '#06b6d4', '{}'::jsonb),
    (dash_id, 'Nouveaux contacts',  'metric', 1, 'small', 'contacts',   'count', 'last_30_days', '#22c55e', '{}'::jsonb),
    (dash_id, 'Transactions actives', 'metric', 2, 'small', 'deals',    'count', 'all_time',     '#a855f7', '{"exclude_stages":["3165428985"]}'::jsonb),
    (dash_id, 'RDV cette semaine',  'metric', 3, 'small', 'appointments','count', 'last_7_days',  '#ccac71', '{}'::jsonb);

    -- ─── Funnel de conversion ────────────────────────────────────────────
    INSERT INTO dashboard_widgets (dashboard_id, title, description, widget_type, position, size, data_source, group_by, time_range, color) VALUES
    (dash_id, 'Funnel de transactions', 'Répartition des deals par étape du pipeline', 'funnel', 4, 'large', 'deals', 'stage', 'all_time', '#ccac71');

    -- ─── Répartition par closer ──────────────────────────────────────────
    INSERT INTO dashboard_widgets (dashboard_id, title, description, widget_type, position, size, data_source, group_by, time_range, color) VALUES
    (dash_id, 'Deals par closer', 'Nombre de deals actifs par propriétaire', 'bar_chart', 5, 'medium', 'deals', 'owner', 'all_time', '#06b6d4');

    -- ─── Contacts par source ─────────────────────────────────────────────
    INSERT INTO dashboard_widgets (dashboard_id, title, description, widget_type, position, size, data_source, group_by, time_range, color) VALUES
    (dash_id, 'Contacts par origine', 'D''où viennent vos prospects', 'pie_chart', 6, 'medium', 'contacts', 'source', 'last_30_days', '#a855f7');

    -- ─── Évolution des inscriptions ──────────────────────────────────────
    INSERT INTO dashboard_widgets (dashboard_id, title, description, widget_type, position, size, data_source, group_by, time_range, color) VALUES
    (dash_id, 'Nouveaux contacts dans le temps', 'Évolution des inscriptions par semaine', 'line_chart', 7, 'xlarge', 'contacts', 'week', 'last_30_days', '#22c55e');
  END IF;
END $$;
