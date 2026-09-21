# Design: locking player input while a penalty animation is pending

Issue: [#32](https://github.com/freaxnx01/game-tschau-sepp/issues/32)
Date: 2026-09-21

## Background

#32 was filed as "player 1 plays an 8 as their last card, stays on turn, clicks
the draw pile, and gets 2 cards instead of 1". Driving the real dc logic through
a virtual-clock repro of that position confirms it — and shows the 8 is not the
cause. The same defect sits in every branch of `playCard()` that defers a
penalty through `this.after()` while leaving the turn on the player.

## The defect

`drawFor()` admits a draw when `phase === 'play' && turn === who && !hasDrawn`
(`source/Tschau Sepp Online.dc.html:1239`). `playCard()` sets `hasDrawn: false`
in its base patch (`:1068`) and the three deferred branches below never move
`turn` away from the player, so that guard passes for the entire 900–1400 ms
animation window. A click landing in the window draws a card that the branch's
own scheduled `drawCards()` then adds to.

Measured with a fake clock, click at t = 300 ms:

| Branch | Baseline, no click | One pile click in the window |
| --- | --- | --- |
| 8 as last card (`:1105-1117`) | hand 1, still on turn | hand **2**, turn handed away |
| „Tschau" vergässe (`:1143-1149`) | hand 2, turn passed | hand **3**, turn **not** passed |
| Blutts Ass (`:1081-1096`) | hand 1, `cover = 0` | hand **3**, `cover = null` |

The reported symptom is the mildest of the three. The bare-Ace row is a rules
hole: the player escapes the Ass-decken obligation entirely by clicking the pile
during the animation, and the turn passes on as if the Ace had never been bare.

The hole is reachable over P2P as well — `onNet` dispatches a guest's `draw`
straight into the same `drawFor()` (`:1751`).

## The fix

A single `busy` state flag that means *the table is mid-animation; player input
does not apply*. It is not a UI nicety: it is the authority-layer guard the three
branches are missing.

### Setting and clearing

`busy: false` is added to the initial state (`:485-493`) and to `startRound()`'s
reset (`:852-855`).

Each deferred branch sets `patch.busy = true` and clears it in the setState that
ends its own animation:

- **bare Ace** — cleared alongside `cover` / `turn` in the `after(300)` tail
- **8 as last card** — cleared alongside `turn` / `hasDrawn` in the `after(400)` tail
- **forgot Tschau** — the branch ends in `nextTurn()`, so `nextTurn()` clears
  `busy` on **both** exits: the normal one (`:1197`) and the
  `pendingWinner → endRound` early return (`:1186-1192`). `endRound()` clears it
  too.

The two extra clearing sites are deliberate redundancy. `after()` drops its
callback when `this.tk` changes (`:720`), so a branch interrupted by a round
change would otherwise leave `busy` set and the table frozen for the rest of the
game. Every path that starts a round or ends one resets the flag.

### Guarding

These entry points return early while `busy` — no sound, no message, exactly as
`drawFor()` already treats a click that is not the player's turn:

- `drawFor()` (`:1239`) — the authority point reached by both `drawClick()` and
  `onNet 'draw'` (`:1751`)
- `play(id)` (`:1038`) and `onNet 'play'` (`:1745-1749`) — the two card-click
  entries. `playCard()` itself stays unguarded so the engine remains callable
  from the bot and from the deferred callbacks.
- `sayTschau()` (`:1216`) and `passTurn()` (`:1296`). `passTurn()` is already
  covered by its `hasDrawn` guard; the flag is added for consistency, so every
  input path reads the same lock.

A swallowed click is silent. The window is under 1.5 s and the player clicked in
good faith while the game was applying a penalty to them; a deny buzz there reads
as punishment.

### Render

`renderVals()` (`:2068`) computes `drawCursor` as `default` while busy, and
`showTschau` (`:2077`) is hidden while busy so no visible button is inert.

Both are computed values in `renderVals()`, not markup — the change is JS-only
and `scripts/bundle.sh` regenerates it without the `<x-dc>` double-edit that
AGENT-NOTES.md warns about.

### P2P

`busy` joins the host snapshot (`:1781-1791`) and `applySnap()` (`:1816-1821`),
so a guest sees the same locked table the host does. The guest's own `drawClick()`
branch (`:1290`) checks it and does not send. The host's guards remain the
authority — a `draw` or `play` arriving from an unpatched guest during the window
is still dropped.

## Non-goals

- No change to the durations of the animations themselves.
- No change to which penalties exist or how many cards they draw.
- Bot input is not guarded. A bot is never on turn during a human's penalty
  window, and `maybeBot()` is scheduled by the same branches that clear the flag.

## Testing

New `scripts/sim/test-penalty-lock.mjs`, following the existing
`scripts/sim/test-guard.mjs` pattern (extract the dc-script block from
`index.html`, run it against a stub `DCLogic`) with one addition: a virtual clock
that queues `setTimeout` callbacks so a click can be injected at a chosen moment
inside the window.

For each of the three branches the test runs the position twice — once with a
pile click at t = 300 ms, once without — and asserts both runs end with the same
`hand.length`, `turn`, `cover` and `hasDrawn`. The test must fail against the
current code before the fix lands.

Then the existing suites: `test-guard.mjs`, `harness.mjs '' 500 20`, the other
`scripts/sim/test-*.mjs`, and `scripts/check-dc-sync.sh`.

This repo ships on sim-suite evidence; no in-browser playtest gates the change.

## Acceptance criteria

1. 8 as last card: a pile click during the penalty animation leaves the player
   with exactly 1 card and still on turn.
2. Forgot Tschau: a pile click during the window draws exactly 2 penalty cards
   and the turn passes as it does without the click.
3. Bare Ace: a pile click during the window leaves `cover` set to the player and
   the turn with them; the hand matches the draw-until-cover baseline.
4. The draw pile renders a `default` cursor and the Tschau button is hidden while
   the table is locked.
5. A P2P guest sees the lock (snapshot carries `busy`) and a `draw` / `play`
   message arriving during the window is dropped by the host.
6. `busy` is false at the start of every round, including after a round that
   ended while a penalty animation was pending.
7. `scripts/sim/test-penalty-lock.mjs` covers criteria 1–3 and fails against the
   pre-fix code.
8. All existing sim suites and `scripts/check-dc-sync.sh` pass.
