-- Vue CRM : réponses formulaire AFEM depuis le lancement campagne Recalif 2026 (03/07/2026).
-- Exclut les soumissions AFEM historiques antérieures.

INSERT INTO crm_saved_views (id, name, filter_groups, preset_flags, position, scope, owner_id)
VALUES (
  'v_recalif_2026',
  'Recalif 2026',
  '[{"id":"g_recalif_2026","rules":[
    {"id":"r_recalif_afem","field":"form_event","operator":"is","value":"Formulaire AFEM"},
    {"id":"r_recalif_since","field":"custom:recent_conversion_date","operator":"gte","value":"2026-07-03"}
  ]}]'::jsonb,
  NULL,
  15,
  'contacts',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  filter_groups = EXCLUDED.filter_groups,
  position = EXCLUDED.position,
  updated_at = NOW();
