# Agent Notes

## dc-bundle workflow (IMPORTANT)

The game logic exists twice: `source/Tschau Sepp Online.dc.html` (editing
master) and the dc-script block inside `index.html` (shipped bundle). They
must stay byte-identical — a drift silently reverts fixes on the next
regenerate (it happened once: commit `846dc67` edited only `index.html`).

- **Edit `source/`, then run `scripts/bundle.sh`** — it regenerates the
  dc block in `index.html` and verifies the sync. Never hand-edit the game
  code in `index.html`.
- `scripts/check-dc-sync.sh` is the guard. It runs in CI
  (`.github/workflows/dc-sync.yml`) and in the repo-local pre-commit hook.
- Fresh clone setup (hook is not versioned):

  ```bash
  printf '#!/usr/bin/env bash\nexec "$(git rev-parse --show-toplevel)/scripts/check-dc-sync.sh"\n' > .git/hooks/pre-commit
  chmod +x .git/hooks/pre-commit
  ```

  The global pre-commit hook (`~/.config/git/hooks/pre-commit`) runs
  gitleaks first, then delegates to this repo-local hook.

## Simulation harness

`scripts/sim/` holds a Node harness that plays CPU-vs-CPU games through the
real dc logic and verifies the 36-card deck invariant after every state
change (`harness.mjs`), plus a playCard-guard regression test
(`test-guard.mjs`). Run after any change to card movement logic:

```bash
node scripts/sim/test-guard.mjs
node scripts/sim/harness.mjs '' 500 20   # 10k rounds, ~15 s
```

## Release flow (deviates from the stack overlay)

`CHANGELOG.md` is **hand-curated**. Entries are user-facing prose, not commit
subjects, and they are worth more to a reader than anything `cliff.toml` can
generate from the log.

The browser-game stack overlay documents `git cliff --tag vX.Y.Z -o CHANGELOG.md`
as step 4 of the release. **Do not run that here** — it regenerates the whole
file and destroys the curation. At v0.3.0 it would have replaced entries like
"Covering an Ass now draws one card per click…" with "Add favicon" and "Extract
recycleDiscard as the single reshuffle site", plus internal refactor and docs
commits no player cares about.

Release steps for this repo:

```bash
# 1. cross-check for changes that never got a curated entry (read-only!)
git cliff --unreleased --tag vX.Y.Z    # never redirect this over CHANGELOG.md
# 2. promote the curated section by hand:
#    "## [Unreleased]"  ->  "## [Unreleased]\n\n## [X.Y.Z] - YYYY-MM-DD"
# 3. bump version.js to X.Y.Z (display mirror of the tag)
git commit -am "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "..."             # the tag is the authoritative version
git push --follow-tags origin HEAD:main
gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
```

`main` auto-deploys to GitHub Pages, so the code is live the moment it merges —
the tag and release are a marker, not the publish step.

## Testing gate

The stack overlay names a manual in-browser playtest as the test gate. For this
repo the owner has opted out: ship on `scripts/sim` (six suites) plus the
CPU-vs-CPU invariant harness, which CI now runs on every PR
(`.github/workflows/tests.yml`). Note the absence of a manual playtest in
release notes as a fact; don't hold a release for it.
