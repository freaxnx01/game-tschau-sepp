# Plan: vendor React instead of loading it from unpkg

Issue: [#8](https://github.com/freaxnx01/game-tschau-sepp/issues/8)
Spec: [2026-09-13-vendor-react-design.md](../specs/2026-09-13-vendor-react-design.md)

## Goal

The game loads React from files in the repo, makes no request to `unpkg.com`,
and still passes `check-dc-sync.sh`.

## Global constraints

- **Do not modify `support.js`.** It is generated dc-runtime output; edits are
  lost on regeneration. The change works through `loadReactUmd()`'s existing
  `window.React && window.ReactDOM` short-circuit instead.
- **Do not add `package.json`, `node_modules`, or a bundler** — explicit stack
  guardrail. The vendored files are committed as-is.
- Markup edits are needed in **both** `index.html` and
  `source/Tschau Sepp Online.dc.html`; `bundle.sh` syncs the `<script
  type="text/x-dc">` block only (see `AGENT-NOTES.md`).
- Do not vendor Babel — it never loads (no `x-import` in this game).

## Task 1 — Failing test

**Files:** `scripts/sim/test-vendor-react.mjs` (new)

**Interfaces:** none — this test reads `index.html`, `source/…dc.html` and the
`vendor/` files from disk. It does not instantiate `Component`.

### Write the failing test

```js
// Tests that React is served from the repo, not from a CDN (#8).
// See docs/superpowers/specs/2026-09-13-vendor-react-design.md
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));

let failed = false;
function check(name, cond, detail) {
  if (cond) { console.log('PASS ' + name); return; }
  failed = true;
  console.log('FAIL ' + name + (detail ? ': ' + detail : ''));
}

const VENDOR = {
  'vendor/react.production.min.js': 'REACT_SRI',
  'vendor/react-dom.production.min.js': 'REACT_DOM_SRI',
};

const support = read('support.js');

// The vendored bytes must be exactly what the runtime already pins.
Object.entries(VENDOR).forEach(([file, sriConst]) => {
  check(file + ' is committed', exists(file));
  if (!exists(file)) return;
  const digest = 'sha384-' + crypto.createHash('sha384')
    .update(fs.readFileSync(path.join(ROOT, file))).digest('base64');
  const pinned = (support.match(new RegExp(sriConst + ' = "([^"]+)"')) || [])[1];
  check(file + ' matches the SRI ' + sriConst + ' pinned in support.js',
    pinned != null && digest === pinned, 'computed=' + digest + ' pinned=' + pinned);
});

// The pages must load them locally, before support.js boots the runtime.
const pages = {
  'index.html': './vendor/',
  'source/Tschau Sepp Online.dc.html': '../vendor/',
};
Object.entries(pages).forEach(([page, prefix]) => {
  const html = read(page);
  ['react.production.min.js', 'react-dom.production.min.js'].forEach(f => {
    check(page + ' loads ' + f + ' from ' + prefix,
      html.includes(prefix + f), 'missing ' + prefix + f);
  });
  const reactAt = html.indexOf(prefix + 'react.production.min.js');
  const supportAt = html.indexOf('support.js');
  check(page + ' loads React before support.js',
    reactAt !== -1 && supportAt !== -1 && reactAt < supportAt,
    'react@' + reactAt + ' support@' + supportAt);
  check(page + ' keeps integrity on the vendored tags',
    (html.match(/integrity="sha384-/g) || []).length >= 2,
    'found ' + (html.match(/integrity="sha384-/g) || []).length);
});

// No page may reach for React over the network any more.
['index.html', 'source/Tschau Sepp Online.dc.html'].forEach(page => {
  check(page + ' makes no unpkg reference', !read(page).includes('unpkg.com'));
});

// support.js stays generated output — untouched.
check('support.js still declares its CDN constants as a fallback',
  support.includes('REACT_URL') && support.includes('unpkg.com'));

process.exit(failed ? 1 : 0);
```

**Verify:** `node scripts/sim/test-vendor-react.mjs` fails — the `vendor/` files
do not exist and neither page references them.

## Task 2 — Vendor the files

**Files:** `vendor/react.production.min.js`, `vendor/react-dom.production.min.js` (new)

**Interfaces:** none.

### Fetch and verify

```bash
mkdir -p vendor
curl -sS -o vendor/react.production.min.js \
  https://unpkg.com/react@18.3.1/umd/react.production.min.js
curl -sS -o vendor/react-dom.production.min.js \
  https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js

# Prove the bytes are the ones support.js already trusts
for f in react react-dom; do
  printf '%s: sha384-%s\n' "$f" \
    "$(openssl dgst -sha384 -binary vendor/$f.production.min.js | openssl base64 -A)"
done
grep -E 'REACT_SRI|REACT_DOM_SRI' support.js
```

**Verify:** the two computed digests equal `REACT_SRI` and `REACT_DOM_SRI`
verbatim. If either differs, **stop** — do not commit the file; unpkg served
something other than what the runtime pins, and that needs investigating, not
working around.

Expected sizes: react ~10,751 bytes, react-dom ~131,835 bytes.

## Task 3 — Load them from the pages

**Files:** `index.html`, `source/Tschau Sepp Online.dc.html`

**Interfaces:** none.

### index.html

Immediately **before** the existing `<script src="./support.js"></script>`:

```html
<!-- React vendored (#8) — support.js's loadReactUmd() skips its CDN fetch
     when window.React/ReactDOM already exist. integrity values are the same
     hashes support.js pins in REACT_SRI / REACT_DOM_SRI. -->
<script src="./vendor/react.production.min.js" integrity="sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z"></script>
<script src="./vendor/react-dom.production.min.js" integrity="sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1"></script>
```

### source/Tschau Sepp Online.dc.html

The same two tags before its `<script src="./support.js"></script>`, but with
`../vendor/` paths — the file sits one directory down and shares the repo-root
`vendor/`:

```html
<script src="../vendor/react.production.min.js" integrity="sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z"></script>
<script src="../vendor/react-dom.production.min.js" integrity="sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1"></script>
```

**Verify:**

1. `node scripts/sim/test-vendor-react.mjs` — all pass.
2. `./scripts/bundle.sh` — dc-sync clean. The head is outside what the guard
   compares (`scripts/check-dc-sync.sh:28-30`), so this must not complain.
3. `node scripts/sim/test-start-cards.mjs && node scripts/sim/test-advice.mjs && node scripts/sim/test-pending-draw.mjs && node scripts/sim/test-cover-draw.mjs && node scripts/sim/test-guard.mjs && node scripts/sim/test-reshuffle.mjs && node scripts/sim/test-debug-dialog.mjs`
4. `node scripts/sim/harness.mjs '' 300 20` — 0 violations, 0 stalls.
5. Offline check: `python3 -m http.server 8000`, load the page with DevTools
   Network filtered to `unpkg` — expect **zero** requests.

## Task 4 — Document and changelog

**Files:** `AGENT-NOTES.md`, `CHANGELOG.md`

`AGENT-NOTES.md` — add under the dc-bundle section:

```markdown
## Vendored React

`vendor/react*.production.min.js` (18.3.1 UMD) are loaded by `index.html` and
`source/*.dc.html` before `support.js`, so the runtime's `loadReactUmd()`
short-circuits and never calls unpkg.

`support.js` still carries `REACT_URL` / `REACT_SRI` as an unused fallback — it
is generated output, so do not edit it. That means the vendored version and the
fallback version can drift: **when bumping React, update the `vendor/` files and
confirm their sha384 digests still match `REACT_SRI` / `REACT_DOM_SRI`**, or the
fallback would serve a different version than the vendored files.
`scripts/sim/test-vendor-react.mjs` enforces that match.
```

`CHANGELOG.md` — under `[Unreleased]` → `Changed`:

```markdown
### Changed

- React is now served from the repo instead of unpkg, so the game loads offline and without a third-party round trip (#8)
```

**Verify:** both files contain the new text.

## Out of scope

- `fonts.googleapis.com` and `buttons.github.io` — the page still contacts both.
  They are cosmetic and the game works without them; de-CDN'ing them is a
  separate decision.
- Vendoring or removing `@babel/standalone` — it never loads here.
- Upgrading React beyond 18.3.1.
- Editing `support.js` in any way.
