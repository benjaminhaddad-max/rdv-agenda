-- Vues sauvegardées privées pour télépros / closers.
--
-- Avant : crm_saved_views contenait uniquement les vues GLOBALES de l'admin
-- (partagées entre tous les admins). On ajoute la notion de propriétaire pour
-- que chaque télépro / closer puisse créer ses propres vues, invisibles des
-- autres utilisateurs.
--
--   owner_id = NULL  → vue globale admin (comportement historique, inchangé)
--   owner_id = <rdv_users.id> → vue privée, propre à cet utilisateur
--
--   scope = 'contacts' | 'transactions' → objet ciblé par la vue
--
-- owner_id est typé TEXT (et non UUID + FK) pour rester compatible avec le
-- stockage de rdv_users.id côté API sans dépendre du type exact de la colonne.

ALTER TABLE crm_saved_views ADD COLUMN IF NOT EXISTS owner_id TEXT;
ALTER TABLE crm_saved_views ADD COLUMN IF NOT EXISTS scope    TEXT NOT NULL DEFAULT 'contacts';

-- Index pour charger rapidement les vues d'un utilisateur sur un scope donné.
CREATE INDEX IF NOT EXISTS idx_crm_saved_views_owner
  ON crm_saved_views (owner_id, scope, position);
