# Design: assert the pacing mechanism, not the round's length

Issue: [#37](https://github.com/freaxnx01/game-tschau-sepp/issues/37)
Date: 2026-09-23

## Background

`scripts/sim/test-spectator.mjs` ends with:

```javascript
check('pacing stays human-watchable', (now - t0) > 20000,
```

It plays one spectated CPU-vs-CPU round from a random deal and asserts the round
took more than 20 s of simulated time. A round's length is a random variable, so
the assertion is a lower bound on a random draw — and it fails whenever the deal
produces a short round. It already turned PR #35 red with
`FAIL pacing stays human-watchable: simulated 16.9s`, which passed on a plain
re-run with no code change.

## What the numbers say

200 spectated rounds:

| measure | value |
| --- | --- |
| round duration | min 12.1 s · median 41.2 s · max 201 s |
| rounds under the 20 s bound | **15 / 200 (7.5 %)** |
| minimum gap between table events | min **700 ms** · p10 700 ms · median 1000 ms |

Duration spans a factor of sixteen. The gap between events does not move: across
those 200 rounds nothing ever landed closer together than 700 ms.

Measured per bundle, the failure rate is also flat across recent work — 5/40
before #33, 3/40 after, 4/40 after #32 and #33 — so this is inherent to the
assertion, not a regression from either fix.

## The defect

The check is named for the property it wants: *pacing stays human-watchable*. It
then measures something else — total round length — which depends mostly on how
many cards the deal forces the bots to draw, and only incidentally on pacing.

The property it wants is already guaranteed by construction. `maybeBot()`
(`source/Tschau Sepp Online.dc.html:857-862`) schedules every bot move through
`after(delay || (900 + Math.random() * 800))`, and the explicit call sites pass
250–1400 ms. Nothing in a spectated round happens back-to-back — that is what
makes it watchable, and it is a property of every round rather than of a lucky
one.

## The fix

Assert the gap. The test records the simulated time of each table event — a card
played, cards drawn — and checks the smallest gap between consecutive events:

```javascript
check('no two table events land closer than 500ms', minGap >= 500,
  'min gap ' + minGap + 'ms');
```

The floor is set at 500 ms against a measured minimum of 700 ms. The margin is
deliberate: the assertion should catch a move scheduled with no delay at all —
the regression that would actually make a spectated round unwatchable — without
re-breaking the moment someone tunes a 900 ms delay down to 700.

The existing assertions in that block stay as they are: the round still has to
play itself to an end, and the 36-card invariant still has to hold.

## Why not seed the deal

Seeding `Math.random` with `mulberry32`, as `harness.mjs` does, would make the
round reproducible and let the duration assertion keep a known value. It was
rejected: the expected value then encodes current game rules, so every rules
change shifts it and the test has to be re-baselined. #33 would have needed
exactly that — twice, since the fix moved and then moved again in review. An
assertion about scheduling survives rules changes because scheduling is what it
measures.

## Non-goals

- No change to the delays themselves; the pacing is fine, only the check is wrong.
- No change to the other spectator assertions.
- No seeding of the sim suites generally — `harness.mjs` seeds because it needs
  reproducible failures; this test does not.

## Consequences

- One class of regression stops being caught: a change that makes rounds
  *shorter* without changing scheduling — e.g. a rules change that ends rounds
  early — no longer trips this test. That is the right trade: #33 was such a
  change, it was intentional, and the test flagged it as a failure rather than
  as news.
- CI stops going red roughly once in every ten to thirteen runs for a reason
  unconnected to the diff.

## Testing

The change is to a test, so the evidence is the test's own behaviour:

1. Against the current build the new assertion passes, and passes on **20
   consecutive runs** — the old one fails somewhere in that range.
2. Mutation check: with `maybeBot`'s delay forced to 0 in a scratch copy of the
   bundle, the new assertion fails. This proves it detects the regression it
   claims to detect, rather than passing vacuously.

Then the rest of `test-spectator.mjs`, the other sim suites, and
`check-dc-sync.sh`.

## Acceptance criteria

1. `test-spectator.mjs` asserts a minimum gap of at least 500 ms between
   consecutive table events, and no longer asserts a total round duration.
2. The suite passes on 20 consecutive runs against the current build.
3. With `maybeBot`'s delay forced to 0, the new assertion fails.
4. The other assertions in the file are unchanged and still pass.
5. No game code is modified.
