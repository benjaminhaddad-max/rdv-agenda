# Configuration des webhooks HubSpot → CRM

## Pourquoi

Pour que **toute modification dans HubSpot** (propriétaire, statut, propriété custom, deal stage, suppression…) soit propagée au CRM en **moins de 5 secondes**, sans dépendre du polling 5-min qui peut louper des changements.

## Architecture

```
HubSpot ──► POST /api/webhooks/hubspot ──► batch read ──► Supabase
                  ↑
                  vérifie HMAC-SHA256 v3 + timestamp < 5 min
```

Plus :
- **Cron nightly à 3h** (`/api/cron/crm-sync?full=1`) — filet de sécurité qui rattrape ce qui aurait été perdu (rare avec retry HubSpot 10x sur 24h)

---

## Étapes de configuration

### 1. Créer une "Private App" HubSpot (si pas déjà fait)

1. HubSpot → Settings (en haut à droite, icône engrenage)
2. Account Setup → Integrations → **Private Apps**
3. **Create a private app**
4. Onglet "Scopes" : cocher au minimum
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.objects.deals.read`
   - `crm.objects.deals.write`
   - `crm.schemas.contacts.read`
5. Onglet "Auth" : copier le **Access Token** → variable Vercel `HUBSPOT_ACCESS_TOKEN`

### 2. Configurer les webhooks

⚠️ **Important** : les webhooks HubSpot ne se configurent PAS sur les Private Apps. Tu dois créer une **Public App** dédiée aux webhooks :

1. Va sur https://developers.hubspot.com/
2. Crée une App (ou utilise une existante)
3. Onglet **"Webhooks"** dans l'app config
4. **Target URL** : `https://[ton-domaine-vercel].vercel.app/api/webhooks/hubspot`
5. **Throttling** : 100 / 10 sec (par défaut, suffit largement)
6. **Subscriptions** — cocher :
   - `contact.creation`
   - `contact.deletion`
   - `contact.propertyChange` → choisir les propriétés à surveiller :
     - `firstname`, `lastname`, `email`, `phone`
     - `hubspot_owner_id`, `teleprospecteur`
     - `hs_lead_status`, `origine`, `source`
     - `classe_actuelle`, `departement`, `zone___localite`
     - `formation_souhaitee`, `diploma_sante___formation_demandee`
     - `recent_conversion_date`, `recent_conversion_event_name`
     - **Toute autre propriété custom que tu veux surveiller**
   - `deal.creation`
   - `deal.deletion`
   - `deal.propertyChange` → propriétés :
     - `dealname`, `dealstage`, `pipeline`
     - `hubspot_owner_id`, `teleprospecteur`
     - `diploma_sante___formation`
     - `closedate`, `description`
7. **Activer les subscriptions** (toggle sur ON pour chacune)
8. Sauvegarder

### 3. Récupérer le Client Secret

Dans la même app HubSpot :
1. Onglet **"Auth"**
2. Copier **"Client Secret"**
3. Ajouter dans Vercel :
   ```
   HUBSPOT_CLIENT_SECRET=sk-xxxxxxxxxxxx
   ```
4. **Redéployer** Vercel pour que la variable soit chargée

### 4. Installer l'app sur ton portal HubSpot

L'app publique doit être installée sur le portal cible pour que les events soient envoyés :
1. Dans la config de l'app, onglet "Install" / "Auth"
2. Générer l'URL d'installation OAuth
3. L'ouvrir, sélectionner le portal `26711031`
4. Accepter les scopes

### 5. Tester

#### Test manuel
1. Va dans HubSpot, change la propriété d'un contact (ex. statut du lead)
2. Surveille les logs Vercel : tu devrais voir un POST sur `/api/webhooks/hubspot` quasi instantanément
3. Rafraîchis ton CRM → la modification est visible

#### Test endpoint
```bash
# Vérifie que l'endpoint répond
curl https://[ton-domaine].vercel.app/api/webhooks/hubspot
# → {"ok":true,"endpoint":"hubspot-webhook",...}
```

---

## Format des events reçus

HubSpot envoie un POST avec un body JSON tableau :

```json
[
  {
    "eventId": 12345,
    "subscriptionId": 67890,
    "portalId": 26711031,
    "appId": 9999999,
    "occurredAt": 1715616000000,
    "subscriptionType": "contact.propertyChange",
    "attemptNumber": 0,
    "objectId": 673689013487,
    "propertyName": "hubspot_owner_id",
    "propertyValue": "76299546",
    "changeSource": "CRM_UI",
    "changeFlag": "UPDATED"
  }
]
```

L'endpoint :
1. Vérifie la signature `X-HubSpot-Signature-v3`
2. Vérifie que `X-HubSpot-Request-Timestamp` est récent (anti-rejeu < 5 min)
3. Groupe les events par `objectId` (HubSpot peut envoyer plusieurs propertyChanges pour le même contact en une requête)
4. **Batch read** les contacts/deals touchés (récupère l'état **complet** et **frais**)
5. **Upsert** dans Supabase

## Gestion des erreurs

- **HubSpot retry automatiquement** 10x sur 24h en cas d'erreur 5xx ou timeout
- En cas de signature invalide → 401 (HubSpot loggue, n'envoie pas de retry pour des 401)
- En cas de JSON invalide → 400
- Les `crm_sync_log` reçoivent une trace avec `source: 'webhook'`

## Coexistence avec le polling actuel

Tu peux **garder le cron 5-min** (`/api/cron/hubspot-new-leads`) pendant la phase de transition. Les webhooks et le polling ne se gênent pas (l'upsert est idempotent). Une fois confiance acquise, le cron 5-min peut être désactivé ou ralenti.

Le **nightly full sync** reste indispensable pour rattraper les events ratés (si webhook + retries HubSpot échouent, ce qui est rare).

---

## Checklist finale

- [ ] App HubSpot publique créée
- [ ] Subscriptions configurées (contact + deal: creation, deletion, propertyChange)
- [ ] Target URL pointe vers `/api/webhooks/hubspot`
- [ ] `HUBSPOT_CLIENT_SECRET` ajouté à Vercel + redéployé
- [ ] App installée sur le portal cible
- [ ] Test manuel OK (modif HubSpot → visible dans CRM en < 5s)
- [ ] Logs Vercel surveillés sur les premières 24h
