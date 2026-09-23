# Design: ending the round when a 7 chain is provably dead

Issue: [#33](https://github.com/freaxnx01/game-tschau-sepp/issues/33)
Date: 2026-09-21

## Background

#33 reports: seat 1 goes out on a 7, seat 2 draws the two penalty cards, none of
them a 7 — and the round does not end. It does end, eventually, but only after
seat 2 has taken a full turn first.

That pause is deliberate. [#27](https://github.com/freaxnx01/game-tschau-sepp/issues/27)
reported the opposite complaint — the round ended *before* a drawn 7 could be
played — and 7a75d56 fixed it by keeping the winner pending until play actually
returns to them (`nextTurn:1186-1192`). The fix made no distinction between
"drew a 7" and "drew something else", so it bought #27's case at the price of
#33's.

## The defect

Two paths resolve a forced 7-penalty draw, and they disagree with each other.
Measured on a virtual clock, seat 0 out on a 7, seat 1 holding no 7:

| Drawer | Drew a 7? | Today | Correct |
| --- | --- | --- | --- |
| Human — `drawFor:1424-1432` | no | round stays open, drawer takes a turn | end at once |
| Human — `drawFor:1424-1432` | yes | stays open, the 7 is playable | unchanged |
| Bot — `botTurn:1412-1423` | no | round ends at once | unchanged |
| Bot — `botTurn:1412-1423` | **yes** | **round ends anyway, the 7 is never played** | stay open |

`botTurn` tests `pw !== me` *before* looking at what it drew, so 7a75d56's fix
never reached it: the bot path still carries the original #27 bug. `drawFor`
keeps the winner pending unconditionally, so it cannot tell a live chain from a
dead one — the #33 bug. Each path is wrong in the opposite direction.

### Why the extra turn matters

It is not only a pause. The drawer plays a card before the round is scored, so
the losing hand is one card lighter than the rules intend and the winner is
awarded fewer points. `endRound()` sums `pointsOf(x.hand)` over every other seat
(`:1471-1474`), so the free discard comes straight off the winner's score.

### What already works

`scripts/sim/test-drawn-seven.mjs` covers #27 and passes. Its third case —
nothing playable at all after the draw — already ends the round promptly,
because `drawFor` falls through to `nextTurn()`, which awards it. So the gap
opens only when the drawer has *some* playable card but no 7.

## The fix

One rule, applied identically in both paths:

> After a forced 7-penalty draw by a seat that is not the pending winner, the
> round is awarded immediately **only if the drawer holds no playable 7 and the
> pending winner is the very next seat**. In every other case the drawer keeps
> the turn and the round resolves in `nextTurn()` as before.

**The seat-order half was missing from the first draft of this spec**, which
assumed two players throughout. With three or four seats a player sitting
between the drawer and the winner can still play a 7 of their own and pull the
winner back into the round — exactly what #27 established — so the chain is not
provably dead just because the immediate drawer cannot stack. Awarding the round
there cuts those seats out of a turn they are entitled to. Caught in review of
PR #34; see the Consequences section.

Expressed as a query on the post-draw hand, plus a seat-order test:

```javascript
const canStack = this.state.seats[who].hand.some(c => c.rank === '7' && this.canPlay(c));
const winnerIsNext = this.nextOk(who) === w;
```

`pending7` has already been cleared at this point, so `canPlay()` judges the 7
against the discard top — which is the winner's own 7 — and any 7 rank-matches
it. The `canPlay()` call is kept rather than simplified to a rank test, so the
check stays correct if the top card ever changes.

### `drawFor()`

In the `pendingWinner != null` block, the `who !== w` case gains the check: no
playable 7 **and** the winner sitting next means clear `pendingWinner`, show the
winner's `Sepp!` bubble and `endRound(w)` after 600 ms — the same shape the `who === w` exhausted-pile case
already uses. With a playable 7 the winner stays pending exactly as today, and
the chain can be passed back.

The `who === w` case (the winner drew for themselves, #16) is untouched.

### `botTurn()`

The condition `pw != null && (pw !== me || !got.length)` becomes: end the round
when the winner is someone else **and** the bot cannot stack **and** the winner
sits next, or when the bot is the winner and drew nothing.

`botTurn` also has to stop clearing `pendingWinner` in the setState that precedes
that test. That was harmless while `pw !== me` always conceded on the spot, but
once a bot can keep the chain alive by stacking, an eagerly cleared winner is a
claim silently thrown away — and with 3–4 seats nothing then awards the round at
all, which is the unresolvable state #16 was filed for. It now mirrors
`drawFor()`: the winner is cleared on conceding, or when the winner drew for
themselves. A bot that drew a playable 7 now continues into the
existing `after(1100)` block; `botPick()` prefers a 7 when an opponent holds two
cards or fewer (`:1461-1462`), and a card-less winner satisfies that, so the bot
stacks back rather than sitting on it.

## Non-goals

- No change to `nextTurn()`'s award check — it remains the resolution point for
  every path that does not end in `drawFor`/`botTurn`.
- No change to what a forced draw costs, or to `pointsOf()` scoring itself.
- The four-line "bubble + message + `endRound` after 600 ms" sequence now exists
  in five places. Extracting it is a worthwhile cleanup and explicitly **not**
  part of this change; it is recorded in `TODO.md` instead.

## Consequences

- A dead chain now resolves ~1 s sooner: the round is awarded directly from the
  draw rather than after `drawFor`'s 1000 ms fall-through into `nextTurn()`.
- `test-drawn-seven.mjs`'s fourth case ("responding with a non-7 also breaks the
  chain") keeps passing, but its `playCard()` call becomes a no-op — the round
  has already ended. The case is rewritten to assert that directly, so it tests
  the new rule instead of passing by accident.
- Bots get measurably better at holding a round open: a bot that draws a 7 off a
  last-card 7 now stacks it back, which can extend a round that used to end.

## Testing

New `scripts/sim/test-dead-chain.mjs`, following the `position()` scaffold in
`scripts/sim/test-drawn-seven.mjs` (both seats local, deterministic pile).

Cases, each for the human path and the bot path:

1. Drawer holds no 7 after the draw but has another playable card → the round
   ends immediately, before any discard, and the winner's points include that
   card.
2. Drawer draws a playable 7 → the round stays open and the 7 is playable.
3. Bot draws a playable 7 → the round stays open (this fails today).
4. The winner drawing for themselves (#16) is unaffected.

Then the existing suites: `test-drawn-seven.mjs` (with its fourth case
rewritten), `test-guard.mjs`, every other `scripts/sim/test-*.mjs`,
`harness.mjs '' 500 20`, and `scripts/check-dc-sync.sh`.

This repo ships on sim-suite evidence; no in-browser playtest gates the change.

## Acceptance criteria

1. Human drawer, no playable 7 after the forced draw, winner sitting next: the
   round is awarded to the winner immediately and the drawer never gets to
   discard.
2. Human drawer, playable 7 after the draw: unchanged — the winner stays pending
   and the 7 can be played back at them.
3. Bot drawer, playable 7 after the draw: the round stays open and the bot plays
   the 7 back at the winner.
4. Bot drawer, no playable 7: unchanged — the round is awarded immediately.
5. The winner drawing for themselves with an exhausted pile still ends the round
   (#16 does not regress).
5b. Three or four seats, a seat between the drawer and the winner: the round does
   **not** end early, that seat takes its turn, and `pendingWinner` survives — including
   across a bot that keeps the chain alive by stacking a drawn 7.
6. The losing hand scored at round end includes the card the drawer would
   previously have discarded.
7. `scripts/sim/test-dead-chain.mjs` covers criteria 1–5 and fails against the
   pre-fix code.
8. `test-drawn-seven.mjs` passes with its fourth case rewritten to assert the
   round ends before the non-7 discard.
9. All existing sim suites and `scripts/check-dc-sync.sh` pass.
