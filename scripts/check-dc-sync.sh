#!/usr/bin/env bash
# Fail if the dc-script block in index.html has drifted from the source master,
# OR if the {{ placeholder }} bindings in the static markup surrounding that
# block (buttons' onClick="{{ ... }}" etc.) have drifted from source.
#
# bundle.sh only regenerates the <script type="text/x-dc"> block itself — it
# never touches the static HTML around it (that markup lives in both files
# independently and isn't part of the sync). If a template placeholder name is
# renamed in source (e.g. onClick="{{ openDebug }}" -> "{{ debugButtonClick }}")
# without hand-editing the same spot in index.html, the button silently calls
# a property that no longer exists in the render output — no console error,
# just a dead click. This happened for real on issue #9's implementation
# (PR #12): check-dc-sync.sh passed because the JS block was byte-identical,
# but the Debug button's onClick reference had drifted and pointed nowhere.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SOURCE="source/Tschau Sepp Online.dc.html"
BUNDLE="index.html"

extract_dc_block() {
  awk '/<script type="text\/x-dc"/{f=1} f{print} f&&/<\/script>/{exit}' "$1"
}

extract_placeholders() {
  # Every {{ name }} template token in the static markup BEFORE the dc-script
  # block, in order. This is what actually needs to match — the surrounding
  # HTML otherwise legitimately differs (index.html carries extra <head>
  # boilerplate like version.js that source doesn't).
  awk '/<script type="text\/x-dc"/{exit} {print}' "$1" | grep -oE '\{\{ *[A-Za-z0-9_.]+ *\}\}'
}

failed=0

if ! diff <(extract_dc_block "$SOURCE") <(extract_dc_block "$BUNDLE") >/dev/null; then
  echo "✖ dc-sync: the game code in '$BUNDLE' differs from '$SOURCE'." >&2
  echo "  Edit the source, then run scripts/bundle.sh to regenerate the bundle." >&2
  echo "  Diff:" >&2
  diff <(extract_dc_block "$SOURCE") <(extract_dc_block "$BUNDLE") | head -20 >&2 || true
  failed=1
fi

if ! diff <(extract_placeholders "$SOURCE") <(extract_placeholders "$BUNDLE") >/dev/null; then
  echo "✖ dc-sync: a {{ placeholder }} binding in '$BUNDLE's static markup differs from '$SOURCE'." >&2
  echo "  bundle.sh does not sync this — hand-edit the same markup change into both files." >&2
  echo "  Diff:" >&2
  diff <(extract_placeholders "$SOURCE") <(extract_placeholders "$BUNDLE") >&2 || true
  failed=1
fi

if [[ "$failed" -eq 1 ]]; then
  exit 1
fi
echo "✓ dc-sync: source and bundle dc blocks and template bindings are identical"
