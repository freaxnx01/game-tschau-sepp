#!/usr/bin/env bash
# Fail if the dc-script block in index.html has drifted from the source master.
# The game logic exists in both files; source/ is the editing master and
# index.html is the shipped bundle — they must stay byte-identical.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SOURCE="source/Tschau Sepp Online.dc.html"
BUNDLE="index.html"

extract_dc_block() {
  awk '/<script type="text\/x-dc"/{f=1} f{print} f&&/<\/script>/{exit}' "$1"
}

if ! diff <(extract_dc_block "$SOURCE") <(extract_dc_block "$BUNDLE") >/dev/null; then
  echo "✖ dc-sync: the game code in '$BUNDLE' differs from '$SOURCE'." >&2
  echo "  Edit the source, then run scripts/bundle.sh to regenerate the bundle." >&2
  echo "  Diff:" >&2
  diff <(extract_dc_block "$SOURCE") <(extract_dc_block "$BUNDLE") | head -20 >&2 || true
  exit 1
fi
echo "✓ dc-sync: source and bundle dc blocks are identical"
