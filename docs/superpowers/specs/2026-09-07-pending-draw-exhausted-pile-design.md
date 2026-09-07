# Design: resolving a pending-7 draw when the pile cannot serve it

Issue: [#16](https://github.com/freaxnx01/game-tschau-sepp/issues/16)
Date: 2026-09-07

## Background

#16 was filed as "the round ends on a last-card 7 without letting the next
player stack theirs". Driving the real dc logic through a fake-clock repro of
the reported position showed every reachable path behaves correctly: the turn
passes to the next player with `pending7 = 2` and their 7 playable. The
reported end-state could only be reproduced by making `drawCards()` return
nothing, which needs `pile` empty **and** `discard.length <= 1` at the same
time — unreachable while the 36-card invariant holds.

The issue is therefore narrowed to what the investigation did prove: `drawFor()`
resolves the pending-7 chain without regard for whether any card was actually
drawn, and one branch of that leaves the game in an unresolvable state.

## The defect

`drawFor()` handles a draw under `pending7 > 0` like this:

1. `got = drawCards(who, n)`
2. clear `pending7` / `sevenChain`
3. if `pendingWinner != null`: clear it; if `who !== w`, end the round for `w`
4. *then* `if (!got.length)` → `noCards` message, pass the turn

Step 3's `who !== w` test is the problem. When the pending winner is the seat
that must draw — the "winner has no cards, so if the chain comes back round
they draw for themselves" case the code deliberately supports — and the draw
yields nothing, control falls through to step 4. `pendingWinner` has already
been cleared, so the seat is left holding **an empty hand with no win**, and
the round continues with no way to ever resolve it.

Ending the round when `who !== w` is *not* a defect: choosing to draw under
`pending7` breaks the chain whether or not the pile could physically serve the
cards, so awarding the round to the winner is correct. Only the fall-through is
wrong.

## Decision

When a pending-7 draw yields **no cards**, the draw pile is exhausted and the
round cannot continue. Resolve it immediately rather than falling through:

- `pendingWinner != null` → end the round for that winner, **regardless of
  whether the drawing seat is the winner**. This closes the hole; the
  `who !== w` case already behaved this way.
- `pendingWinner == null` → no one is out, so waive the unservable penalty and
  pass the turn (today's behaviour, unchanged).

A draw that yields cards keeps its current behaviour exactly.

## Scope

- `drawFor()` in `source/Tschau Sepp Online.dc.html` only.
- `botTurn()`'s mirrored `pendingWinner` branch is **out of scope**: it calls
  `drawCards()` and resolves the same way, but a bot only reaches it with
  `cand.length === 0`, and the same-seat case is already handled there by
  `pw !== me`. Note it, don't change it.
- No rule change. Nothing a player can observe in a normal game changes.

## Why fix an unreachable state

The trigger needs a broken deck invariant, so this is robustness, not a live
bug. It is worth the few lines because the failure mode is unrecoverable — a
seat that can never win and a round that can never end — and because the
harness already asserts the invariant that keeps it unreachable, so a
regression there would surface here as a hang rather than an error.

## Acceptance criteria

- A pending-7 draw that returns no cards while `pendingWinner` is set ends the
  round for that winner, including when the drawing seat *is* the winner.
- A pending-7 draw that returns no cards with no `pendingWinner` waives the
  penalty and passes the turn, as today.
- A pending-7 draw that returns cards is unaffected: chain cleared, round ended
  for the winner when the chain broke at another seat.
- The full sim suite and the CPU-vs-CPU invariant harness still pass.
