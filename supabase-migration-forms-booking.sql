-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Formulaires de prise de rendez-vous (style Calendly)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ajoute le type 'booking' au module Forms :
--   • Un formulaire peut être un classique "lead capture" (comportement actuel)
--     ou un "booking" (date → heure → coordonnées → RDV créé dans l'agenda).
--   • Le RDV est créé dans `rdv_appointments` au moment de la soumission.
--   • Les créneaux dispos proviennent des disponibilités hebdo du `booking_owner_user_id`
--     (typiquement Pascal Tawfik, qui redispatche ensuite aux closers).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Colonnes sur `forms` ───────────────────────────────────────────────
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS form_type TEXT NOT NULL DEFAULT 'lead'
    CHECK (form_type IN ('lead', 'booking'));

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS booking_duration_minutes INT NOT NULL DEFAULT 30
    CHECK (booking_duration_minutes IN (15, 30, 45, 60));

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS booking_horizon_days INT NOT NULL DEFAULT 30
    CHECK (booking_horizon_days > 0 AND booking_horizon_days <= 180);

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS booking_min_notice_hours INT NOT NULL DEFAULT 2
    CHECK (booking_min_notice_hours >= 0 AND booking_min_notice_hours <= 168);

-- Closer (ou admin) dont les dispos hebdo pilotent les créneaux affichés.
-- Si NULL → fallback sur Pascal (assignCloserForSlot le retrouve via hubspot_owner_id).
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS booking_owner_user_id UUID
    REFERENCES rdv_users(id) ON DELETE SET NULL;

-- Types de RDV proposés au prospect. Sous-ensemble de :
--   'visio'      → lien LiveKit auto-généré
--   'presentiel' → adresse fixe (booking_location_label)
--   'telephone'  → on rappelle le numéro saisi
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS booking_meeting_types TEXT[] NOT NULL DEFAULT ARRAY['visio','presentiel']::TEXT[];

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS booking_location_label TEXT;

-- Type sélectionné par défaut dans le wizard (le premier de booking_meeting_types si NULL).
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS booking_default_meeting_type TEXT
    CHECK (booking_default_meeting_type IS NULL OR booking_default_meeting_type IN ('visio','presentiel','telephone'));

-- Titre/sous-titre/baseline affichés au-dessus du wizard (sinon on retombe sur form.title/subtitle)
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS booking_intro_html TEXT;

CREATE INDEX IF NOT EXISTS idx_forms_form_type ON forms(form_type);

-- ─── 2. Lien soumission → RDV créé ────────────────────────────────────────
-- Permet de retrouver l'appointment depuis la soumission (et inversement)
ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS form_submission_id UUID;

CREATE INDEX IF NOT EXISTS idx_rdv_appointments_form_submission_id
  ON rdv_appointments(form_submission_id)
  WHERE form_submission_id IS NOT NULL;

-- ─── 3. Helper SQL : récupère l'UUID Supabase de Pascal (fallback owner) ──
-- (Utilisé par l'API submit si booking_owner_user_id est NULL)
CREATE OR REPLACE FUNCTION get_pascal_user_id() RETURNS UUID AS $$
  SELECT id FROM rdv_users WHERE hubspot_owner_id = '76299546' LIMIT 1;
$$ LANGUAGE SQL STABLE;
