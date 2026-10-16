-- v91 — Analyse des appels : y avait-il vraiment quelque chose à vendre ?
--
-- « ≥ 2 min » ne suffit pas à juger un appel : un mauvais numéro, une mère
-- qui dit « ma fille n'est pas là, voici son numéro »… durent 2 min sans que
-- le télépro puisse faire mieux. L'IA dit désormais, d'après la transcription :
--   occasion : sans_occasion | ratee | bien_geree
--     sans_occasion = rien à vendre dans cet appel → pas noté /10, hors moyennes
--     ratee         = vraie occasion laissée filer par le télépro (à retravailler)
--     bien_geree    = vraie occasion : RDV / offre obtenu, ou tout tenté
-- Les analyses existantes (occasion vide) sont reclassées depuis leur
-- transcription par la file d'analyse (lib/call-analysis.ts). Additif uniquement.

ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS occasion text;

NOTIFY pgrst, 'reload schema';
