-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v37 : Liens trackés génériques (hors campagne)
-- ═══════════════════════════════════════════════════════════════════════════
-- Les campagnes SMS ont déjà leur tracking par destinataire
-- (sms_campaign_link_tokens). Mais les SMS envoyés par le WORKFLOW (auto, à la
-- soumission d'un formulaire) partaient avec une URL en clair → clic non traçable.
--
-- Cette table générique permet de tokeniser n'importe quel lien SMS rattaché à
-- un contact (peu importe la source : workflow, relance, etc.). Le endpoint
-- /r/<token> incrémente le compteur, log le clic brut et inscrit une activité
-- « Lien cliqué » dans la timeline du contact.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sms_link_tokens (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token               text NOT NULL UNIQUE,
  hubspot_contact_id  text,                 -- contact destinataire (timeline)
  source              text,                 -- 'workflow' | 'relance' | ...
  source_id           text,                 -- workflow_id / execution_id / ...
  original_url        text NOT NULL,
  click_count         int  NOT NULL DEFAULT 0,
  first_clicked_at    timestamptz,
  last_clicked_at     timestamptz,
  created_at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_link_tokens_token    ON sms_link_tokens (token);
CREATE INDEX IF NOT EXISTS idx_sms_link_tokens_contact  ON sms_link_tokens (hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_sms_link_tokens_source   ON sms_link_tokens (source, source_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON sms_link_tokens TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
