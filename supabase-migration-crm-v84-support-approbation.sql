-- v84 — Service technique : approbation d'Aaron pour les demandes des comptes « restreint »
-- approval_status : NULL = pas d'approbation requise ; 'en_attente' | 'approuve' | 'refuse'
-- L'agent (scripts/support-agent.mjs) ne traite pas les tickets 'en_attente' / 'refuse'.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS approval_status TEXT
  CHECK (approval_status IN ('en_attente', 'approuve', 'refuse'));
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS approval_decided_at TIMESTAMPTZ;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS approval_decided_by UUID;
CREATE INDEX IF NOT EXISTS idx_support_tickets_approval ON support_tickets(approval_status) WHERE approval_status = 'en_attente';
