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
| 2026-10-08 | `lib/competitor-events.ts`, `components/crm/EventsAgendaCalendar.tsx`, `app/api/crm/competitor-events/*`, `app/api/cron/competitor-events-scan` | Veille concurrents (Antémed Epsilon, Médisup, CPCM) : table `competitor_events` (v55), bot quotidien (Claude + recherche web), affichage violet pointillé dans l'agenda Événements, ajout manuel / masquage |
| 2026-10-08 | `components/WeekCalendar.tsx`, `app/api/events-studio/agenda` | Rappel épinglé de nos événements (JPO, salons, webinaires) en haut des jours de l'agenda RDV (télépro, closer, admin), hors grille horaire |
| 2026-10-08 | `app/admin/crm-v2/lycees`, `components/crm-v2/lycees/*`, `app/api/crm/lycees/*`, `lib/lycees*.ts`, `lib/lycee-forums-scan.ts`, `app/api/cron/lycee-forums-scan` | Onglet **Lycées** (v58 : `lycees`, `lycee_contacts`, `lycee_events`, `lycee_activities`, `lycee_forum_scans`) : ~816 lycées IDF (open data + fichier LEADS_LYCEES_2027), score de potentiel (spé SVT, IPS, mentions, historique, flying), statut / priorité / mode Diploma ou AFEM / attribution, journal, agenda des forums 2026-27, alertes « à ne pas louper », classement flying, bot quotidien de veille des forums (3 départements/jour). Télépros : accès aux seuls lycées attribués (middleware + bouton « Mes lycées ») |
| 2026-10-09 | `lib/lycee-mail*.ts`, `components/crm-v2/lycees/Email*.tsx`, `MailsTab.tsx`, `app/api/crm/lycees/{emails,email-templates,mailboxes}`, `app/api/cron/lycee-mail-sync`, `public/plaquettes`, `docs/plaquettes` | **Mails partenariat lycées** (v65 : `lycee_emails`, `lycee_email_templates`, `lycee_mail_sync`) : envoi depuis partenariat@diploma-sante.fr / partenariat@afem-edu.fr via Gmail (compte de service Meet + délégation domaine, scopes gmail.send + gmail.readonly à autoriser dans la console Google), plaquette PDF jointe, modèles par marque modifiables, relève toutes les 5 min → réponses rangées dans la fiche (fil Gmail ou adresse du contact) + rappel « Répondre au mail », onglet Mails, écran Boîtes & modèles |
| 2026-10-09 | `lib/lycee-mail-ai.ts`, `lib/lycee-contacts-enrich.ts`, `app/api/crm/lycees/emails/draft`, `app/api/cron/lycee-contacts-enrich`, `components/crm-v2/lycees/*` | Lycées (v68) : mail rédigé par l'IA selon le forum (date sûre/probable, type, source, historique) + marque recommandée Diploma/AFEM ; robot de recherche des contacts organisateurs (web_search/web_fetch, 6 forums / 10 min, `organizer_contact` + `contact_data`, contacts ajoutés au lycée) ; bouton « On y sera » → Nos dates ; pastille de marque sur « Mail envoyé » (`last_mail_mode`) |

---

## Notes importantes

- Utiliser **Bun** comme runtime (`bun run ...`)
- Les migrations SQL sont dans les fichiers `supabase-migration-*.sql`
- Le middleware gère l'auth et les redirections — toujours vérifier les rôles avant d'ajouter une route protégée
- HubSpot owner IDs sont stockés dans la table `users` de Supabase
