-- ============================================================
-- Migration CRM v7 — Contrainte d'unicité sur l'email
-- Garantit qu'aucune fiche ne peut avoir le même email qu'une autre.
-- À exécuter dans le SQL Editor du dashboard Supabase.
-- ============================================================

-- Index unique sur lower(email) (case-insensitive).
-- Les contacts SANS email (NULL) ne sont PAS contraints (Postgres autorise
-- plusieurs NULL dans un index unique).
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_email_unique
  ON crm_contacts ((lower(email)))
  WHERE email IS NOT NULL;

-- Vérification : aucun doublon ne doit subsister
SELECT lower(email) AS email_norm, COUNT(*) AS n
FROM crm_contacts
WHERE email IS NOT NULL
GROUP BY lower(email)
HAVING COUNT(*) > 1
ORDER BY n DESC
LIMIT 10;
