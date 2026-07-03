-- Vue CRM : contacts ayant répondu au formulaire Last Chance / Recalif 2026 (AFEM).
-- Alimentée par recent_conversion_event = « Formulaire AFEM » (webhook afem-form).

INSERT INTO crm_saved_views (id, name, filter_groups, preset_flags, position, scope, owner_id)
VALUES (
  'v_recalif_2026',
  'Recalif 2026',
  '[{"id":"g_recalif_2026","rules":[{"id":"r_recalif_afem","field":"form_event","operator":"is","value":"Formulaire AFEM"}]}]'::jsonb,
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
