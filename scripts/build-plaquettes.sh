#!/usr/bin/env bash
# Re-génère les plaquettes PDF « partenariat lycées » à partir des sources HTML.
#   Sources : docs/plaquettes/*.html
#   Sortie  : public/plaquettes/*.pdf
# Usage : bash scripts/build-plaquettes.sh [--preview <dossier>]
#   --preview : exporte aussi chaque page en PNG (nécessite pdftoppm / poppler).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/docs/plaquettes"
OUT="$ROOT/public/plaquettes"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PREVIEW=""
if [[ "${1:-}" == "--preview" ]]; then PREVIEW="${2:?dossier de preview manquant}"; fi

if [[ ! -x "$CHROME" ]]; then
  echo "Chrome introuvable : $CHROME (définir la variable CHROME)" >&2
  exit 1
fi
mkdir -p "$OUT"

for name in diploma-sante-lycees afem-lycees; do
  html="$SRC/$name.html"
  pdf="$OUT/$name.pdf"
  echo "→ $name"
  # --allow-file-access-from-files : nécessaire pour charger les polices locales (file://)
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
    --allow-file-access-from-files \
    --print-to-pdf="$pdf" --virtual-time-budget=15000 \
    "file://$html" 2>/dev/null
  size=$(du -h "$pdf" | cut -f1)
  echo "  $pdf ($size)"
  if [[ -n "$PREVIEW" ]] && command -v pdftoppm >/dev/null; then
    mkdir -p "$PREVIEW"
    pdftoppm -png -r 110 "$pdf" "$PREVIEW/$name"
  fi
done
echo "OK"
