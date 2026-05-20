-- Migration CRM v29 — Backfill recent_conversion_event pour les contacts Meta natifs
-- ============================================================
-- À exécuter dans le SQL Editor du dashboard Supabase
--
-- Les contacts arrivés via l'intégration Meta Lead Ads avaient
-- recent_conversion_event = origine_label (ex: "[LINOVA] CONTACT") au lieu
-- du nom réel du formulaire (ex: "LINOVA - Form LGF - 18/05/2026").
--
-- Ce script remplace la valeur par le NOM du form (depuis meta_lead_forms.name)
-- pour permettre au filtre "Dernier formulaire soumis" de matcher.
--
-- On garde l'`origine` inchangé (sert au filtre "Origine").

WITH last_meta_form_per_contact AS (
  SELECT DISTINCT ON (e.contact_id)
    e.contact_id,
    f.name AS form_name,
    e.received_at
  FROM meta_lead_events e
  JOIN meta_lead_forms f ON f.form_id = e.form_id
  WHERE e.contact_id IS NOT NULL
    AND f.name IS NOT NULL
    AND f.name <> ''
  ORDER BY e.contact_id, e.received_at DESC
)
UPDATE crm_contacts c
SET recent_conversion_event = lm.form_name
FROM last_meta_form_per_contact lm
WHERE c.hubspot_contact_id = lm.contact_id;
