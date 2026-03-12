# CONTEXT.md — RDV Agenda (Diploma Santé)

> **Instructions:** Ce fichier est mis à jour à chaque décision, modification de fichier ou étape complétée. Il doit être lu au début de chaque conversation.

---

## Projet

**RDV Agenda** — Outil interne de prise de rendez-vous pour l'équipe commerciale Diploma Santé.
Comparable à Calendly + Google Calendar, intégré à HubSpot (CRM) et Supabase (base de données).

---

## Stack technique

| Technologie | Rôle |
|---|---|
| Next.js 16 (App Router) | Framework web, TypeScript |
| React 19 | UI |
| Supabase (PostgreSQL) | Base de données + Auth |
| HubSpot API | CRM (contacts, deals, owners) |
| Tailwind CSS v4 | Styles |
| Bun | Runtime et package manager |
| date-fns (fr) | Manipulation des dates |
| lucide-react | Icônes |

---

## Architecture

### Rôles utilisateurs
- **admin** — Accès total (`/admin`)
- **commercial / closer** — Dashboard personnel (`/closer/[slug]`)
- **telepro** — Interface dédiée (`/telepro`)

### Routes principales
- `/` → Redirige selon le rôle
- `/login` — Authentification
- `/book/[slug]` — Page publique de réservation (prospects)
- `/closer/[slug]` — Dashboard closer
- `/telepro` — Interface télépro
- `/admin` — Dashboard admin

### API Routes (app/api/)
- `appointments/` — CRUD rendez-vous
- `me/` — Utilisateur connecté
- `users/` — Liste utilisateurs
- `availability/` — Gestion disponibilités
- `blocked-dates/` — Dates bloquées
- `admin/closers/` — Gestion closers + sync HubSpot
- `admin/telepros/` — Gestion télépros + sync HubSpot
- `admin/duplicates/` — Détection/fusion doublons HubSpot
- `hubspot/contact/` — Opérations contacts HubSpot
- `hubspot/owners/` — Propriétaires deals HubSpot
- `hubspot/telepro-stats/` — Stats télépros HubSpot

### Fichiers clés
| Fichier | Description |
|---|---|
| `middleware.ts` | Auth + redirections par rôle |
| `lib/supabase.ts` | Clients Supabase (browser, server, service) |
| `lib/hubspot.ts` | Wrapper API HubSpot (contacts, deals, notes) |
| `components/WeekCalendar.tsx` | Calendrier hebdomadaire principal |
| `components/DoublonsManager.tsx` | Gestion doublons HubSpot |
| `components/CloserManager.tsx` | Admin — gestion des closers |
| `components/TeleproManager.tsx` | Admin — gestion des télépros |
| `components/AppointmentModal.tsx` | Modal détail/édition RDV |
| `components/AssignModal.tsx` | Modal assignation RDV |
| `components/CloserNewRdvModal.tsx` | Modal création RDV (closer) |

### Scripts (scripts/)
| Script | Usage |
|---|---|
| `create-auth-users.ts` | Création comptes Supabase Auth (one-shot) |
| `sync-telepros.ts` | Sync statut active/banni télépros |
| `provision-telepros.ts` | Provisioning comptes télépros depuis HubSpot |
| `sync-deals-telepro.ts` | Sync bulk deals HubSpot (télépro + owner) |

### Migrations SQL
- `supabase-schema.sql` — Schéma complet
- `supabase-migration-auth.sql`, `-availability.sql`, `-doublons.sql`, `-meeting-type.sql`, `-report.sql`, `-telepro.sql`

---

## Synchronisation HubSpot

Statuts deal mappés :
- Confirmé → `rdv_pris` (RDV Découverte Pris)
- Délai réflexion → `delai_reflexion`
- No-show → `no_show` (À Replanifier)
- Préinscription → `preinscription`

---

## Historique des décisions

| Date | Fichiers modifiés | Description |
|---|---|---|
| 2026-03-12 | `CONTEXT.md` | Création initiale du fichier de contexte |
| 2026-03-12 | `app/telepro/TeleproClient.tsx` | Ajout vue chronologique (toggle "Chronologique / Par semaine") dans l'onglet Mon Planning — vue chrono par défaut, groupée par jour avec badge PASSÉ/AUJOURD'HUI, bouton "Reprendre" intégré |
| 2026-03-12 | `app/telepro/TeleproClient.tsx` | Fix : onglet par défaut changé de "Nouveau RDV" → "Mon Planning" pour que les télépros voient directement leur planning |

---

## Notes importantes

- Utiliser **Bun** comme runtime (`bun run ...`)
- Les migrations SQL sont dans les fichiers `supabase-migration-*.sql`
- Le middleware gère l'auth et les redirections — toujours vérifier les rôles avant d'ajouter une route protégée
- HubSpot owner IDs sont stockés dans la table `users` de Supabase
