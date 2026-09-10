# Design: run the sim suites in CI

Issue: [#22](https://github.com/freaxnx01/game-tschau-sepp/issues/22)
Date: 2026-09-10
Mode: `/enrich --quick` — no clarifying questions, no approval gate.

## Problem

`.github/workflows/dc-sync.yml` is the repo's only workflow and it just runs
`scripts/check-dc-sync.sh`. Nothing executes `scripts/sim/`, so 83 assertions
across six suites plus the 36-card invariant harness can all break with CI
green. Three PRs (#18, #20, #21) were merged this cycle on locally-run evidence
alone, and the automated review of #20 flagged the gap independently.

## Shape

A new workflow runs every `scripts/sim/test-*.mjs` and a short harness pass on
each PR and on pushes to `main`. Each suite already `process.exit(1)`s on
failure and already defaults to the bundled `index.html`, so no test changes are
needed — CI only has to invoke them and honour exit codes.

The buildless guardrail holds: no `package.json`, no `node_modules`, no bundler.
The suites are dependency-free ESM run straight through `node`.

## Assumptions

- **A1** [med] A new workflow file `.github/workflows/tests.yml`, not another job
  inside `dc-sync.yml`. Rejected: extending `dc-sync.yml`. That workflow is
  single-purpose and named for it (`.github/workflows/dc-sync.yml:1`), so a
  failing game test surfacing under a check called `dc-sync` misreports the
  cause.
- **A2** [high] Suites are discovered with a glob over `scripts/sim/test-*.mjs`,
  not enumerated. Rejected: an explicit job matrix. This cycle alone added
  `test-cover-draw.mjs`, `test-pending-draw.mjs` and `test-advice.mjs`; a
  hardcoded list silently omits new suites, which is the exact failure mode this
  issue exists to close.
- **A3** [high] The harness runs inline on every PR at 300 games rather than on a
  schedule. `scripts/sim/harness.mjs:141` seeds mulberry32 with
  `0xC0FFEE ^ gameIdx`, so it is deterministic — verified by three runs producing
  byte-identical output once the `wallMs` field is excluded — and 300 games takes
  ~8 s locally. There is no flakiness argument for deferring it.
- **A4** [med] Node is pinned via `actions/setup-node`, not taken from the runner
  image. Rejected: bare `node`. The suites are dependency-free so any modern Node
  works, but pinning stops a runner-image bump from changing behaviour silently.
  No manifest is added, so the buildless guardrail is intact.
- **A5** [high] Every suite runs and the job fails at the end, rather than
  aborting on the first failure. Rejected: fail-fast. One broken suite otherwise
  hides the state of the other five, which matters most on the run that first
  turns this on.
- **A6** [low] `harness.mjs` is invoked as a distinct step from the `test-*.mjs`
  glob, because its arguments and pass criteria differ (it reports
  `violations`/`stalls` as JSON rather than `PASS`/`FAIL` lines) and its glob
  name does not match `test-*`.

## Consequences

- Every PR gains roughly 30 s of CI time.
- `scripts/sim/*.mjs` becomes load-bearing: a syntax error in a test file now
  fails the build, where previously it went unnoticed until someone ran it.
- Open PRs created before this lands will not show the new check until they are
  rebased onto `main`.
- The harness's JSON output is parsed for `violations`/`stalls`; if its output
  shape changes, the CI step must change with it — a coupling that did not exist
  before.
- A failure now blocks merging, which is the point, but it also means an
  intermittent failure would become a merge blocker rather than a curiosity.

## Acceptance criteria

- A workflow runs on `pull_request` and on `push` to `main`.
- It executes every `scripts/sim/test-*.mjs`, discovered by glob, and fails the
  job if any exits non-zero.
- It executes `harness.mjs` and fails the job on any `violations` or `stalls`.
- All suites run even when an earlier one fails; the job's summary names which
  ones failed.
- No `package.json`, `node_modules`, bundler or test framework is added.
- `dc-sync.yml` is unchanged and still runs.
- On the PR that introduces it, the new check passes against current `main`.
