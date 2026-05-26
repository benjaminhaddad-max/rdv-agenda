-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v32 : CRM governance fixes (schema parity + integrity)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Ensure `source` exists (referenced by cron sync and v31 fast MV)
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_source
  ON crm_contacts (source);

-- 2) Canonical pair uniqueness for ignored duplicates
-- Keeps a single row for (A,B) and (B,A).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ignored_duplicates_pair_canonical
  ON ignored_duplicates (
    LEAST(contact_id_a, contact_id_b),
    GREATEST(contact_id_a, contact_id_b)
  );

-- 3) Add contact FK to crm_deals safely
-- We start NOT VALID to avoid blocking on historical orphans.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_deals_hubspot_contact_fk'
  ) THEN
    ALTER TABLE crm_deals
      ADD CONSTRAINT crm_deals_hubspot_contact_fk
      FOREIGN KEY (hubspot_contact_id)
      REFERENCES crm_contacts(hubspot_contact_id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
