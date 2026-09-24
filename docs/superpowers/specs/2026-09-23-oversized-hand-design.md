# Design: the oversized hand — what is established, and what is not

Issue: [#36](https://github.com/freaxnx01/game-tschau-sepp/issues/36)
Date: 2026-09-23 (rewritten 2026-09-24)

## Correction

An earlier version of this spec — and the issue body written from it — stated
that the reported 34-card hand came from one futile `drawUntilCover()` sweep, and
proposed short-circuiting that loop. **That mechanism is wrong and the fix would
be dead code.** The correction is recorded here rather than quietly edited away,
because the wrong version was already used to open #36.

The reconstruction that "proved" it called `drawUntilCover()` directly on a hand
holding every covering card. The game cannot reach that call: `botTurn` enters
the cover branch only when `!cand.length`, and under a cover obligation
`canPlay()` *is* the covering test (`:946`). So a seat that holds a covering card
plays it and never draws. The drawer therefore never holds the covers — they are
in the deck — so the draw finds one.

Measured, after the reconstruction was questioned:

| | cover draws | `found === null` |
| --- | --- | --- |
| bot vs bot, 4 800 rounds | 4 185 | **0** |
| human vs bot, 12 000 rounds, both difficulties | 8 624 | **0** |

The futile branch is not merely rare; nothing in either run reached it. A
short-circuit guarding it would never execute.

## What is established

**1. `gmuetlich` plays bare Asses that `gwieft` refuses.** `botPick()` filters out
an Ass unless the hand holds a follow-up cover (`:1475`, the `safe` filter), but
the `gmuetlich` branch returns a random playable card *before* that filter runs
(`:1470`). Measured on a position where the Ass is legal but unsafe and a safe
alternative exists: **103 of 200 picks were the Ass**. This is a real defect,
independent of the 34-card report, and it is what makes the easy bot bleed cards.

**2. Hand growth is cumulative, not a single event.** Instrumenting the three
sources over 12 000 rounds — stuck draws (1 per turn), 7-penalties, cover draws —
the largest hand reached is **17**, built from many small draws across a round.
The largest single cover draw observed is 12.

## What is NOT established

**Why the reported hand reached 34.** Simulated play does not get there:

| driver | largest opposing hand |
| --- | --- |
| bot vs bot | 15 |
| scripted human, plays first legal card | 17 |
| scripted human, leads 7s and 8s | 17 |

The screenshot is a real state — 34 + 1 in hand, 0 in the pile, 1 on the discard,
36 accounted for — so it is reachable. This spec cannot say by what route, and a
fix aimed at a guessed route is how the first version of this document went
wrong.

### How to close the gap

The repo already has the instrument: debug mode's play journal (#6) records every
draw and reshuffle with its cause. A journal from a round where a hand passes ~25
would name the mechanism directly. Until then the 34-card case stays open.

## Scope

Given the above, #36 is split:

- **In scope now:** the `gmuetlich` bare-Ass defect (established, measured,
  self-contained).
- **Deferred:** the oversized hand itself, pending a debug journal from a real
  round.

## The fix, in scope

`botPick()`'s `gmuetlich` branch moves below the `safe` filter and picks randomly
*within* the safe set, falling back to the full set when nothing is safe — which
is what `gwieft` already does. The bot keeps its random, weak play; it stops
choosing the one move that is actively self-destructive.

## Non-goals

- No cap on the cover draw. The rule is "draw until you can cover" and it stays.
- No short-circuit of `drawUntilCover` — see the correction above.
- No change to `gwieft`.

## Consequences

- `gmuetlich` gets slightly stronger, and specifically stops handing itself large
  hands off its own Asses. This is a difficulty change, small but real, and it may
  reduce how often the oversized-hand case appears at all — which would make the
  deferred half harder to reproduce. Worth knowing before it lands.

## Testing

New `scripts/sim/test-bot-ace.mjs`:

1. Position where the Ass is legal but unsafe and a safe alternative exists:
   `gmuetlich` picks the Ass **0 times in 200**, against ~103 before the fix.
2. Same position: the card it does pick is always the safe one.
3. The Ass is the only legal card: `gmuetlich` still plays it.
4. `gwieft` is unchanged on both positions.

Then the existing suites, `harness.mjs '' 500 20`, and `check-dc-sync.sh`.

## Acceptance criteria

1. On a position where the Ass is legal but unsafe and a safe alternative exists,
   `gmuetlich` never picks the Ass across 200 draws.
2. `gmuetlich` still plays an Ass when it is the only legal card.
3. `gwieft`'s choices are unchanged on both positions.
4. `scripts/sim/test-bot-ace.mjs` covers 1–3 and fails against the pre-fix code.
5. All existing sim suites, `harness.mjs` (0 violations, 0 stalls) and
   `check-dc-sync.sh` pass.
6. The 34-card report is **not** claimed as fixed. #36 stays open, reduced to the
   deferred half, with a note asking for a debug-mode journal.
