-- Vue CRM : leads ayant répondu au classement orientation.hermione.co
-- Filtre sur recent_conversion_event = HERMIONE_ORIENTATION_FORM_EVENT

INSERT INTO crm_saved_views (id, name, filter_groups, preset_flags, position, scope, owner_id)
VALUES (
  'v_hermione_orientation',
  'Hermione',
  '[{"id":"g_hermione_orientation","rules":[{"id":"r_hermione_orientation_form","field":"form_event","operator":"is","value":"Hermione — Classement orientation santé"}]}]'::jsonb,
  NULL,
  12,
  'contacts',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  filter_groups = EXCLUDED.filter_groups,
  position = EXCLUDED.position,
  updated_at = NOW();
