-- Vue CRM : toutes les réponses formulaires campagne Recalif 2026 (toutes marques).
-- Événement unifié : recent_conversion_event = 'Recalif 2026'
-- Depuis le lancement campagne (03/07/2026).

INSERT INTO crm_saved_views (id, name, filter_groups, preset_flags, position, scope, owner_id)
VALUES (
  'v_recalif_2026',
  'Recalif 2026',
  '[{"id":"g_recalif_2026","rules":[
    {"id":"r_recalif_event","field":"form_event","operator":"is","value":"Recalif 2026"},
    {"id":"r_recalif_since","field":"custom:recent_conversion_date","operator":"gte","value":"2026-07-03"},
    {"id":"r_recalif_no_bad_phone","field":"lead_status","operator":"is_none","value":"Mauvais numéro"}
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

-- Rétroactif : réponses requalification déjà en « Formulaire AFEM » depuis le lancement.
UPDATE crm_contacts
SET
  recent_conversion_event = 'Recalif 2026',
  recent_conversion_event_name = 'Recalif 2026'
WHERE recent_conversion_event = 'Formulaire AFEM'
  AND recent_conversion_date >= '2026-07-03T00:00:00Z'
  AND (
    hubspot_raw->>'afem_requal_commence_pass_las' IS NOT NULL
    OR hubspot_raw->>'afem_source_url' LIKE '%/form%'
    OR hubspot_raw->'afem_meta'->>'form_id' = 'requalification-prepa-idf'
    OR hubspot_raw->>'recalif_2026_at' IS NOT NULL
  );
