# Design: stop the Ass cover draw once covering has become impossible

Issue: [#36](https://github.com/freaxnx01/game-tschau-sepp/issues/36)
Date: 2026-09-23

## Background

Reported from play: a bot ended a round holding **34 of the 36 cards** — pile
empty, discard down to the single uncovered Ass, the human on one card. The
round's score is the sum of the other hands, so one Ass decided the game.

The rule behind it is intended and stays: whoever plays an Ass must cover it
themselves, and **draws until they can**. An earlier draft of this spec proposed
capping that draw at N cards. That was rejected, correctly — the cap number is
arbitrary, and it changes a rule that is not wrong.

## The defect

`drawUntilCover()` (`source/Tschau Sepp Online.dc.html:987`) loops `while (!found)`,
recycling the discard back into the pile whenever it empties, and stops on the
first card that covers — rank `A`, rank `U`, or the Ass's suit. It has a second
exit: when the pile is empty *and* the discard holds only the uncovered Ass,
`recycleDiscard` cannot reshuffle, the loop breaks, and it returns `found: null`.

That second exit is the whole problem, and it is reached the expensive way. By
the time it fires, every card that could still be drawn **has** been drawn into
the hand. So the game deals out the entire remaining deck in order to discover
something it could have known before dealing the first card: that no covering
card was left to find.

Reconstructed from the report and measured — a single call:

```text
before: 14 cards in hand, 20 in the pile, 1 on the discard (A-rose)
drawUntilCover: drew 20 cards, found a cover: false
after:  34 cards in hand, 0 in the pile, 1 on the discard
```

Why the hand was already large enough for this to happen is a second, separate
defect — see *The bot that walks into it* below.

### Why it is self-reinforcing

`covers()` only tests the card just drawn. Cards already in hand are never
re-examined, and every covering card sitting in your hand is one fewer left in
the deck. So a large hand makes the sweep larger, which makes the hand larger.
The pathological case is the fixed point: hold *all* the rose cards, Asses and
Unders, and the deck cannot contain a cover at all.

## The fix

Ask the question before dealing, not after:

```javascript
const reachable = pile.concat(discard.slice(0, -1));
if (!reachable.some(covers)) return { found: null, n: 0 };
```

`reachable` is exactly the set of cards the loop could ever hand out — the pile
plus the part of the discard that `recycleDiscard` would shuffle back in. The
discard's top card is excluded because it is never recycled; it is the Ass
itself.

### This preserves the rule exactly

The short-circuit fires **if and only if** today's loop would have ended with
`found === null`. That outcome already means "drew every reachable card, none of
them covered" — so testing the same set upfront decides the same thing. Whenever
a cover is reachable, behaviour is byte-identical to today: same draws, same
stopping card, same order.

The only thing that changes is that a futile draw no longer empties the deck into
someone's hand on the way to a conclusion it was always going to reach.

### What happens instead

Nothing new. `found: null` is an existing, handled outcome:

- `botTurn` (`:1400-1409`) calls `nextTurn` when `r.found` is falsy.
- `drawFor`'s cover branch reports `coverFail` and passes the turn when the draw
  yields nothing.

So the obligation lapses, the uncovered Ass stays face-up, and play moves on —
the same terminal state as today, reached without the 20-card detour.

### The bot that walks into it

`botPick()` refuses to play an Ass unless the hand holds a follow-up cover
(`:1461`, the `safe` filter). The `gmuetlich` branch returns a random playable
card **before** that filter runs (`:1455`), so the easy bot plays bare Asses that
the hard bot never would. That is what let its hand grow to the point where the
futile draw became possible.

`gmuetlich` gets the same `safe` filter. It keeps its random choice *within* the
safe set, so it stays the weaker opponent without being suicidal. When no safe
card exists the filter yields nothing and the random choice falls back to the
full set, exactly as `gwieft` does.

## Non-goals

- **No cap on the cover draw.** The rule is "draw until you can cover" and it
  stays that.
- No change to what counts as a cover, to `recycleDiscard`, or to the scoring.
- No change to `gwieft`'s play.

## Consequences

- **Normal play is untouched.** Across 4 800 bot-vs-bot rounds the futile case
  occurred **0 times in 4 185 cover draws** — a cover was always reachable. The
  short-circuit is, in ordinary play, dead code; it only fires in the degenerate
  position the report hit.
- A residual worst case remains, deliberately: if a cover *is* reachable but sits
  at the bottom of the deck, the draw is still large. That is the rule working,
  not a defect — and it is self-limiting, because the covering cards you draw
  along the way are the ones that end it. Measured ceiling in normal play is 12
  cards.
- `gmuetlich` bots will lose slightly less often to their own bare Asses. This is
  a difficulty change, small but real.

## Testing

New `scripts/sim/test-futile-cover.mjs`:

1. The reported position, reconstructed: a seat holding every rose card, Ass and
   Under, an uncovered Ass on the discard, cards still in the pile. The draw
   takes **0** cards, returns `found: null`, and the pile is untouched.
2. The obligation then lapses: the turn passes and the Ass is still face-up.
3. A cover *is* reachable: the draw behaves exactly as before — same count, same
   stopping card — proving the rule is preserved.
4. `gmuetlich` does not play a bare Ass while a safe card is available.
5. `gmuetlich` still plays an Ass when it is the only legal card.

Then the existing suites, `harness.mjs '' 500 20`, and `check-dc-sync.sh`.

This repo ships on sim-suite evidence; no in-browser playtest gates the change.

## Acceptance criteria

1. A cover draw with no reachable covering card draws **0** cards and returns
   `found: null`; the pile and discard are unchanged.
2. The uncovered Ass then lapses through the existing path — turn passes, Ass
   stays face-up, round continues.
3. A cover draw with a reachable cover is unchanged: identical card count and
   identical stopping card to the pre-fix build.
4. `gmuetlich` no longer plays an Ass while it holds a playable non-Ass, matching
   `gwieft`'s `safe` filter.
5. `gmuetlich` still plays an Ass when that is its only legal move.
6. `scripts/sim/test-futile-cover.mjs` covers 1–5 and fails against the pre-fix
   code.
7. All existing sim suites, `harness.mjs` (0 violations, 0 stalls) and
   `check-dc-sync.sh` pass.
