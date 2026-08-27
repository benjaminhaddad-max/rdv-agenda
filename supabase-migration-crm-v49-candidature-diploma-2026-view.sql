-- Vue CRM : Candidature Diploma 2026
-- Tous les leads ayant soumis un formulaire Diploma Santé (nom commençant par NS).

INSERT INTO crm_saved_views (id, name, filter_groups, preset_flags, position, scope, owner_id)
VALUES (
  'v_candidature_diploma_2026',
  'Candidature Diploma 2026',
  $json$[{"id":"grp-candidature-diploma-2026","rules":[{"id":"r-candidature-diploma-2026-form-event","field":"form_event","operator":"is_any","value":"NS - BROCHURE DIPLOMA SANTÉ,NS - Candidater Article,NS - Candidater Global,NS - Candidater Header,NS - Candidater PAES,NS - Candidater Paris 16,NS - Candidater Première Élite,NS - Candidater Prépa LAS,NS - Candidater Prépa LSPS,NS - Candidater Prépa PASS,NS - Candidater Terminale Santé,NS - Financement,NS - Formulaire \"Guide Parcoursup 2026\" - Diploma Santé,NS - Formulaire KIT PASS / LAS,NS - Obtenir plus d'informations"}]}]$json$::jsonb,
  NULL,
  6,
  'contacts',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  filter_groups = EXCLUDED.filter_groups,
  position = EXCLUDED.position,
  updated_at = NOW();
