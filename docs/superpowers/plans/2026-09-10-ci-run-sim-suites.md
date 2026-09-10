# Plan: run the sim suites in CI

Issue: [#22](https://github.com/freaxnx01/game-tschau-sepp/issues/22)
Spec: [2026-09-10-ci-run-sim-suites-design.md](../specs/2026-09-10-ci-run-sim-suites-design.md)

## Goal

Every `scripts/sim/test-*.mjs` and a short `harness.mjs` pass run on each PR and
on pushes to `main`, failing the build on any failure.

## Global constraints

- **Buildless stack.** Do not add `package.json`, `node_modules`, a bundler, or a
  test framework. The suites are dependency-free ESM run through `node`.
- **Do not touch `.github/workflows/dc-sync.yml`.** It stays exactly as it is.
- **Do not modify any file under `scripts/sim/`.** The suites already exit
  non-zero on failure and already default to the bundled `index.html`; CI only
  has to invoke them.
- No game source changes — `source/Tschau Sepp Online.dc.html` and `index.html`
  are untouched, so `scripts/bundle.sh` is not run.
- This is a CI-only change, so there is no unit test to write first. The
  evidence discipline replaces it: capture command output before and after.

## Task 1 — The workflow

**Files:** `.github/workflows/tests.yml` (new)

**Interfaces:** none — a workflow definition.

### BEFORE (capture this output)

```bash
ls .github/workflows/
```

Expect: `agent.yml  dc-sync.yml` — no test workflow.

### Write the workflow

```yaml
name: tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  sim:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      # Every suite runs even if an earlier one fails, so one break cannot hide
      # the state of the others. The glob picks up new suites automatically.
      - name: Run the sim test suites
        run: |
          status=0
          shopt -s nullglob
          for t in scripts/sim/test-*.mjs; do
            echo "::group::$t"
            if node "$t"; then
              echo "OK   $t"
            else
              echo "FAIL $t"
              status=1
            fi
            echo "::endgroup::"
          done
          exit $status

      # Deterministic: harness.mjs seeds mulberry32 with 0xC0FFEE ^ gameIdx,
      # so a failure here is a real regression, not flake.
      - name: Verify the 36-card invariant
        run: |
          out=$(node scripts/sim/harness.mjs '' 300 20)
          echo "$out"
          echo "$out" | grep -qE '"violations": 0' || { echo "invariant violations"; exit 1; }
          echo "$out" | grep -qE '"stalls": 0'     || { echo "harness stalled";      exit 1; }
```

### AFTER (capture this output)

```bash
ls .github/workflows/
for t in scripts/sim/test-*.mjs; do node "$t" >/dev/null && echo "OK   $t" || echo "FAIL $t"; done
node scripts/sim/harness.mjs '' 300 20
```

Expect: `tests.yml` present; every suite `OK`; harness reporting
`"violations": 0` and `"stalls": 0`.

At the time of writing, the suites are `test-advice.mjs` (15 checks),
`test-cover-draw.mjs` (6), `test-debug-dialog.mjs` (6), `test-guard.mjs` (3),
`test-pending-draw.mjs` (7) and `test-reshuffle.mjs` (46).

## Task 2 — Prove the gate actually fails

A green check proves nothing unless it can go red. Verify the failure path
locally, without committing the break:

```bash
# temporarily break one assertion
cp scripts/sim/test-guard.mjs /tmp/test-guard.bak
sed -i 's/process.exit(failed ? 1 : 0);/process.exit(1);/' scripts/sim/test-guard.mjs
for t in scripts/sim/test-*.mjs; do node "$t" >/dev/null || echo "FAIL $t"; done   # must list test-guard.mjs
cp /tmp/test-guard.bak scripts/sim/test-guard.mjs                                  # restore
git diff --stat scripts/sim/                                                       # must be empty
```

Paste the output showing `FAIL scripts/sim/test-guard.mjs` and the empty
`git diff --stat`. **Do not commit the temporary break.**

## Task 3 — Changelog

**Files:** `CHANGELOG.md`

Add under `[Unreleased]` a `### Added` section (the section was emptied by the
v0.3.0 release, so create it above any existing subsection):

```markdown
### Added

- CI runs the `scripts/sim` test suites and the 36-card invariant harness on every pull request (#22)
```

**Verify:** `sed -n '/## \[Unreleased\]/,/## \[0.3.0\]/p' CHANGELOG.md` shows the entry.

## PR description must include

- The BEFORE and AFTER output from Task 1
- The Task 2 output proving the gate goes red, plus the empty `git diff --stat`
- `git diff --name-only`, confirming only `.github/workflows/tests.yml` and
  `CHANGELOG.md` changed
- Confirmation that the new check ran and passed on this PR

## Out of scope

- Changing, fixing or adding any test under `scripts/sim/`.
- Touching `dc-sync.yml` or `agent.yml`.
- Running the suites against `source/` as well as the bundle — `dc-sync.yml`
  already proves the two are identical.
- Caching, matrix builds across Node versions, or scheduled longer harness runs.
