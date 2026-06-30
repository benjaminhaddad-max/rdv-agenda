# Last Chance Médecine — Contenus à produire par CTA (base leads IDF / Paris)

Audience : **futurs PASS/LAS en Île-de-France**, place en médecine acquise pour septembre 2026.  
Objectif des CTA : **re-qualifier** (prépa signée / en réflexion / sans prépa) + orienter vers le bon comparatif ou conseil **Paris**.

Facs à citer systématiquement : **Paris Cité, Sorbonne, Paris-Saclay, UPEC (Créteil), Sorbonne Paris Nord (Villetaneuse), UVSQ**.

---

## Synthèse — pages à avoir prêtes

| Priorité | Page / asset | Marque | Statut | Utilisée par |
|----------|--------------|--------|--------|--------------|
| P0 | Comparatif prépas Paris 2026 | AFEM | ✅ Existe — à enrichir | J1, J5, J9, J13, J17 |
| P0 | Formulaire re-qualification prépa (CRM) | Diploma / hub | ⚠️ À configurer | Tous les mails (lien `{{lien_formulaire}}`) |
| P1 | Comparatif prépas Paris + demande conseil | PrépaMédecine | ⚠️ Partiel (`/prepa-medecine-paris/`) | J4, J8, J12, J16, J20 |
| P1 | Landing PASS/LAS Paris + prise de contact | Hermione | ⚠️ Page générique `/pass-las/` | J3, J7, J11, J15, J19 |
| P1 | Landing coachs PASS/LAS Paris | Numerus | ❌ À créer (section ou page dédiée) | J2, J6, J10, J14, J18 |
| P2 | PDF « Planning été PASS/LAS Paris » | Hermione | ❌ À créer | J7 |
| P2 | Page « Oraux PASS/LAS — facs parisiennes » | Hermione | ❌ À créer ou section | J15 |
| P2 | Page « Concours blanc avant rentrée — Paris » | Numerus | ❌ À créer ou section | J6 |

---

## Formulaire CRM (tous les mails) — champs obligatoires

**URL** : formulaire pré-rempli lié au programme (`{{lien_formulaire}}`).

| Champ | Type | Obligatoire | Pourquoi |
|-------|------|-------------|----------|
| Prénom, nom, email, tel | auto CRM | oui | identification |
| **Fac parisienne visée** | liste | oui | Paris Cité / Sorbonne / Saclay / UPEC / USPN / UVSQ / pas encore fixé |
| **Cursus** | liste | oui | PASS / LAS / LSPS |
| **Statut prépa** | liste | oui | Déjà inscrit / En réflexion / Pas de prépa / Je ne sais pas |
| **Nom de la prépa** (si inscrit) | texte | conditionnel | re-qualification |
| **Budget max prépa** | liste | recommandé | < 6k / 6–8k / 8–10k / > 10k |
| **Ville de résidence IDF** | texte ou liste | recommandé | segment |
| Consentement contact | case | oui | RGPD |

**Sortie CRM** : tag `last-chance-idf` + propriété `statut_prepa` pour routage télépro.

---

## Détail par email (J1 → J20)

### J1 — AFEM
- **CTA bouton** : « Je découvre le comparatif des prépas à Paris → »
- **URL** : `https://www.afem-edu.fr/prepas-medecine/paris`
- **Statut page** : ✅ existe
- **Contenu à vérifier / compléter sur la page** :
  - [ ] Intro « Tu as ta place en PASS/LAS à Paris — as-tu déjà choisi ta prépa ? »
  - [ ] Tableau : Diploma, Médisup, Antémed-Epsilon, CPCM (tarifs 2026, PASS/LAS)
  - [ ] Colonne « Facs parisiennes couvertes » (6 facs)
  - [ ] Encart « Déjà inscrit ? Vérifie que ta prépa couvre TA fac »
  - [ ] CTA secondaire → formulaire re-qual (2 min)
  - [ ] FAQ : meilleure prépa Paris, coût, faut-il une prépa
- **Lien formulaire** : « As-tu déjà choisi ta prépa ? Je réponds en 2 min → »

---

### J2 — Numerus
- **CTA bouton** : « Faire le point avec un étudiant PASS/LAS à Paris → »
- **URL cible** : `https://www.numerusclub.fr/pass-las-paris` *(à créer — en attendant : `coachs.html` + filtre Paris)*
- **Contenu à créer** :
  - [ ] Titre H1 : « Échange gratuit avec un étudiant PASS/LAS en fac parisienne »
  - [ ] Sous-titre : Paris Cité, Sorbonne, Saclay, UPEC, USPN, UVSQ
  - [ ] 3 bénéfices : niveau réel, rythme concours parisien, plan d’action été
  - [ ] Liste coachs / étudiants **avec fac parisienne indiquée**
  - [ ] Formulaire : fac + PASS/LAS + dispo créneau
  - [ ] Mention « gratuit pour la mise en relation »
- **Lien formulaire** : profil PASS/LAS Paris + statut prépa

---

### J3 — Hermione
- **CTA bouton** : « Structurer ma méthode PASS/LAS à Paris → »
- **URL** : `https://hermione.co/pass-las/` *(existe — ajouter angle Paris)*
- **Contenu à ajouter sur la page** :
  - [ ] Bloc « Rentrée PASS/LAS Paris 2026 »
  - [ ] Méthode 3 piliers (planning, mémorisation, stress)
  - [ ] Témoignage étudiant fac parisienne
  - [ ] CTA prise de RDV / formulaire
- **Lien formulaire** : statut prépa oui/non

---

### J4 — PrépaMédecine
- **CTA bouton** : « Recevoir mon comparatif prépa Paris sous 24 h → »
- **URL** : `https://prepamedecine.fr/prepa-medecine-paris/`
- **Contenu à créer / compléter** :
  - [ ] H1 comparatif indépendant **prépas Paris uniquement**
  - [ ] Formulaire : fac parisienne, budget, PASS/LAS, prépa déjà choisie ?
  - [ ] Promesse : rappel sous 24 h, 15–20 min, gratuit
  - [ ] Logos / noms prépas Paris (pas national)
  - [ ] Preuve : indépendant, ne vend aucune prépa
- **Lien formulaire** : fac + budget IDF

---

### J5 — AFEM
- **CTA** : comparatif Paris (même page J1)
- **Contenu additionnel sur page** (ancre ou encart) :
  - [ ] Section « Prépa vs tutorat vs autonomie à Paris »
  - [ ] Arbre de décision selon fac + budget
  - [ ] Liens tutorats gratuits associations facs parisiennes (optionnel)

---

### J6 — Numerus
- **CTA bouton** : « Réserver un concours blanc PASS/LAS Paris → »
- **URL cible** : `https://www.numerusclub.fr/concours-blanc-pass-las-paris` *(à créer)*
- **Contenu à créer** :
  - [ ] Description simulation (durée, matières, correction)
  - [ ] Alignement annales **facs parisiennes**
  - [ ] Tarif / gratuité première session
  - [ ] Formulaire : fac parisienne + date souhaitée
  - [ ] FAQ : différence avec partiel de fac

---

### J7 — Hermione
- **CTA bouton** : « Télécharger le planning été PASS/LAS Paris → »
- **URL** : landing avec lead magnet *(à créer, ex. `/pass-las/planning-ete-paris`)*
- **Contenu à créer** :
  - [ ] **PDF téléchargeable** : planning 8 semaines, 3–5 sessions/sem., matières selon fac Paris
  - [ ] Page capture : email + fac + PASS/LAS
  - [ ] Aperçu visuel du planning dans la page
  - [ ] CTA coaching si besoin d’accompagnement

---

### J8 — PrépaMédecine
- **CTA bouton** : « Comparer les prépas PASS/LAS à Paris → »
- **URL** : `https://prepamedecine.fr/prepa-medecine-paris/` (+ filtres budget)
- **Contenu** :
  - [ ] Filtres : budget, présentiel Paris / hybride, PASS/LAS
  - [ ] Fiches prépas **uniquement Paris / IDF**
  - [ ] CTA conseiller si hésitation entre 2 structures

---

### J9 — AFEM
- **CTA** : comparatif Paris — **ancre** « Quelle prépa pour quelle fac parisienne »
- **Contenu à ajouter** :
  - [ ] Tableau croisé prépa × fac (6 colonnes facs)
  - [ ] Coefficients / type épreuves par fac (lien pages facultés AFEM)

---

### J10 — Numerus
- **CTA bouton** : « Échanger avec un ancien PASS/LAS parisien → »
- **URL** : même landing J2 ou `coachs.html` filtré Paris
- **Contenu** :
  - [ ] Angle « comprendre le classement en fac parisienne »
  - [ ] Témoignages par fac (2–3 mini-cas)

---

### J11 — Hermione
- **CTA bouton** : « Calibrer mon été PASS/LAS à Paris → »
- **URL** : `https://hermione.co/pass-las/` ou page dédiée été
- **Contenu** :
  - [ ] Quiz ou formulaire : heures dispo / fac / prépa ou non
  - [ ] Recommandation charge de travail été
  - [ ] CTA RDV conseil

---

### J12 — PrépaMédecine
- **CTA bouton** : « Répondre aux 4 questions (prépa Paris) → »
- **URL** : page avec **4 questions** + formulaire
- **Contenu à créer** :
  - [ ] Page interactive ou formulaire guidé :
    1. Quelle fac parisienne ?
    2. Budget total ?
    3. Cadre ou autonomie ?
    4. Prépa seule ou combo ?
  - [ ] Résultat : « on te rappelle sous 24 h avec short-list Paris »

---

### J13 — AFEM
- **CTA** : comparatif Paris — **ancre** tarifs / coût réel
- **Contenu** :
  - [ ] Tableau prix affiché vs prix final (options)
  - [ ] Fourchettes 6 100 € – 9 200 € Paris
  - [ ] Encart « déjà signé ? vérifie les frais cachés »

---

### J14 — Numerus
- **CTA bouton** : « Éviter les 5 erreurs PASS/LAS à Paris → »
- **URL** : `https://www.numerusclub.fr/pass-las-paris` *(section « 5 erreurs »)*
- **Contenu** :
  - [ ] Article ou bloc les 5 erreurs (contexte parisien)
  - [ ] CTA échange avec coach parisien

---

### J15 — Hermione
- **CTA bouton** : « Préparer mes oraux PASS/LAS (facs parisiennes) → »
- **URL** : `https://hermione.co/pass-las/oraux-paris` *(à créer)*
- **Contenu à créer** :
  - [ ] Quelles facs parisiennes ont oral / rédactionnel significatif
  - [ ] Format simulation Hermione
  - [ ] Tarifs / premier échange gratuit ?
  - [ ] Formulaire prise de RDV

---

### J16 — PrépaMédecine
- **CTA bouton** : « Voir les avis sur les prépas PASS/LAS à Paris → »
- **URL** : `/prepa-medecine-paris/` section avis
- **Contenu** :
  - [ ] Avis structurés par critère (suivi, corrections, alignement fac Paris)
  - [ ] Pas seulement note Google
  - [ ] CTA conseiller indépendant

---

### J17 — AFEM
- **CTA** : comparatif Paris — **ancre** épreuves / barème par fac
- **Contenu** :
  - [ ] Fiche par fac : QCM vs rédactionnel vs oral
  - [ ] Lien vers pages `afem-edu.fr/facultes/paris-*`

---

### J18 — Numerus
- **CTA bouton** : « Trouver un coach PASS/LAS Paris avant la rentrée → »
- **URL** : landing J2
- **Contenu** : angle « avantage de l’été » + mise en relation gratuite

---

### J19 — Hermione
- **CTA bouton** : « Réserver un premier échange PASS/LAS Paris → »
- **URL** : `https://hermione.co/pass-las/` + Calendly / formulaire RDV
- **Contenu** :
  - [ ] Page RDV : 15 min découverte, objectifs été, fac parisienne
  - [ ] FAQ coaching vs prépa

---

### J20 — PrépaMédecine
- **CTA bouton** : « Valider ma checklist rentrée PASS/LAS Paris → »
- **URL** : page checklist + formulaire rappel
- **Contenu à créer** :
  - [ ] Checklist 7 points **version Paris** (fac nommée, annales fac parisienne, etc.)
  - [ ] PDF téléchargeable optionnel
  - [ ] CTA « il me manque un point → rappel conseiller »

---

## Ordre de production recommandé

1. **Formulaire CRM re-qualification** (bloquant pour tous les mails)
2. **AFEM** — enrichir `/prepas-medecine/paris` (ancres tarifs, fac×prépa, épreuves)
3. **PrépaMédecine** — finaliser `/prepa-medecine-paris/` + formulaire conseil
4. **Numerus** — une landing `pass-las-paris` (coachs + concours blanc + 5 erreurs)
5. **Hermione** — PDF planning été + page oraux Paris + RDV sur `/pass-las/`

---

## URLs techniques dans le code (après mise à jour)

| Marque | URL par défaut CTA |
|--------|-------------------|
| AFEM | `https://www.afem-edu.fr/prepas-medecine/paris` |
| PrépaMédecine | `https://prepamedecine.fr/prepa-medecine-paris/` |
| Hermione | `https://hermione.co/pass-las/` |
| Numerus | `https://www.numerusclub.fr/pass-las-paris` *(placeholder jusqu’à création)* |
