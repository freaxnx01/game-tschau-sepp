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
