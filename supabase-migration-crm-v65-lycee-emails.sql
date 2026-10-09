-- v65 — Lycées : mails partenariat envoyés depuis Gmail, modèles modifiables,
-- réponses rangées dans la fiche du lycée.
--
-- Deux boîtes Google Workspace envoient et reçoivent (voir lib/lycee-mail.ts) :
--   partenariat@diploma-sante.fr (mode « diploma ») et partenariat@afem-edu.fr
--   (mode « afem »). Le serveur y accède par délégation au niveau du domaine
--   (compte de service), sans mot de passe.
--
--   lycee_email_templates : modèles (accroche après appel, forum, relance…)
--                           par marque, modifiables depuis le CRM ;
--   lycee_emails          : chaque mail envoyé ou reçu, rattaché à un lycée
--                           et/ou un forum (fil Gmail conservé) ;
--   lycee_mail_sync       : où en est la relève de chaque boîte.
-- Additif uniquement.

CREATE TABLE IF NOT EXISTS lycee_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE,                                -- modèles fournis par défaut (re-seed idempotent)
  mode text NOT NULL,                              -- 'diploma' | 'afem'
  purpose text NOT NULL DEFAULT 'conference',      -- 'conference' | 'forum' | 'relance' | 'autre'
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,                              -- texte brut, variables {{lycee}}, {{salutation}}…
  attach_plaquette boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES rdv_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lycee_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uai text REFERENCES lycees(uai) ON DELETE SET NULL,
  event_id uuid REFERENCES lycee_events(id) ON DELETE SET NULL,
  mode text NOT NULL,                              -- 'diploma' | 'afem'
  mailbox text NOT NULL,                           -- boîte qui envoie / reçoit
  direction text NOT NULL,                         -- 'out' | 'in'
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
  template_id uuid REFERENCES lycee_email_templates(id) ON DELETE SET NULL,
  author_id uuid REFERENCES rdv_users(id) ON DELETE SET NULL,
  author_name text,
  status text NOT NULL DEFAULT 'sent',             -- 'sent' | 'received'
  read_at timestamptz,                             -- réponse lue dans le CRM
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lycee_emails_uai_idx ON lycee_emails (uai, sent_at DESC);
CREATE INDEX IF NOT EXISTS lycee_emails_event_idx ON lycee_emails (event_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS lycee_emails_thread_idx ON lycee_emails (gmail_thread_id);
CREATE INDEX IF NOT EXISTS lycee_emails_sent_idx ON lycee_emails (sent_at DESC);
CREATE INDEX IF NOT EXISTS lycee_emails_unread_idx ON lycee_emails (uai) WHERE direction = 'in' AND read_at IS NULL;

CREATE TABLE IF NOT EXISTS lycee_mail_sync (
  mailbox text PRIMARY KEY,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lycee_activities ADD COLUMN IF NOT EXISTS email_id uuid REFERENCES lycee_emails(id) ON DELETE SET NULL;
ALTER TABLE lycees ADD COLUMN IF NOT EXISTS last_email_in_at timestamptz;   -- dernière réponse reçue

ALTER TABLE lycee_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE lycee_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE lycee_mail_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lycee_email_templates, lycee_emails, lycee_mail_sync FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
