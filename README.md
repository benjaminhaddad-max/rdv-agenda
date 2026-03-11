# RDV Agenda — Diploma Santé

Calendly + Google Calendar interne pour les commerciaux, connecté à HubSpot.

## Fonctionnalités

- **Page de réservation publique** (`/book/[slug]`) — les prospects réservent un créneau
- **Agenda semaine** (`/`) — vue calendrier ou liste des RDV de la semaine
- **Compteur RDV** — nombre de RDV de la semaine affiché en haut
- **Statuts RDV** → synchronisés automatiquement dans HubSpot :
  - Confirmé → "RDV Découverte Pris"
  - Va réfléchir → "Délai de Réflexion"
  - No-show → "À Replanifier"
  - Préinscription → "Préinscription effectuée"
- **Création automatique de deal HubSpot** + contact à chaque réservation

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase (PostgreSQL)
- HubSpot API

## Setup

1. Créer un projet Supabase et exécuter `supabase-schema.sql`
2. Copier `.env.local.example` → `.env.local` et remplir les variables
3. Mettre à jour les `hubspot_owner_id` dans la table `users`
4. `npm run dev`

## Routes

| Route | Description |
|-------|-------------|
| `/` | Agenda interne |
| `/book/[slug]` | Page de réservation publique |
