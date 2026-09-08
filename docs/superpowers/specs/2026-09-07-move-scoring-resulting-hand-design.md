# Design: score the resulting hand, not just the played card

Issue: [#17](https://github.com/freaxnx01/game-tschau-sepp/issues/17)
Date: 2026-09-07

## Background

The "Nöd optimal" tip told a player holding **Schälle-Ass + Schälle-8** that
the 8 would have been the better move. It isn't: playing the 8 first strands a
**bare Ass**, which the game's own rule refuses as a finisher and which forces
drawing until a cover appears. Playing the Ass and covering with the 8 sheds
both cards.

Numbers verified against the live code for that position:

| | value |
|---|---|
| `scoreCard(Ass)` | `8.4` |
| `scoreCard(8)` | `22` |
| `advise()` best | the 8, `22` |
| `tryPlay()` effective score of the Ass | `8.4 + (−40) = −31.6` |
| gap vs. the `>= 18` threshold | **`53.6` — tip fires** |

## Root causes

Two faults push the same way:

1. **The comparison is asymmetric.** `tryPlay()` builds an *effective* score for
   the played card — for an Ass, `scoreCard(Ass)` plus the standalone
   `scoreCard()` of its forced cover. `advise()` scores every alternative with
   plain `scoreCard()`. A two-card combo is compared against a one-card score.
2. **The cover is charged as if it were a free choice.** The `−40` above is
   `scoreCard()`'s "an 8 as your last card can't finish" penalty, applied to the
   8 *because it is the forced cover*. Covering is mandatory; the move sheds two
   cards and should be judged on the position it leaves, not by summing two
   independent card scores.

Neither model asks the question that decides this position: **what does the
hand look like after the move?**

## Decision

Judge a move by the hand it leaves behind.

- **`strandedHand(others)`** — a remaining hand of exactly one card that cannot
  finish the round (a bare Ass, or an 8) is a dead end.
- **`scoreCard()`** subtracts `STRANDED_PENALTY` when the move leaves such a
  hand. This is what makes "play the 8, keep the bare Ass" score badly.
- **`moveScore(c, hand, s)`** is the single scoring entry point. It is
  `scoreCard()` plus, for an Ass with a cover available, `SHED_BONUS` for the
  second card the forced cover discards, minus the stranded penalty if what
  remains after *both* cards is a dead end. It replaces the inline combo block
  in `tryPlay()`.
- **`advise()` uses `moveScore()` too**, so both sides of the comparison are
  computed the same way.

Constants: `SHED_BONUS = 20`, `STRANDED_PENALTY = 25`.

## Verified against a prototype

Monkey-patching the above onto the real component:

| Position | Before | After |
|---|---|---|
| Screenshot hand, played the Ass | best = the 8, gap `53.6` → **wrong tip** | best = **the Ass**, gap `0` → no tip |
| Screenshot hand, played the 8 | no tip (played the "best" card) | best = the Ass, gap `6.4` → no tip |
| Control: dumped the Under with a King available | tip fires | tip still fires, gap `34.8` |

The control matters: the change must not silence *useful* tips.

## Scope

- `scoreCard()`, a new `strandedHand()` and `moveScore()`, `advise()` and the
  combo block in `tryPlay()` — all in `source/Tschau Sepp Online.dc.html`.
- **Bot play is unaffected.** `botPick()` does not call `scoreCard()`; it has its
  own heuristic (suit counts, rank rules). `scoreCard()` is reached only from
  `advise()` and `tryPlay()`, both tip-only paths.
- `reasonFor()`'s wording is **out of scope** as long as no wrong tip fires. Its
  8 branch can still claim "mit dr Achti wärsch grad nomol dra gsi" in some
  position where that is a poor reason; note it, don't chase it here.
- No rule change, no UI change, no change to `canPlay()`.

## Acceptance criteria

- In the screenshot position (hand `Schälle-Ass + Schälle-8`, both playable),
  playing the Ass produces **no tip**, and the Ass is `advise()`'s recommendation.
- A move leaving exactly one unplayable-to-finish card (bare Ass, or an 8)
  scores strictly worse than the same move without that remainder.
- `advise()` and `tryPlay()` score candidates through the same `moveScore()`.
- The control case still fires a tip (dumping the Under while an ordinary
  same-suit card is available).
- The full sim suite and the CPU-vs-CPU invariant harness still pass, with bot
  behaviour unchanged.
