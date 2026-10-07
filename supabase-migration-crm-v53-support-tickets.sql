-- v53 — Support technique interne
-- Les collègues ouvrent un ticket (texte + PDF / photos / vidéos / notes vocales),
-- un agent Claude (routine locale toutes les 10 min) le traite et répond dans le fil.

CREATE TABLE IF NOT EXISTS support_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number          BIGSERIAL UNIQUE,
  title           TEXT NOT NULL,
  author_id       UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  author_name     TEXT,
  author_role     TEXT,
  page_url        TEXT,
  priority        TEXT NOT NULL DEFAULT 'normale'
                  CHECK (priority IN ('basse', 'normale', 'urgente')),
  -- nouveau      : à traiter par l'agent
  -- en_cours     : l'agent travaille dessus (claimed_at)
  -- besoin_infos : l'agent attend une réponse du collègue
  -- fait         : terminé
  -- pas_fait     : refusé / impossible (raison dans le fil)
  status          TEXT NOT NULL DEFAULT 'nouveau'
                  CHECK (status IN ('nouveau', 'en_cours', 'besoin_infos', 'fait', 'pas_fait')),
  claimed_at      TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread_for_author BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_author ON support_tickets(author_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('user', 'agent')),
  author_id   UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  author_name TEXT,
  body        TEXT NOT NULL DEFAULT '',
  -- [{ path, name, mime, size }] — fichiers dans le bucket privé support-attachments
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at);

-- Accès uniquement via les routes API (service role).
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Bucket privé pour les pièces jointes (50 Mo max par fichier).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('support-attachments', 'support-attachments', false, 52428800)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;
