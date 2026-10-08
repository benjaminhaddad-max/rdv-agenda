# Hub Diploma — dossier App Store (iOS) · v1.0.0

> Dossier de référence pour publier l'app **Hub Diploma** (CRM interne) sur l'App
> Store **en accès privé**, réservée aux collaborateurs Diploma Santé.
> Projet natif : [`mobile/`](../mobile/README.md). Dernière mise à jour : 8 octobre 2026.

---

## 1. Choix de distribution : app « non listée »

Trois façons de donner une app iOS uniquement à ses équipes :

| Option | Pour qui | Délai / contraintes | Verdict |
|---|---|---|---|
| **App non listée** (*Unlisted app distribution*) | N'importe qui ayant le **lien direct** ; invisible dans la recherche, les classements et les catégories de l'App Store | Review Apple classique + **demande de passage en non listé** à Apple (formulaire). Pas de limite de durée, mises à jour normales | ✅ **Retenu** — même modèle que **Diploma Live** (déjà en `DIRECT_URL` sur le compte) |
| App personnalisée (*Custom App* via Apple Business Manager) | Uniquement les appareils/Apple ID de l'organisation dans Apple Business Manager | Nécessite Apple Business Manager (numéro D-U-N-S, validation Apple) + distribution par codes ou MDM | Plus fermé, mais beaucoup plus lourd à mettre en place pour ~20 collaborateurs |
| TestFlight seul | Testeurs invités (100 internes / 10 000 externes) | Builds qui **expirent au bout de 90 jours**, app « bêta » | OK pour tester avant la review, pas comme distribution définitive |

Ce que change le fait d'être « non listée / usage interne » :
- **Pas de fiche publique référencée** : l'app n'apparaît jamais dans la recherche. Le lien App Store (à partager en interne) est la seule porte d'entrée.
- **La review Apple reste obligatoire**, avec les mêmes règles (confidentialité, compte de démo, fonctionnalités minimales).
- **Pas de création de compte dans l'app** → l'obligation Apple de *supprimer son compte dans l'app* (règle 5.1.1(v)) ne s'applique pas. On documente quand même la suppression (page `/assistance`).
- **RGPD** : l'app manipule des données de prospects (mineurs inclus). La politique de confidentialité publiée sur `hub.diploma-sante.fr/confidentialite` couvre ce traitement ; le compte de démo Apple ne doit **jamais** montrer de vraies fiches (voir §6).
- **Aucune publicité, aucun suivi (tracking)** → pas de bannière ATT (App Tracking Transparency).
- **Statut de commerçant UE (DSA)** : réglé au niveau du compte développeur (déjà nécessaire pour Diploma Lab dans l'UE). Rien de spécifique à cette app.

---

## 2. Identité de l'app

| Champ App Store Connect | Valeur |
|---|---|
| Plateforme | iOS (iPhone + iPad) |
| Nom | **Hub Diploma** (30 car. max — si refusé car déjà pris : « Hub Diploma Santé ») |
| Langue principale | Français (France) |
| Bundle ID | `fr.diplomasante.hub` |
| SKU | `hub-diploma` |
| Accès utilisateurs | Accès complet |
| Équipe | DIPLOMA SANTE — `GA963MW8WV` (provider ASC 129038276) |
| Apple ID de l'app | **6820461341** — lien futur : `https://apps.apple.com/app/id6820461341` |
| Version | 1.0.0 (build 1) |
| Copyright | `2026 Diploma Santé` |
| Catégorie principale | **Économie et entreprise** (Business) |
| Catégorie secondaire | Productivité |
| Prix | Gratuit |
| Disponibilité | France (+ DOM) ; « disponible dans les nouveaux pays » : non |
| Contenu tiers | « Ne contient pas, n'affiche pas et n'accède pas à du contenu tiers » |
| Conçue pour les enfants | Non |
| Sortie de la version | Manuelle (on publie nous-mêmes après validation) |

Conventions reprises des apps existantes du compte : locale `fr-FR`, copyright `2026 Diploma Santé`, contenu tiers « non », pas d'app enfants.

---

## 3. Fiche App Store (texte à coller)

**Sous-titre** (30 car.) :
```
CRM et rendez-vous Diploma
```

**Texte promotionnel** (170 car., modifiable sans review) :
```
L'outil des équipes Diploma Santé : contacts, rendez-vous et suivi des inscriptions, partout, depuis votre iPhone ou iPad.
```

**Description** :
```
Hub Diploma est l'outil interne des équipes de Diploma Santé, la prépa aux études de santé (PASS, LAS, Terminale Santé). Il réunit dans une seule app la gestion des contacts, des rendez-vous et du suivi des inscriptions.

• Contacts : retrouvez instantanément une fiche élève ou famille, son historique d'échanges, ses formulaires et ses rendez-vous.
• Rendez-vous : consultez votre agenda, prenez et replanifiez un rendez-vous, rejoignez une visio en un geste.
• Suivi : statuts, tâches et relances pour ne laisser passer aucune demande.
• Recherche globale : un nom, un e-mail ou un numéro suffit.
• Conçue pour le terrain : interface pensée pour le mobile, iPad en pleine largeur, écran dédié en cas de perte de réseau.

Application réservée aux collaborateurs de Diploma Santé : les accès sont créés par l'administration, il n'est pas possible de s'inscrire depuis l'application.
```

**Mots-clés** (100 car.) :
```
crm,rendez-vous,agenda,contacts,prospection,inscription,prépa,santé,PASS,LAS,commercial,suivi
```

**Nouveautés de cette version** : `Première version de Hub Diploma.`

| URL | Valeur |
|---|---|
| Confidentialité | `https://hub.diploma-sante.fr/confidentialite` |
| Assistance | `https://hub.diploma-sante.fr/assistance` |
| Marketing | (vide) |

---

## 4. Classification par âge

Questionnaire Apple : répondre **Aucun / Non** partout (pas de violence, de contenu sexuel, de jeux d'argent, d'accès web libre, de contenu généré par des inconnus, de messagerie publique, de contrôle parental, de publicité).
→ Classification attendue : **4+**.

---

## 5. Confidentialité de l'app (étiquette « nutrition »)

- **Suivi (tracking)** : **Non**, aucune donnée utilisée pour suivre l'utilisateur.
- **Données collectées** — toutes « liées à l'identité de l'utilisateur », finalité **Fonctionnalité de l'app** uniquement, jamais publicité/analyse tierce :

| Catégorie Apple | Type | Pourquoi |
|---|---|---|
| Coordonnées | Nom, adresse e-mail, numéro de téléphone | Compte collaborateur + fiches contacts saisies |
| Contenu utilisateur | Autre contenu utilisateur | Notes, fiches, rendez-vous saisis dans le CRM |
| Contenu utilisateur | Audio, photos ou vidéos | Visio de rendez-vous, pièces jointes |
| Identifiants | Identifiant utilisateur | Session / droits d'accès |
| Diagnostic | Autres données de diagnostic | Journaux d'erreurs (support) |

Ces réponses sont cohérentes avec la page `/confidentialite` ; toute évolution de l'une doit être reportée dans l'autre.

---

## 6. Informations pour la review Apple

**Contact review** : Benjamin Haddad — benjamin.haddad@diploma-sante.fr — +33 6 14 21 33 94 (même contact que Diploma Live).

**Compte de démo (obligatoire)** — à créer avant soumission :
- Un utilisateur **dédié** (`apple-review@diploma-sante.fr`), rôle **télépro**, rattaché à une marque/périmètre ne contenant que des **contacts fictifs** (≈ 15 fiches + quelques RDV à venir).
- Jamais de vraies données de prospects visibles par Apple (RGPD).
- Mot de passe stocké uniquement dans App Store Connect (champ « Mot de passe » de la section review), pas dans le repo.

**Notes pour la review** (en anglais, à coller) :
```
Hub Diploma is the internal CRM and appointment tool of Diploma Santé, a French medical-school preparation school. It is used only by our own staff (admissions advisors, telemarketers, administration) — accounts are created by our administration and there is no public sign-up. We are requesting Unlisted App Distribution for this app, like our existing app Diploma Live.

How to test: sign in with the demo account below. You land on the advisor workspace: contacts list, global search (top bar), a contact record (history, forms, appointments) and the calendar where an appointment can be booked or rescheduled. All data in the demo account is fictitious.

Native features: native splash/status bar, iPad full-width layout, haptic feedback, dedicated offline screen, camera/microphone for video appointments (only when the user joins a video call), photo picker for attachments.

The app contains no ads, no tracking and no in-app purchases.
```

---

## 7. Distribution non listée : la demande à Apple

1. L'app doit exister dans App Store Connect (étape §8) — idéalement **avant** la première soumission.
2. Formulaire : `https://developer.apple.com/contact/request/unlisted-app` (connecté avec le compte de l'équipe).
3. Réponses :
   - *App name* : Hub Diploma — *Apple ID* : (identifiant numérique de l'app, visible dans App Information)
   - *Description of the intended audience* :
     ```
     Internal staff of Diploma Santé (≈20 people: admissions advisors, telemarketers, administration). The app is our internal CRM and appointment tool; it is useless to the general public and requires an account created by our administration.
     ```
   - *How users will get the link* : `Shared privately by our administration with each staff member (internal email / onboarding).`
4. Si Apple valide **après** la review : l'app passe en non listée et le lien `https://apps.apple.com/app/id<APPLE_ID>` est à diffuser en interne. Si la demande arrive avant, l'app est publiée directement en non listée.

---

## 8. Checklist de mise en ligne

### Bloquant actuel
- [x] **Accepter le nouveau Contrat de licence du Apple Developer Program** — à faire par le *titulaire du compte* sur `developer.apple.com/account`. Tant que ce n'est pas fait : impossible de créer l'identifiant, l'app ou d'envoyer une build (constaté le 8/10/2026 : « Access Unavailable »).

### Apple Developer / App Store Connect
- [x] Identifiant `fr.diplomasante.hub` (Certificates, Identifiers & Profiles → Identifiers → App IDs), sans capacité particulière.
- [x] Nouvelle app dans App Store Connect avec les valeurs du §2.
- [x] Fiche (§3), classification (§4), confidentialité (§5), prix & disponibilité (§2) — remplis le 8/10/2026.
- [ ] Compte de démo + notes (§6).
- [ ] Captures d'écran (§9).
- [ ] Demande de distribution non listée (§7).

### Build
- [x] Mac avec **Xcode 27** (iOS 27 impose le cycle de vie UIScene → `SceneDelegate.swift`, cible minimale iOS 15), compte de l'équipe dans Xcode > Settings > Accounts.
- [ ] `cd mobile && bash scripts/release-ios.sh 1.0.0 1`
- [ ] Build visible dans TestFlight → tester en interne (connexion, recherche, fiche, RDV, visio, hors ligne, iPad).
- [ ] Sélectionner la build dans la version 1.0.0 → *Ajouter pour vérification* → *Soumettre*.
- [ ] Après validation : *Publier cette version* (sortie manuelle), puis diffuser le lien.

---

## 9. Captures d'écran

Obligatoires car l'app est universelle (iPhone + iPad). PNG/JPEG sans transparence, 3 à 10 par taille :

| Appareil | Taille (portrait) |
|---|---|
| iPhone 6,9" | 1320 × 2868 (ou 1290 × 2796) |
| iPad 13" | 2064 × 2752 (ou 2048 × 2732) |

À réaliser **avec le compte de démo** (données fictives) : 1. liste des contacts · 2. fiche contact · 3. agenda / prise de RDV · 4. recherche globale · 5. tableau de bord.

---

## 10. Risques de review et parades

| Règle | Risque | Parade |
|---|---|---|
| 4.2 Fonctionnalités minimales | Apple peut refuser une « simple coque web » | Contexte outil interne + demande non listée ; natif listé dans les notes ; si refus : ajouter les notifications push (nouveau lead attribué, rappel de RDV) en v1.1 — même approche que Diploma Lab (push + CallKit) |
| 2.1 Complétude | Compte de démo inutilisable, page blanche | Tester le compte démo la veille ; page hors ligne embarquée |
| 5.1.1 Données | Confidentialité incomplète | Pages `/confidentialite` et `/assistance` publiques ; étiquette §5 alignée |
| 5.1.2 Permissions | Textes caméra/micro vagues | Textes précis dans `Info.plist` (visio de RDV, pièces jointes) |
| Chiffrement | Questionnaire export | `ITSAppUsesNonExemptEncryption = false` (HTTPS standard uniquement) |

---

## 11. Android (plus tard)

Le dossier `mobile/` est prêt pour Android (`bunx cap add android`). Pour une diffusion privée sur le Play Store : **app privée via Google Play géré** (nécessite Google Workspace / EMM) ou **piste de test fermée** (liste d'e-mails). Package conseillé : `fr.diplomasante.hub`.
