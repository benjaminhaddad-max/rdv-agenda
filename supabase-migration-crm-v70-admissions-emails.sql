-- Migration CRM v70 — Boîte mail admissions@ par télépro
--
-- La boîte Gmail admissions@diploma-sante.fr est relevée toutes les 5 min
-- (lib/admissions-mail.ts). Seuls les mails échangés avec un contact du CRM
-- sont gardés, rattachés à sa fiche : chaque télépro voit les fils de SES
-- contacts (crm_contacts.telepro_user_id) et y répond en tant qu'admissions@.
--
--   admissions_emails     : chaque mail reçu / envoyé avec un contact (fil Gmail conservé) ;
--   admissions_mail_sync  : où en est la relève de la boîte.
-- Additif uniquement.

CREATE TABLE IF NOT EXISTS admissions_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id text REFERENCES crm_contacts(hubspot_contact_id) ON DELETE SET NULL,
  contact_email text,                              -- adresse du contact dans l'échange
  mailbox text NOT NULL,                           -- admissions@diploma-sante.fr
  direction text NOT NULL,                         -- 'in' | 'out'
  gmail_id text UNIQUE,
  gmail_thread_id text,
  message_id_header text,                          -- en-tête Message-ID (réponses dans le fil)
  from_email text,
  from_name text,
  to_emails text[] NOT NULL DEFAULT '{}',
  cc_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  body_text text,
  body_html text,
  snippet text,
  has_attachments boolean NOT NULL DEFAULT false,
  author_id uuid REFERENCES rdv_users(id) ON DELETE SET NULL,  -- télépro qui a écrit depuis le CRM
  author_name text,
  read_at timestamptz,                             -- réponse lue dans le CRM
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admissions_emails_contact_idx ON admissions_emails (contact_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS admissions_emails_thread_idx ON admissions_emails (gmail_thread_id);
CREATE INDEX IF NOT EXISTS admissions_emails_sent_idx ON admissions_emails (sent_at DESC);
CREATE INDEX IF NOT EXISTS admissions_emails_unread_idx ON admissions_emails (contact_id) WHERE direction = 'in' AND read_at IS NULL;

CREATE TABLE IF NOT EXISTS admissions_mail_sync (
  mailbox text PRIMARY KEY,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admissions_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions_mail_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admissions_emails, admissions_mail_sync FROM anon, authenticated;
