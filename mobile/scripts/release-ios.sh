#!/bin/bash
# Archive + envoi d'une build iOS Hub Diploma vers App Store Connect.
#
#   cd mobile && bash scripts/release-ios.sh 1.0.0 3
#     $1 = version affichée (MARKETING_VERSION), $2 = numéro de build (unique, croissant)
#
# Prérequis (une seule fois) : Xcode installé + `sudo xcode-select -s /Applications/Xcode.app`,
# compte Apple de l'équipe DIPLOMA SANTE (GA963MW8WV) ajouté dans Xcode > Settings > Accounts.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:?Version requise (ex. 1.0.0)}"
BUILD="${2:?Numéro de build requis (ex. 1)}"
ARCHIVE="build/HubDiploma-$VERSION-$BUILD.xcarchive"

bun install
bunx cap sync ios

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD" \
  -allowProvisioningUpdates archive

# Envoie directement la build dans App Store Connect (onglet TestFlight).
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist ios/App/ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates

echo "✔ Build $VERSION ($BUILD) envoyée — elle apparaît dans App Store Connect > TestFlight après ~10-20 min de traitement."
