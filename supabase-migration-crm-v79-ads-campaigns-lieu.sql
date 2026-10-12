-- v79 — Créas Ads : lieu des événements physiques (JPO, présentiel)
--
-- Le responsable Ads doit savoir où se déroule une JPO pour cibler la campagne.
-- Saisi dans le brief de la campagne (dashboard Créas Ads) ; une fois la
-- campagne rattachée à un événement de l'onglet Événements, c'est le lieu de
-- l'événement qui fait foi (et la saisie dans Créas Ads met aussi à jour l'événement).
--
-- Additif uniquement.

ALTER TABLE ads_campaigns ADD COLUMN IF NOT EXISTS location text;

NOTIFY pgrst, 'reload schema';
