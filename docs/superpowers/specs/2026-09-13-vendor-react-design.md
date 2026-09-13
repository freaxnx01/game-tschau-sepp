# Design: vendor React instead of loading it from unpkg

Issue: [#8](https://github.com/freaxnx01/game-tschau-sepp/issues/8)
Date: 2026-09-13
Mode: `/enrich --quick` — no clarifying questions, no approval gate.

## Problem

The dc-runtime injects React from a CDN at startup
(`support.js:1594`, `:1596`). The game therefore does not load at all when
unpkg is unreachable — blocked on a corporate network, offline, or simply down —
failing with `dc-runtime: window.React is not available yet`. It also costs a
third-party DNS/TLS round trip on every cold load, the slowest hop in an
otherwise entirely local static page.

## The opening the runtime already gives us

`loadReactUmd()` short-circuits:

```js
function loadReactUmd() {
  const w = window;
  if (w.React && w.ReactDOM) return Promise.resolve();
  ...
}
```

So if `window.React` and `window.ReactDOM` are already defined by the time the
runtime boots, **the CDN is never contacted**. Plain `<script>` tags in the
document head, before `support.js`, are enough. No change to generated code is
needed, which matters because `support.js` is dc-runtime output and any edit
would be lost the next time it is regenerated.

## Verified before deciding

- The two UMD builds fetch cleanly: 10,751 and 131,835 bytes (~139 KB raw).
- Their sha384 digests **match the SRI hashes `support.js` already pins**
  (`REACT_SRI`, `REACT_DOM_SRI`) exactly, so the vendored copies can keep the
  same `integrity` attributes — vendoring does not mean dropping the
  supply-chain check.
- `check-dc-sync.sh:28-30` deliberately compares only the dc block and the
  `{{ }}` placeholders before it, with the comment *"index.html carries extra
  `<head>`"* — so head `<script>` tags are outside what the guard compares and
  cannot break the bundle sync.
- **Babel is a false alarm.** `support.js:1048` also points at unpkg for
  `@babel/standalone`, but `ensureBabel()` runs only from the `x-import` loader
  when `kind === "jsx"` (`support.js:1078`), and this game uses `x-import`
  **zero** times. It never loads in production, so it is out of scope.

## Assumptions

- **A1** [high] Load the vendored files with `<script>` tags in the head, rather
  than repointing the runtime's URL constants. Rejected: editing
  `REACT_URL`/`REACT_DOM_URL`. `support.js` is generated dc-runtime output
  (`AGENT-NOTES.md`), so that edit would be silently reverted on regeneration,
  while `loadReactUmd()`'s `window.React` short-circuit is a supported entry
  point.
- **A2** [med] Vendor into a repo-root `vendor/`, referenced as `./vendor/…`
  from `index.html` and `../vendor/…` from `source/Tschau Sepp Online.dc.html`.
  Rejected: a second copy under `source/vendor/`. The repo does duplicate
  `support.js` between root and `source/`, but duplicating 139 KB of React to
  follow that precedent is not worth it when a relative path works. Matches the
  stack overlay's documented `vendor/` convention.
- **A3** [high] Keep `integrity` on the local tags, reusing the hashes
  `support.js` pins. Rejected: dropping SRI as unnecessary for same-origin
  files. The digests were verified to match, so keeping them costs nothing and
  turns the vendored bytes into a checkable claim rather than a trusted one.
- **A4** [high] Do not vendor Babel — see above; it never loads.
- **A5** [med] Leave `support.js`'s CDN constants in place as an unused
  fallback, rather than stripping them. Rejected: patching the generated file.
  If a future dc-runtime regeneration drops the script tags, the CDN path still
  works, so the game degrades to today's behaviour instead of breaking.
- **A6** [low] Pin 18.3.1, the version already in use. No upgrade is bundled
  into this change.

## Consequences

- The repo grows by ~139 KB of third-party code, and `git clone` with it.
- **Updating React becomes a manual step.** Today the URL constants decide the
  version; afterwards the vendored files do, and the two could drift. The
  constants stay as a fallback (A5), so a drift means the fallback would serve a
  *different* version than the vendored files — worth a note in `AGENT-NOTES.md`.
- Cold load loses one third-party DNS/TLS round trip, and the game becomes
  genuinely playable offline once cached.
- The page still contacts `fonts.googleapis.com` and `buttons.github.io`, so
  "no external requests at all" is **not** achieved by this change — only React
  is de-CDN'd. Those are cosmetic (web font, GitHub star button) and the game
  works without them, but the claim should not be overstated.

## Acceptance criteria

- `vendor/react.production.min.js` and `vendor/react-dom.production.min.js`
  (18.3.1 UMD) are committed, and their sha384 digests match the `REACT_SRI` /
  `REACT_DOM_SRI` values in `support.js`.
- `index.html` loads both from `./vendor/` before `./support.js`, with matching
  `integrity` attributes.
- `source/Tschau Sepp Online.dc.html` loads them from `../vendor/`.
- No request to `unpkg.com` is made on load.
- `support.js` is unmodified.
- `scripts/check-dc-sync.sh` still passes, and the whole sim suite plus the
  invariant harness still pass.
