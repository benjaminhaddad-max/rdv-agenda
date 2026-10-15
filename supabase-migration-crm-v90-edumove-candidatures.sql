-- v90 — Candidatures Edumove dans le CRM
--
-- Copie, rafraîchie toutes les 10 min par /api/cron/edumove-sync
-- (lib/edumove-sync.ts), des dossiers de la plateforme candidature.edumove.fr
-- (base Supabase Edumove, tables candidatures + profiles), rattachés à leur
-- fiche contact. Sert au filtre « Étape Edumove » (vue Edumove · Candidatures)
-- et au bloc « Candidature Edumove » de la fiche contact.
--
-- Une ligne par dossier ; un compte créé sans candidature déposée a aussi sa
-- ligne (candidature_id = 'compte_<user_id>', étape « compte »).

CREATE TABLE IF NOT EXISTS crm_edumove_candidatures (
  candidature_id        TEXT PRIMARY KEY,
  hubspot_contact_id    TEXT,
  edumove_user_id       TEXT,
  stage                 TEXT NOT NULL,          -- compte | candidature | reponse | choix_faits | inscrit | archive
  status                TEXT,                   -- statut brut Edumove (en_cours, reponse_edumove, choix_valide…)
  situation_actuelle    TEXT,
  email                 TEXT,
  prenom                TEXT,
  nom                   TEXT,
  tel                   TEXT,
  departement           TEXT,
  profil                TEXT,                   -- terminale | reorientation
  filieres              TEXT[],                 -- classement des filières
  destinations          TEXT[],                 -- classement des destinations
  uni_selections        JSONB,                  -- choix des facs (LINK / UCJC / UE)
  uni_tracking          JSONB,                  -- suivi par fac
  documents             JSONB,                  -- pièces envoyées (clé → URL)
  details               JSONB,                  -- notes, langues, moyennes, réorientation…
  candidature_created_at TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_edumove_candidatures_contact_idx ON crm_edumove_candidatures (hubspot_contact_id);
CREATE INDEX IF NOT EXISTS crm_edumove_candidatures_stage_idx ON crm_edumove_candidatures (stage);

-- Comme le reste du CRM (v62) : lecture/écriture uniquement via les routes API (service_role).
ALTER TABLE crm_edumove_candidatures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_edumove_candidatures FROM anon, authenticated;

-- Vue « Edumove · Candidatures » + sous-vues par étape (globales, visibles par tous les admins)
INSERT INTO crm_saved_views (id, name, filter_groups, preset_flags, position, scope, owner_id, parent_id, kind)
VALUES
  ('v_edumove_candidatures', 'Edumove · Candidatures',
   $json$[{"id":"grp-edumove-candidatures","rules":[{"id":"r-edumove-stage","field":"edumove_stage","operator":"is_any","value":"compte,candidature,reponse,choix_faits,inscrit"}]}]$json$::jsonb,
   NULL, 7, 'contacts', NULL, NULL, 'view'),
  ('v_edumove_candidatures__compte', 'Compte créé, pas de candidature',
   $json$[{"id":"grp-edumove-candidatures","rules":[{"id":"r-edumove-stage","field":"edumove_stage","operator":"is_any","value":"compte,candidature,reponse,choix_faits,inscrit"},{"id":"sv_edumove_stage","field":"edumove_stage","operator":"is_any","value":"compte"}]}]$json$::jsonb,
   NULL, 1, 'contacts', NULL, 'v_edumove_candidatures', 'subview'),
  ('v_edumove_candidatures__candidature', 'Candidature déposée',
   $json$[{"id":"grp-edumove-candidatures","rules":[{"id":"r-edumove-stage","field":"edumove_stage","operator":"is_any","value":"compte,candidature,reponse,choix_faits,inscrit"},{"id":"sv_edumove_stage","field":"edumove_stage","operator":"is_any","value":"candidature"}]}]$json$::jsonb,
   NULL, 2, 'contacts', NULL, 'v_edumove_candidatures', 'subview'),
  ('v_edumove_candidatures__reponse', 'Réponse envoyée',
   $json$[{"id":"grp-edumove-candidatures","rules":[{"id":"r-edumove-stage","field":"edumove_stage","operator":"is_any","value":"compte,candidature,reponse,choix_faits,inscrit"},{"id":"sv_edumove_stage","field":"edumove_stage","operator":"is_any","value":"reponse"}]}]$json$::jsonb,
   NULL, 3, 'contacts', NULL, 'v_edumove_candidatures', 'subview'),
  ('v_edumove_candidatures__choix', 'Choix des facs faits',
   $json$[{"id":"grp-edumove-candidatures","rules":[{"id":"r-edumove-stage","field":"edumove_stage","operator":"is_any","value":"compte,candidature,reponse,choix_faits,inscrit"},{"id":"sv_edumove_stage","field":"edumove_stage","operator":"is_any","value":"choix_faits"}]}]$json$::jsonb,
   NULL, 4, 'contacts', NULL, 'v_edumove_candidatures', 'subview'),
  ('v_edumove_candidatures__inscrit', 'Inscrits',
   $json$[{"id":"grp-edumove-candidatures","rules":[{"id":"r-edumove-stage","field":"edumove_stage","operator":"is_any","value":"compte,candidature,reponse,choix_faits,inscrit"},{"id":"sv_edumove_stage","field":"edumove_stage","operator":"is_any","value":"inscrit"}]}]$json$::jsonb,
   NULL, 5, 'contacts', NULL, 'v_edumove_candidatures', 'subview')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  filter_groups = EXCLUDED.filter_groups,
  position = EXCLUDED.position,
  parent_id = EXCLUDED.parent_id,
  kind = EXCLUDED.kind,
  updated_at = NOW();
