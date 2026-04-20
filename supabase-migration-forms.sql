-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Module Formulaires (remplacement HubSpot Forms)
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables créées :
--   • forms             : définitions des formulaires
--   • form_fields       : champs des formulaires (ordonnés)
--   • form_submissions  : soumissions des prospects
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. FORMULAIRES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,            -- nom interne
  slug            TEXT NOT NULL UNIQUE,     -- /forms/[slug] (URL publique)
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'published' | 'archived'

  -- Design & paramétrage
  title           TEXT,                     -- titre affiché sur la page
  subtitle        TEXT,                     -- sous-titre
  submit_label    TEXT DEFAULT 'Envoyer',   -- texte du bouton
  success_message TEXT,                     -- message après envoi
  redirect_url    TEXT,                     -- si défini, redirige au lieu d'afficher le message

  -- Couleurs
  primary_color   TEXT DEFAULT '#ccac71',
  bg_color        TEXT DEFAULT '#ffffff',
  text_color      TEXT DEFAULT '#1d2f4b',

  -- Traitement des soumissions
  default_owner_id UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  default_tags    TEXT[] DEFAULT '{}',
  auto_create_contact BOOLEAN DEFAULT true,
  notify_emails   TEXT[] DEFAULT '{}',      -- emails à notifier à chaque soumission

  -- Anti-spam
  honeypot_enabled BOOLEAN DEFAULT true,
  recaptcha_enabled BOOLEAN DEFAULT false,

  -- Stats (cache)
  view_count      INT DEFAULT 0,
  submission_count INT DEFAULT 0,

  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forms_slug   ON forms(slug);
CREATE INDEX IF NOT EXISTS idx_forms_status ON forms(status);

-- ─── 2. CHAMPS DES FORMULAIRES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  order_index     INT NOT NULL DEFAULT 0,

  -- Type de champ
  field_type      TEXT NOT NULL,
    -- 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'radio'
    -- | 'checkbox' | 'date' | 'number' | 'hidden'

  -- Identifiant technique (utilisé comme clé dans form_submissions.data)
  field_key       TEXT NOT NULL,
  label           TEXT NOT NULL,
  placeholder     TEXT,
  help_text       TEXT,
  default_value   TEXT,

  required        BOOLEAN DEFAULT false,

  -- Options (pour select / radio / checkbox)
  -- Format : [{ "value": "pass", "label": "PASS" }, ...]
  options         JSONB DEFAULT '[]'::jsonb,

  -- Validation (regex, min, max, etc.)
  validation      JSONB DEFAULT '{}'::jsonb,

  -- Mapping vers un champ du contact CRM (ex: 'firstname', 'email', 'phone')
  -- Si null : stocké uniquement dans form_submissions.data
  crm_field       TEXT,

  -- Logique conditionnelle : afficher ce champ uniquement si...
  -- Format : { "show_if": { "field": "classe", "operator": "equals", "value": "Terminale" } }
  conditional     JSONB,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(form_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_form_fields_form ON form_fields(form_id, order_index);

-- ─── 3. SOUMISSIONS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,

  -- Données soumises (toutes les réponses, keyed par field_key)
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Lien vers le contact CRM créé/mis à jour
  contact_id      UUID,         -- FK souple (pas FK stricte car contacts n'est pas encore natif)
  contact_created BOOLEAN DEFAULT false,

  -- Contexte
  source_url      TEXT,         -- page où le formulaire a été soumis
  referrer        TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT,
  utm_content     TEXT,
  ip_address      TEXT,
  user_agent      TEXT,

  -- Statut
  status          TEXT DEFAULT 'new',  -- 'new' | 'processed' | 'spam' | 'error'
  error_message   TEXT,

  submitted_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form    ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status  ON form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_date    ON form_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_contact ON form_submissions(contact_id);

-- ─── 4. TRIGGER updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_forms ON forms;
CREATE TRIGGER set_updated_at_forms
  BEFORE UPDATE ON forms
  FOR EACH ROW EXECUTE FUNCTION trigger_set_forms_updated_at();

-- ─── 5. VUE HELPER : statistiques par formulaire ───────────────────────────
CREATE OR REPLACE VIEW forms_with_stats AS
SELECT
  f.*,
  COALESCE(s.submissions_last_7d, 0)  AS submissions_last_7d,
  COALESCE(s.submissions_last_30d, 0) AS submissions_last_30d
FROM forms f
LEFT JOIN (
  SELECT
    form_id,
    COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '7 days')  AS submissions_last_7d,
    COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '30 days') AS submissions_last_30d
  FROM form_submissions
  WHERE status != 'spam'
  GROUP BY form_id
) s ON s.form_id = f.id;
