-- v81 — Analyse IA de TOUS les appels ≥ 2 min (avec ou sans RDV)
--
-- call_analyses ne contenait que les appels sans RDV. Désormais chaque appel
-- ≥ 2 min enregistré est analysé, et l'IA dit elle-même, d'après la
-- transcription :
--   call_type : premier_appel | relance | suivi_rdv | suivi_inscription
--   outcome   : rdv_pris | offre_vendue | aucun
-- → stats « ≥ 2 min → RDV » appels froids / relances sur la page Équipe,
-- sans dépendre du rattachement RDV ↔ contact du CRM (lib/call-analysis.ts).
-- Additif uniquement.

ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS call_type text;
ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS outcome text;

CREATE INDEX IF NOT EXISTS call_analyses_started_idx ON call_analyses (started_at);

NOTIFY pgrst, 'reload schema';
