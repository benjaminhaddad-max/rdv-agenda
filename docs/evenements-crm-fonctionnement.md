# Événements CRM — Guide de fonctionnement

Documentation de la partie **Marketing → Événements** sur [hub.diploma-sante.fr](https://hub.diploma-sante.fr).

---

## 1. À quoi ça sert ?

Le module Événements permet de :

1. **Créer** des événements (JPO, salons, webinaires) par marque
2. **Générer automatiquement** un formulaire CRM d’inscription leads
3. **Partager** un planning public pour que le **staff** s’inscrive aux JPO / salons Diploma
4. **Publier** (et déclencher emails/SMS quand c’est prévu)
5. Suivre inscriptions participants et staff

Les données événements vivent encore dans la **base Events** (Supabase projet Events). Les formulaires et leads sont dans le **CRM**.

---

## 2. Où trouver le module ?

| Accès | URL |
|--------|-----|
| Liste événements | `/admin/crm/events` |
| Créer un événement | `/admin/crm/events/new` |
| Fiche événement | `/admin/crm/events/[id]` |
| Planning Diploma (admin) | `/admin/crm/events/planning` |

Dans la nav Marketing : onglet **Événements**.

---

## 3. Marques et types

### Marques

| Marque | Types disponibles |
|--------|-------------------|
| **Diploma Santé** | JPO, Salon, Webinaire |
| **Medibox** | JPO, Webinaire |
| **EduMove** | Webinaire uniquement |

### Comportement par type

| Type | Formulaire CRM auto | Emails / SMS à la publication | Staff / planning | QR check-in |
|------|---------------------|-------------------------------|------------------|-------------|
| **JPO** | Oui | Oui | Oui | Oui |
| **Salon** | Oui | **Non** (collecte seule) | Oui | Non |
| **Webinaire** | Oui | Oui | Non | Non |

**Salon** = formulaire CRM pour collecter les leads sur stand, **aucune** communication Brevo/SMS à la publication.

---

## 4. Parcours : créer un événement

Wizard en **3 étapes** (`/admin/crm/events/new`) :

### Étape 1 — Marque & type

Choisir la marque puis le type (selon les règles ci-dessus).

### Étape 2 — Infos événement

- Nom, date, heure début / fin
- Lieu : campus Diploma (JPO), texte libre (salon / autres), ou lien Zoom (webinaire)
- Capacité, description, statut initial (brouillon / publié)

### Étape 3 — Formulaire CRM

À l’enregistrement, le CRM crée **automatiquement** un formulaire publié, lié à l’événement.

**Nom du formulaire** : `Nom de l'événement — JJ/MM/AAAA`  
(ex. `JPO Printemps Paris — 15/03/2026`)

**Formulaire type (6 champs)** :

| Champ | Mapping CRM | Obligatoire |
|-------|-------------|-------------|
| Prénom | `firstname` | Oui |
| Nom | `lastname` | Oui |
| Téléphone | `phone` | Non |
| Email | `email` | Oui |
| Classe actuelle | `classe_actuelle` (liste) | Oui |
| Département | `departement` | Oui |

Vous pouvez **ajouter des propriétés CRM** supplémentaires avant de créer (picker propriétés contacts).

Le formulaire est rangé dans le dossier de la marque (`Diploma Santé` / `Medibox` / `Edumove`).

### Après création

La fiche événement affiche :

- Lien public du formulaire (`/forms/{slug}`)
- Bouton **Éditer le formulaire** → builder CRM classique
- Inscriptions participants
- Lien staff (JPO / salon)
- Actions Publier / Dépublier / Supprimer

---

## 5. Planning staff Diploma (très important)

### Objectif

Vous créez à l’avance les **JPO** et **salons** de l’année.  
Vous partagez **un seul lien public** : les collaborateurs choisissent les événements auxquels ils veulent participer.

### Où le trouver ?

1. Aller sur **Événements**
2. Sélectionner la marque **Diploma Santé**
3. Carte **Planning staff** en haut : lien + Copier / Ouvrir / Voir le planning

Ou directement : `/admin/crm/events/planning`

### Lien public (exemple)

```
https://hub.diploma-sante.fr/events-studio/?planning=diploma&year=2026
```

- Accessible **sans compte CRM**
- Affiche uniquement les JPO / salons Diploma **à venir** (pas les passés)
- Inscriptions enregistrées dans `staff_registrations` (base Events)

### Ce qui n’apparaît pas dans le planning

- Webinaires
- Événements Medibox / EduMove
- Événements **passés**
- Événements annulés (côté lien public)

---

## 6. Liens publics utiles

| Usage | Format |
|-------|--------|
| Formulaire leads | `https://hub.diploma-sante.fr/forms/{slug}` |
| Planning staff annuel | `/events-studio/?planning=diploma&year=YYYY` |
| Inscription staff **un** événement | `/events-studio/?staff={event_id}` |
| Page QR participant | `/q/{code}` ou `/events-studio/?qr={code}` |

---

## 7. Publication et communications

- **Brouillon** → pas d’envoi
- **Publier** un JPO / webinaire → peut déclencher les confirmations (Edge Functions Events : email / SMS)
- **Publier** un salon → collecte active, **aucun** email/SMS

Les chaînes Brevo / SMS Factor restent gérées côté plateforme Events (Edge Functions), pas recréées dans le CRM.

---

## 8. Architecture technique (résumé)

```
CRM UI (/admin/crm/events)
    │
    ├─ POST /api/events-studio/events
    │     ├─ insert event → Supabase Events
    │     ├─ create form CRM (template 6 champs)
    │     └─ link event_forms
    │
    ├─ GET /api/events-studio/planning
    │     └─ JPO/salons Diploma à venir + compteurs staff
    │
    └─ Pages publiques /events-studio/
          ├─ ?planning=diploma&year=YYYY  (inscription staff multi-événements)
          ├─ ?staff={id}                  (inscription staff 1 événement)
          └─ ?qr={code}                   (QR participant)
```

### Variables d’environnement CRM

| Variable | Rôle |
|----------|------|
| `EVENTS_SUPABASE_URL` | URL projet Events |
| `EVENTS_SUPABASE_SERVICE_ROLE_KEY` | Écritures admin (bypass RLS) |

Sans la service role, la **lecture** peut marcher, la **création** d’événements échoue (RLS).

### Fichiers clés

| Fichier / dossier | Rôle |
|-------------------|------|
| `app/admin/crm/events/` | UI liste, wizard, détail, planning |
| `app/api/events-studio/` | APIs events, forms, planning, QR, preview |
| `lib/events-studio/` | Config marques/types, template form, client Events |
| `public/events-studio/` | SPA publique (planning / staff / QR) |

---

## 9. Checklist opérationnelle Diploma

1. Créer les **JPO** et **salons** de l’année (wizard)
2. Vérifier chaque formulaire CRM (lien + éventuellement propriétés en plus)
3. Copier le **lien planning staff** et l’envoyer aux équipes
4. Suivre les inscriptions staff sur `/admin/crm/events/planning`
5. Publier les événements au bon moment (JPO = comms ; salon = pas de comms)
6. Partager le **lien formulaire** pour la collecte leads (stand / campagne)

---

## 10. Limites actuelles (à connaître)

- Le planning / QR / staff public s’appuie encore sur la SPA `/events-studio/` (pas tout porté en React)
- Pas encore de table `crm_events` unifiée dans le CRM (sync profonde leads ↔ événements = prochaine phase)
- Scanner QR admin et préviews email/SMS riches restent côté ancien outil / Edge Functions

---

*Dernière mise à jour : août 2026 — parcours natif CRM + planning Diploma.*
