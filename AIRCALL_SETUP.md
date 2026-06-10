# Aircall — Affichage du nom des leads sur le téléphone des télépros

Quand un lead **rappelle** un télépro, on veut que son `Prénom Nom — Telepro: X`
s'affiche sur le téléphone Aircall, au lieu d'un numéro inconnu.

Pour ça, on pousse les contacts du CRM dans le **carnet d'adresses partagé Aircall**.

## Comment ça marche

```
CRM (Supabase crm_contacts)
        │
        ├── Seed initial : CSV uploadé via Dashboard Aircall (1 fois)
        │
        └── Mises à jour : cron /api/cron/aircall-sync toutes les 10 min
                          → pousse les contacts modifiés / créés
                          → carnet partagé Aircall visible par TOUS les télépros
```

Côté télépro : **rien à faire, rien à installer**. Quand un lead rappelle,
Aircall reconnaît le numéro et affiche le nom automatiquement.

## Setup initial (~ 10 min)

### 1. Générer les clés API Aircall

1. Connecte-toi sur [https://dashboard.aircall.io](https://dashboard.aircall.io)
2. **Integrations & API → API Keys** (ou *API Keys & Tokens*)
3. **Create API Key** — nom : `RDV Agenda CRM Sync`
4. Aircall affiche un **API ID** et un **API Token** (le token n'est montré qu'une fois)

### 2. Ajouter les variables d'environnement

Sur **Vercel** (Settings → Environment Variables, env = Production) :

```
AIRCALL_API_ID=...
AIRCALL_API_TOKEN=...
```

Et en local dans `.env.local` (si tu veux tester) :

```
AIRCALL_API_ID=...
AIRCALL_API_TOKEN=...
```

### 3. Seed initial — uploader le CSV des contacts existants

Le cron a un rate-limit de 60 appels/min côté Aircall. Pour ~ 160k contacts
il faudrait des jours, donc on fait un seul gros import via le dashboard :

```bash
bun run scripts/export-aircall-contacts.mjs
```

Ça génère `exports/aircall-contacts-YYYY-MM-DD.csv`.

Puis :

1. **Dashboard Aircall** → **Contacts** → **Shared** (carnet partagé)
2. **Import contacts** → upload le CSV
3. Attendre la fin de l'import

### 4. Déployer le cron

Le fichier `vercel.json` contient maintenant :

```json
{ "path": "/api/cron/aircall-sync", "schedule": "*/10 * * * *" }
```

Au prochain déploiement Vercel, le cron tourne automatiquement.
Toutes les 10 min il regarde les contacts CRM modifiés dans les 20 dernières
minutes et les pousse à Aircall.

## Vérifier que ça marche

### Manuellement (curl)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://rdv-agenda.vercel.app/api/cron/aircall-sync
```

Réponse attendue :

```json
{ "ok": true, "processed": 7, "created": 2, "updated": 3, "skipped": 2 }
```

### Côté Aircall

1. **Dashboard Aircall** → **Contacts** → **Shared** → recherche un nom récent
   → il doit apparaître, avec le suffixe `— Telepro: X`
2. **Sur le téléphone du télépro** : quand un lead rappelle, le nom doit
   s'afficher directement.

## Remonter l'historique d'appels dans le CRM (webhook)

En plus de l'affichage du nom, on remonte chaque appel terminé dans la timeline
de la fiche contact (`crm_activities`, type `call`) : appel entrant/sortant,
durée, appel manqué, messagerie, lien d'enregistrement, agent.

### Endpoint

```
POST https://rdv-agenda.vercel.app/api/webhooks/aircall
```

À chaque event `call.ended`, le webhook :
1. retrouve le contact CRM par le numéro (`raw_digits` → toutes les variantes) ;
2. mappe l'agent Aircall (email) → owner CRM si l'email existe dans `rdv_users` ;
3. enregistre l'appel dans `crm_activities` (idempotent : un seul enregistrement
   par appel grâce à l'id Aircall).

### Setup (~ 5 min)

1. **(Recommandé) Choisir un token secret** et l'ajouter sur Vercel :
   ```
   AIRCALL_WEBHOOK_TOKEN=un-secret-aleatoire
   ```
   S'il n'est pas défini, le webhook accepte tout (ok pour démarrer, mais
   mets-le en prod).
2. **Dashboard Aircall** → **Integrations & API → Webhooks** → **Create webhook**
   - URL : `https://rdv-agenda.vercel.app/api/webhooks/aircall?token=<le-token>`
   - Events : cocher **`call.ended`**
3. Passe un appel de test depuis/vers un numéro présent dans le CRM, puis ouvre
   la fiche du contact → l'appel doit apparaître dans la timeline (onglet *Appel*).

### Vérifier

```bash
curl https://rdv-agenda.vercel.app/api/webhooks/aircall   # GET → infos d'usage
```

Réponse d'un `call.ended` traité :

```json
{ "ok": true, "matched": true, "contact_id": "123", "status": "COMPLETED", "direction": "INCOMING" }
```

Si le numéro n'est rattaché à aucun contact : `{ "ok": true, "matched": false }`.

## Limites connues

- **Pas d'OAuth par télépro** — c'est un seul carnet partagé pour toute
  l'équipe. C'est ce qui était demandé et c'est le plus simple à maintenir.
- **Rate limit Aircall = 60 req/min** — le cron est calibré à 25 contacts
  par run (≈ 50 req/min). Si un jour il y a beaucoup de nouveaux contacts
  d'un coup, ils seront poussés sur plusieurs runs successifs.
- **Numéros non français** : seuls les numéros au format français
  (`+33...`, `0...`, `33...`) sont normalisés ; les numéros déjà en E.164
  d'un autre pays passent aussi.

## Désactiver la synchro

Suffit de retirer `AIRCALL_API_ID` et `AIRCALL_API_TOKEN` des env Vercel.
Le cron continuera à tourner mais répondra `{ ok: true, skipped: true }`
sans appeler Aircall. Aucune autre partie de l'app n'est impactée.
