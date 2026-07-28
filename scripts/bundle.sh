#!/usr/bin/env bash
# Regenerate the dc-script block in index.html from the source master.
# Workflow: edit source/, run this, commit both files. Never hand-edit the
# game code in index.html — this script overwrites it.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SOURCE="source/Tschau Sepp Online.dc.html"
BUNDLE="index.html"

block="$(mktemp)"
out="$(mktemp)"
trap 'rm -f "$block" "$out"' EXIT

awk '/<script type="text\/x-dc"/{f=1} f{print} f&&/<\/script>/{exit}' "$SOURCE" > "$block"
if [ ! -s "$block" ]; then
  echo "✖ bundle: no dc-script block found in '$SOURCE'" >&2
  exit 1
fi

awk -v blockfile="$block" '
  /<script type="text\/x-dc"/ && !done { while ((getline line < blockfile) > 0) print line; skip=1; done=1 }
  skip { if (/<\/script>/) skip=0; next }
  { print }
' "$BUNDLE" > "$out"

mv "$out" "$BUNDLE"
trap 'rm -f "$block"' EXIT
scripts/check-dc-sync.sh
echo "✓ bundle: $BUNDLE regenerated from $SOURCE"
