-- Ajouter la colonne formation_souhaitee (propriété HubSpot contact)
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS formation_souhaitee TEXT;
