-- Personnalisation par utilisateur des propriétés affichées dans la carte
-- « À propos » des fiches contacts (équivalent HubSpot "Personnaliser les propriétés").
-- Liste ordonnée de noms de propriétés HubSpot/CRM (JSONB string[]).
ALTER TABLE crm_user_prefs
  ADD COLUMN IF NOT EXISTS contact_about_fields JSONB;
