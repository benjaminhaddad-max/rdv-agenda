-- v68 — Forums des lycées : recherche automatique du contact de l'organisateur
--        + marque du dernier mail envoyé (lycées et forums)
--
-- Un robot (lib/lycee-contacts-enrich.ts, cron /api/cron/lycee-contacts-enrich)
-- part de la source du forum, remonte jusqu'à l'organisateur (CCI, CIO, mairie,
-- lycée, salon…) et récupère un contact utilisable : nom, fonction, mail,
-- téléphone, lien d'inscription exposants. Le résultat lisible va dans
-- lycee_events.organizer_contact (déjà existant) ; on garde ici la trace de la
-- recherche pour ne pas la refaire.
-- Additif uniquement.

ALTER TABLE lycee_events ADD COLUMN IF NOT EXISTS contact_searched_at timestamptz;  -- dernière recherche auto
ALTER TABLE lycee_events ADD COLUMN IF NOT EXISTS contact_source_url text;         -- page où le contact a été trouvé
ALTER TABLE lycee_events ADD COLUMN IF NOT EXISTS contact_data jsonb;              -- résultat brut (contacts, inscription, fiabilité)

-- Marque du dernier mail partenariat envoyé (pastille Diploma / AFEM à côté de « Mail envoyé »)
ALTER TABLE lycees ADD COLUMN IF NOT EXISTS last_mail_mode text;        -- 'diploma' | 'afem'
ALTER TABLE lycee_events ADD COLUMN IF NOT EXISTS last_mail_mode text;  -- 'diploma' | 'afem'

CREATE INDEX IF NOT EXISTS lycee_events_contact_todo_idx ON lycee_events (date) WHERE contact_searched_at IS NULL AND hidden = false;

NOTIFY pgrst, 'reload schema';
