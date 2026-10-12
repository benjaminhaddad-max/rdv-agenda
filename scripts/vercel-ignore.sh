#!/bin/sh
# Ignored Build Step Vercel : exit 0 = pas de build, exit 1 = build.
# Compare au dernier déploiement réussi (pas seulement HEAD^) : un push
# « feat + chore(en-cours) » doit être déployé. Commits EN-COURS.md seuls ignorés.
PREV="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
# Clone superficiel : récupère l'historique si le commit de référence manque
git cat-file -e "$PREV^{commit}" 2>/dev/null || git fetch -q --depth=200 origin main 2>/dev/null
# Toujours introuvable : on construit par sécurité
git cat-file -e "$PREV^{commit}" 2>/dev/null || exit 1
git diff --quiet "$PREV" HEAD -- . ':(exclude)EN-COURS.md'
