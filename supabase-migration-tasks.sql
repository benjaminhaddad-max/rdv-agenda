-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Plateforme de suivi migration HubSpot → CRM natif
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS migration_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT NOT NULL,
    -- 'fondations', 'contacts', 'deals', 'workflows', 'dashboards',
    -- 'custom_fields', 'marketing', 'automations', 'migration', 'qualite'
  priority       TEXT NOT NULL DEFAULT 'medium',
    -- 'critical', 'high', 'medium', 'low'
  status         TEXT NOT NULL DEFAULT 'todo',
    -- 'todo', 'in_progress', 'blocked', 'done'
  complexity     TEXT DEFAULT 'medium',
    -- 'easy', 'medium', 'hard'
  order_index    INT DEFAULT 0,
  hubspot_dep    BOOLEAN DEFAULT false, -- true si dépend de HubSpot aujourd'hui
  notes          TEXT,
  assignee       TEXT,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_tasks_category ON migration_tasks(category);
CREATE INDEX IF NOT EXISTS idx_migration_tasks_status   ON migration_tasks(status);
CREATE INDEX IF NOT EXISTS idx_migration_tasks_priority ON migration_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_migration_tasks_order    ON migration_tasks(category, order_index);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trigger_set_migration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    NEW.completed_at = NOW();
  END IF;
  IF NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM 'in_progress' AND NEW.started_at IS NULL THEN
    NEW.started_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_migration_tasks ON migration_tasks;
CREATE TRIGGER set_updated_at_migration_tasks
  BEFORE UPDATE ON migration_tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_migration_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED : 70+ tâches préremplies couvrant TOUS les modules à migrer
-- ═══════════════════════════════════════════════════════════════════════════

-- Nettoie toutes les tâches existantes avant de reseed (idempotent)
TRUNCATE migration_tasks;

-- ─── 1. FONDATIONS (base de données & schéma) ──────────────────────────────
INSERT INTO migration_tasks (title, description, category, priority, complexity, order_index, hubspot_dep) VALUES
('Créer table native `contacts`',
 'Remplacer `crm_contacts` (cache HubSpot) par une vraie table contacts comme source de vérité. Inclure tous les champs actuels + champs natifs (tags, lead_score, custom fields).',
 'fondations', 'critical', 'hard', 1, true),

('Créer table native `deals`',
 'Remplacer `crm_deals` par une vraie table deals. Champs : title, amount, pipeline_id, stage_id, owner_id, contact_id, notes, dates clés, probabilité.',
 'fondations', 'critical', 'hard', 2, true),

('Créer tables `pipelines` et `pipeline_stages`',
 'Supprimer les constantes en dur (IDs HubSpot `2313043166`, `3165428979`...). Permettre de créer/modifier les pipelines et étapes depuis une interface admin.',
 'fondations', 'critical', 'medium', 3, true),

('Créer table `custom_fields` + valeurs',
 'Rendre éditables les propriétés custom (formation, zone, classe...). Types : text, number, date, enum, multi_select. Actuellement codés en dur dans les filtres.',
 'fondations', 'high', 'hard', 4, true),

('Créer table `contact_tags` (N-N)',
 'Remplacer les listes HubSpot par un système de tags natifs. Un contact peut avoir plusieurs tags (ex: "VIP", "Parent actif", "Hot lead").',
 'fondations', 'high', 'easy', 5, true),

('Créer table `deal_tags` (N-N)',
 'Tags sur les deals (ex: "Urgent", "Signe bientôt", "Grosse remise").',
 'fondations', 'medium', 'easy', 6, false),

('Créer table `lead_sources` éditable',
 'Actuellement les sources sont un champ HubSpot en dur. Créer une table pour les gérer (SEO, Facebook Ads, Instagram, Salon, Referral, etc.).',
 'fondations', 'high', 'easy', 7, true),

('Migrer `hubspot_owner_id` → `owner_id`',
 'Partout dans le code : remplacer la référence `hubspot_owner_id` par un FK vers `rdv_users.id`. Impact sur ~20 fichiers.',
 'fondations', 'critical', 'hard', 8, true),

('Créer table `audit_log`',
 'Journaliser toutes les modifications sur contacts et deals (qui, quand, quoi, valeur avant/après). Requis pour compliance + debug.',
 'fondations', 'high', 'medium', 9, false),

('Créer table `notes` polymorphique',
 'Actuellement les notes sont un champ TEXT. Passer à une vraie table avec auteur, date, pin, attachments. Attachable à contact ou deal.',
 'fondations', 'medium', 'medium', 10, false),

('Créer table `tasks` (tâches internes)',
 'Tâches internes assignables à un user (rappel, relance, etc.). Type : due_date, assignee, linked_contact/deal, status.',
 'fondations', 'medium', 'medium', 11, false),

('Script d''import initial HubSpot → Supabase',
 'Script one-shot qui importe tous les contacts + deals + owners + tags depuis HubSpot vers les nouvelles tables. Avec dry-run + résumé des erreurs.',
 'fondations', 'critical', 'hard', 12, true),

('Valider l''intégrité des données après import',
 'Script de vérification : compter les contacts/deals dans HubSpot vs Supabase, détecter les orphelins, les doublons, les valeurs manquantes.',
 'fondations', 'critical', 'medium', 13, true),

-- ─── 2. MODULE CONTACTS ────────────────────────────────────────────────────
('Adapter `/api/crm/contacts` (source native)',
 'Réécrire la route pour lire depuis la table `contacts` native au lieu de `crm_contacts`. Maintenir la compatibilité des filtres existants.',
 'contacts', 'critical', 'hard', 20, true),

('Adapter `CRMContactsTable` component',
 'Le tableau de contacts lit actuellement les champs HubSpot. Adapter pour les nouveaux champs + colonnes dynamiques (custom_fields).',
 'contacts', 'critical', 'medium', 21, true),

('Adapter `CRMEditDrawer` (édition locale)',
 'Le drawer d''édition fait un PATCH qui sync HubSpot. Doit devenir natif (écrit en local, sans appel HubSpot).',
 'contacts', 'critical', 'medium', 22, true),

('Remplacer la recherche HubSpot par recherche native',
 'La recherche dans `/api/hubspot/contact` sert aux télépros pour trouver un prospect. Remplacer par une recherche full-text Supabase (pg_trgm).',
 'contacts', 'high', 'medium', 23, true),

('Refaire détection doublons (interne natif)',
 'Actuellement on a 3 modules : internes / externes (HubSpot) / deals. Unifier en un seul système natif basé sur email/phone normalisés.',
 'contacts', 'high', 'medium', 24, true),

('Adapter export CSV (colonnes dynamiques)',
 'Export actuel a des colonnes codées en dur. Permettre de choisir les colonnes + inclure les custom_fields.',
 'contacts', 'medium', 'easy', 25, false),

('Système de tags contacts (UI)',
 'Ajouter/retirer des tags depuis le drawer d''édition. Filtrer par tag dans le CRM.',
 'contacts', 'high', 'medium', 26, false),

('Système de scoring (lead_score)',
 'Calculer automatiquement un score 0-100 par contact (basé sur formation, RDV pris, stage, engagement). Permet de prioriser.',
 'contacts', 'medium', 'hard', 27, false),

('Historique complet par contact',
 'Page détail contact avec timeline : RDV, deals, emails envoyés, SMS, notes, changements de stage, tags ajoutés.',
 'contacts', 'high', 'hard', 28, false),

-- ─── 3. MODULE DEALS / PIPELINES ───────────────────────────────────────────
('Adapter `/api/crm/deals` (source native)',
 'Lire depuis la table `deals` native. Retourner owner_id, stage_id, etc. au lieu des IDs HubSpot.',
 'deals', 'critical', 'hard', 40, true),

('Adapter `TransactionBoard` (Kanban)',
 'Le kanban utilise les IDs d''étapes HubSpot en dur. Charger les étapes dynamiquement depuis `pipeline_stages`.',
 'deals', 'critical', 'medium', 41, true),

('Drag & drop avec `deals` natifs',
 'Actuellement `/api/crm/deals/batch` sync HubSpot. Faire la même chose en local.',
 'deals', 'critical', 'medium', 42, true),

('Écran admin des pipelines',
 'Page `/admin/pipelines` pour créer/éditer/archiver des pipelines et leurs étapes (couleur, ordre, nom).',
 'deals', 'high', 'medium', 43, true),

('Étape "probabilité de gain" par stage',
 'Permet les prévisions de CA. Ex: RDV pris = 20%, Pré-inscription = 60%, Finalisation = 90%.',
 'deals', 'medium', 'easy', 44, false),

('Historique des changements de stage par deal',
 'Garder l''historique dans `audit_log` : quand le deal est passé de quel stage à quel stage, par qui.',
 'deals', 'high', 'medium', 45, false),

('Deals perdus : raisons (lost_reason)',
 'Quand un deal passe en "Fermé Perdu", forcer la saisie d''une raison (ex: prix, timing, concurrent, no_show).',
 'deals', 'medium', 'easy', 46, false),

('Prévisionnel de CA par pipeline',
 'Calculer automatiquement le CA attendu (sum of amount * probability par stage).',
 'deals', 'medium', 'medium', 47, false),

-- ─── 4. WORKFLOWS (automatisations visuelles) ──────────────────────────────
('Créer tables `workflows` et `workflow_steps`',
 'Structure : workflow (nom, trigger_type, trigger_config, actif). Steps (type=action/condition/delay, order, config).',
 'workflows', 'high', 'hard', 60, true),

('Moteur de triggers (événements système)',
 'Listener sur : nouveau RDV, RDV confirmé, RDV no_show, stage changé, contact créé, tag ajouté, email ouvert, formulaire soumis.',
 'workflows', 'high', 'hard', 61, true),

('Actions : envoyer SMS',
 'Action qui envoie un SMS (via SMS Factor) avec template + variables.',
 'workflows', 'high', 'medium', 62, false),

('Actions : envoyer email',
 'Action qui envoie un email (via Brevo) avec template + variables.',
 'workflows', 'high', 'medium', 63, false),

('Actions : changer propriétaire / étape / tag',
 'Mettre à jour un contact ou deal depuis un workflow (assigner, changer stage, ajouter tag).',
 'workflows', 'high', 'medium', 64, false),

('Actions : créer tâche interne',
 'Créer une tâche pour un user (ex: "Rappeler X demain à 10h").',
 'workflows', 'medium', 'medium', 65, false),

('Actions : webhook externe',
 'Envoyer un POST à une URL externe (pour intégrations tierces, Zapier, etc.).',
 'workflows', 'low', 'easy', 66, false),

('Conditions (if/else) dans les workflows',
 'Ex: "Si formation = PASS → SMS A, sinon → SMS B". Support comparaisons, AND/OR.',
 'workflows', 'high', 'hard', 67, false),

('Délais (wait X hours/days)',
 'Ex: "Attendre 24h avant d''envoyer le SMS de relance".',
 'workflows', 'high', 'medium', 68, false),

('Interface visuelle de workflow (drag & drop)',
 'Page `/admin/workflows` avec un builder visuel (nodes + edges). On peut utiliser React Flow.',
 'workflows', 'high', 'hard', 69, true),

('Logs d''exécution des workflows',
 'Table `workflow_runs` qui logue chaque déclenchement : quel workflow, quel contact/deal, quelles steps, succès/erreur.',
 'workflows', 'high', 'medium', 70, false),

('Migrer les 5 workflows HubSpot principaux',
 'Identifier les 5 workflows les plus utilisés côté HubSpot et les recréer en natif. (À clarifier avec Benjamin lesquels).',
 'workflows', 'critical', 'hard', 71, true),

-- ─── 5. DASHBOARDS & REPORTING ─────────────────────────────────────────────
('Dashboard global (KPIs principaux)',
 'Page d''accueil admin avec : total contacts, total deals actifs, CA prévu, taux conversion, RDV cette semaine.',
 'dashboards', 'high', 'medium', 80, true),

('Dashboard par closer',
 'Performance individuelle : RDV pris, confirmés, pré-inscriptions, inscriptions, taux no-show, CA généré.',
 'dashboards', 'high', 'medium', 81, true),

('Dashboard par télépro',
 'RDV placés, taux de confirmation des RDV placés, no-show rate, commissions (si applicable).',
 'dashboards', 'high', 'medium', 82, true),

('Funnel de conversion',
 'Visualisation du parcours : Lead → RDV → Confirmé → Pré-inscription → Inscription. Taux à chaque étape.',
 'dashboards', 'high', 'medium', 83, true),

('Rapport sources de leads',
 'Répartition des contacts par source, et taux de conversion par source (quelle source rapporte le plus).',
 'dashboards', 'medium', 'medium', 84, true),

('Rapport taux de transformation par formation',
 'Ex: PASS → 15% d''inscription, LAS → 22%. Aide à prioriser les formations.',
 'dashboards', 'medium', 'medium', 85, false),

('Export des rapports (PDF/Excel)',
 'Tous les dashboards exportables pour les réunions / direction.',
 'dashboards', 'medium', 'medium', 86, false),

('Dashboard temps réel (live)',
 'Auto-refresh toutes les 30s : RDV du jour, activité équipe, alertes no-show imminents.',
 'dashboards', 'low', 'hard', 87, false),

-- ─── 6. CUSTOM FIELDS & PROPRIÉTÉS ─────────────────────────────────────────
('Admin : éditeur de champs custom',
 'Page `/admin/fields` : ajouter/supprimer/éditer des champs sur contact ou deal. Type, label, options, requis.',
 'custom_fields', 'high', 'hard', 100, true),

('Types de champs supportés',
 'text, number, date, datetime, enum (single), multi_select, boolean, email, phone, url, currency.',
 'custom_fields', 'high', 'medium', 101, false),

('Validation des champs (regex, min/max)',
 'Permettre de définir des règles de validation (ex: téléphone FR valide).',
 'custom_fields', 'medium', 'medium', 102, false),

('Affichage conditionnel dans les drawers',
 'Un champ peut être visible uniquement si une autre condition est vraie (ex: "Classe" visible si "Type" = Étudiant).',
 'custom_fields', 'low', 'hard', 103, false),

-- ─── 7. MARKETING (Brevo - en cours) ───────────────────────────────────────
('Phase 3 - Onglet Campagnes dans CRM',
 'Ajouter un onglet "Campagnes" dans la navigation du CRM. Page liste des campagnes avec statut.',
 'marketing', 'high', 'medium', 120, false),

('Phase 4 - Éditeur visuel d''emails',
 'Intégrer React Email Editor (Unlayer) pour permettre la création visuelle des emails avec drag & drop.',
 'marketing', 'high', 'hard', 121, false),

('Phase 5 - Constructeur de segments',
 'Interface pour créer des segments de contacts basés sur les filtres du CRM. Sauvegarde + réutilisation.',
 'marketing', 'high', 'medium', 122, false),

('Phase 6 - Templates réutilisables',
 'Librairie de templates d''emails que l''équipe peut réutiliser. Preview + duplication.',
 'marketing', 'medium', 'medium', 123, false),

('Phase 7 - Envoi & programmation',
 'Envoi immédiat + programmation. Envoi en batch par lot de 100 (rate limiting Brevo).',
 'marketing', 'critical', 'hard', 124, false),

('Phase 8 - Dashboard stats emails',
 'Graphiques : taux d''ouverture, clics, désabonnements, bounces par campagne.',
 'marketing', 'high', 'medium', 125, false),

('Webhook Brevo pour événements temps réel',
 'Endpoint webhook créé, reste à le configurer côté Brevo avec l''URL de production.',
 'marketing', 'high', 'easy', 126, false),

('Gestion des désabonnements (RGPD)',
 'Lien de désabonnement dans chaque email. Page publique de désabonnement. Blocage automatique pour les futurs envois.',
 'marketing', 'critical', 'medium', 127, false),

('SMS dans les campagnes (SMS Factor)',
 'Étendre les campagnes aux SMS : même logique de segments mais pour SMS au lieu d''email.',
 'marketing', 'medium', 'medium', 128, false),

-- ─── 8. AUTOMATISATIONS & CRONS ────────────────────────────────────────────
('Garder : cron SMS 48h / 24h / intraday / morning',
 'Ces crons sont déjà indépendants de HubSpot (sauf la sync deal stage). Les vérifier et garder.',
 'automations', 'medium', 'easy', 140, false),

('Adapter : cron auto-replanifier',
 'Actuellement update HubSpot. À adapter pour update deals natifs + déclencher workflow "no show".',
 'automations', 'high', 'medium', 141, true),

('Supprimer : cron hubspot-sync',
 'Une fois la migration terminée, supprimer ce cron et la route associée.',
 'automations', 'medium', 'easy', 142, true),

('Supprimer : cron crm-sync',
 'Idem, ce cron import HubSpot → Supabase ne sera plus utile.',
 'automations', 'medium', 'easy', 143, true),

('Créer cron : nettoyage campagnes expirées',
 'Archive automatiquement les campagnes "sent" de plus de 6 mois.',
 'automations', 'low', 'easy', 144, false),

('Créer cron : sync désabonnements Brevo',
 'Récupère la liste des désabonnés depuis Brevo tous les jours + met à jour la table locale.',
 'automations', 'medium', 'easy', 145, false),

-- ─── 9. MIGRATION & COUPURE HUBSPOT ────────────────────────────────────────
('Export complet HubSpot (backup)',
 'Avant tout : faire un export CSV/JSON complet de tous les contacts + deals HubSpot. Garder comme backup.',
 'migration', 'critical', 'easy', 160, true),

('Import initial vers Supabase',
 'Une fois le schéma prêt, importer toutes les données HubSpot.',
 'migration', 'critical', 'hard', 161, true),

('Période de double-lecture',
 'Pendant 2-4 semaines : lire en priorité sur Supabase, fallback HubSpot. Permet de tester sans risque.',
 'migration', 'high', 'medium', 162, true),

('Validation coéquipier (recette manuelle)',
 'L''équipe teste toutes les fonctionnalités pendant la période de double-lecture et remonte les bugs.',
 'migration', 'critical', 'medium', 163, false),

('Désactiver les appels HubSpot dans le code',
 'Retirer tous les `fetch(hubspot...)`. Les routes `/api/hubspot/*` deviennent inutiles.',
 'migration', 'high', 'medium', 164, true),

('Supprimer les tokens HubSpot',
 'Retirer les variables HUBSPOT_ACCESS_TOKEN, HUBSPOT_PIPELINE_ID, etc. de Vercel et .env.local.',
 'migration', 'medium', 'easy', 165, true),

('Résilier l''abonnement HubSpot',
 'Une fois tout validé et aucun appel sortant depuis ~1 mois, résilier le compte.',
 'migration', 'high', 'easy', 166, true),

('Documentation interne nouvelle plateforme',
 'Rédiger un guide utilisateur (admin, closer, télépro) expliquant les nouvelles interfaces.',
 'migration', 'high', 'medium', 167, false),

-- ─── 10. QUALITÉ & SÉCURITÉ ────────────────────────────────────────────────
('Tests automatiques (critique)',
 'Tests unitaires sur les fonctions métier + tests d''intégration sur les routes API principales.',
 'qualite', 'medium', 'hard', 180, false),

('Audit de sécurité',
 'Vérifier : Row-Level Security Supabase, rate limiting sur routes publiques, protection CSRF.',
 'qualite', 'high', 'medium', 181, false),

('Monitoring erreurs (Sentry)',
 'Intégrer Sentry pour voir les erreurs en production en temps réel.',
 'qualite', 'medium', 'easy', 182, false),

('Backups automatiques Supabase',
 'Vérifier que les backups PostgreSQL sont bien planifiés sur Supabase (quotidiens).',
 'qualite', 'critical', 'easy', 183, false),

('RGPD : droit à l''oubli',
 'Bouton "Supprimer ce contact" qui efface toutes les données liées (RDV, deals, emails, notes).',
 'qualite', 'critical', 'medium', 184, false),

('RGPD : export des données (portabilité)',
 'Permettre à un contact de demander l''export de ses données. Génère un JSON/CSV.',
 'qualite', 'high', 'easy', 185, false),

('Documentation développeur',
 'README, schéma DB, doc des routes API, conventions du code.',
 'qualite', 'medium', 'medium', 186, false);
