# Debug Mode — Design

## Background

A tester reported "8 sevens" / "4 played, picked up a 5th, computer played a 6th"
in a single round, which sounded like a duplicate-card bug (a standard Swiss Jass
deck has exactly 4 sevens). Investigation confirmed no bug: `buildDeck()`
(index.html:416-422) builds one correct 36-card deck per round and the
discard-pile reshuffle (`drawCards`/`drawUntilCover`, index.html:723-760) does
not duplicate cards. The reported numbers match the documented stackable-7
mechanic (README.md:19): each chained 7 adds +2 to `pending7`
(index.html:855, 888), so "6" or "8" is the accumulated draw-penalty count, not
a count of seven cards.

To let players verify this themselves (and to help debug any future report of
this kind), we're adding an in-game debug mode: a journal of cards played this
round, and a full-deck overview showing where every card currently is.

## Scope

Solo mode (vs. bots) only. Not available in P2P multiplayer for now — the
guest peer's local state doesn't carry the full round history, and hand
contents are not synced between peers. Debug mode will be hidden/disabled
in P2P games.

## UI

- A "Debug" button in the top bar, next to the existing "Regle" button, same
  visual style. Visible whenever a solo round is in progress (`started &&
  mode === 'bot'`).
- Clicking opens a full-screen modal (same overlay pattern as the Rules modal,
  index.html:356-370), with two sections: **Journal** and **Cards**.
- Closeable the same way as the Rules modal (an explicit close button).

## Journal section

Lists every card played in the current round, in play order:

- Seat name (You / bot name)
- Card (suit + rank, using existing `suitName`/`rankName` helpers)
- Effect annotation where applicable:
  - Seven played: "+2, Stapel jetzt N" (current `pending7` value after the play)
  - Under played: "Wunsch: <suit>"
  - Ace played: "Deckt mit <card>" (once resolved) or "Muess decke" (pending)
  - Eight as last card / forgot Tschau / Sepp win: short existing message text

Backed by a new state field, e.g. `state.debugLog` — a plain array, not capped
(unlike the existing `history` field, which is capped at 12 and used
elsewhere for hover-hint purposes; reusing it would either break those
consumers or truncate the journal). Reset to `[]` at the start of every round
alongside the existing round-reset fields (`startRound`, `nextRound`).

## Cards section

A grid of all 36 cards (4 suits × 9 ranks: 6,7,8,9,B,U,O,K,A), computed from
the live `pile`/`discard`/`seats[*].hand` state each render — no new stored
field needed, since deck composition is always derivable from current state.

Each cell shows the card face and one of four visual states:

| State | Condition | Visual |
|---|---|---|
| Discarded | present in `state.discard` | face-up, dimmed |
| In your hand | present in `state.seats[mySeat].hand` | face-up, highlighted border |
| In a hand (bot) | present in another seat's hand | card back, no seat identity shown |
| In draw pile | present in `state.pile` | card back |

This directly shows "there are only 4 sevens, here's where each one is" —
enough to verify counts without turning the feature into a full x-ray of bot
hands.

## Message wording fix (bundled, same root cause)

`M('seven', ...)` and `M('drewN', ...)` (index.html:470, 476) currently read
e.g. "Siebni! Zieh 6 Charte — oder stack sälber e Siebni!" — technically
correct (6 is a card count) but easy to misread mid-game as "6 sevens".

Add the chain count alongside the draw count wherever `pending7` is shown, so
the two numbers can't be conflated, e.g.:

"Siebni! (3. Siebni i Folg) Zieh 6 Charte — oder stack sälber e Siebni!"

This requires tracking a chain counter (increment on each stacked 7, reset
when the pending penalty is drawn/cleared) alongside the existing `pending7`
state.

## Out of scope

- P2P multiplayer support for debug mode.
- Persisting the journal across rounds or app reloads.
- Revealing which specific bot seat holds a given card.
