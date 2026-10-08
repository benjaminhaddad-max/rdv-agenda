# Hub Diploma — app mobile (iOS / Android)

Coque native [Capacitor 7](https://capacitorjs.com) qui charge le CRM en ligne
(`https://hub.diploma-sante.fr`). Tout le produit reste dans l'app Next.js : un
push sur `main` est visible dans l'app sans nouvelle version store.

Il faut une nouvelle build store uniquement si on modifie le natif : icône,
splash, `Info.plist` (permissions), plugins Capacitor, `capacitor.config.ts`.

| | |
|---|---|
| Nom | Hub Diploma |
| Bundle ID iOS | `fr.diplomasante.hub` |
| Équipe Apple | DIPLOMA SANTE — `GA963MW8WV` |
| Distribution | App **non listée** (lien privé), comme Diploma Live |
| Dépendances iOS | Swift Package Manager (pas de CocoaPods) |

Guide complet App Store Connect (fiche, confidentialité, review, distribution) :
[`docs/app-store-hub-diploma.md`](../docs/app-store-hub-diploma.md).

## Commandes (toujours avec bun)

```bash
cd mobile
bun install
bunx cap sync ios          # après toute modif de capacitor.config.ts ou de plugin
bun run assets             # régénère icônes + splash depuis resources/
bunx cap open ios          # ouvre le projet dans Xcode
bash scripts/release-ios.sh 1.0.0 1   # archive + envoi App Store Connect
```

## Fichiers

- `capacitor.config.ts` — appId, URL chargée, couleurs, plugins
- `resources/icon.svg|png` — icône 1024×1024 (sans transparence), `splash.svg|png` — 2732×2732
- `www/` — page de redirection + page hors ligne (`offline.html`)
- `ios/App/App/Info.plist` — nom, permissions caméra/micro/photos, chiffrement exempté
- `ios/App/ExportOptions.plist` — export App Store Connect (équipe GA963MW8WV)
