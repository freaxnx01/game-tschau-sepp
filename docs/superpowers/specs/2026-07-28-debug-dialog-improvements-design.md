# Debug Dialog Improvements — Design

## Background

Issue #9 collects three small usability gaps in the Debug dialog added by the
[debug mode feature](2026-07-27-debug-mode-design.md):

1. The dialog can only be closed via its explicit close button — no ESC
   shortcut, unlike a habit users expect from any modal.
2. The dialog is an in-page overlay, which blocks the game board while it's
   open. Testers want to see the debug journal/cards *while* playing, side by
   side with the main window.
3. The Cards tab labels a discarded card as "abgleit" (discarded) but doesn't
   say who played it — with 6+ cards in the discard pile it's easy to lose
   track of whether a given card was discarded by the player or the bot.

## Scope

Solo mode (vs. bots) only, matching the existing debug-mode scope — the
Debug dialog and button are already hidden outside `mode === 'bot'`
(index.html `showDebugBtn`/`showDebug`), so none of these three changes touch
P2P code paths.

## 1 — ESC closes the open dialog

A single `keydown` listener, registered once (component mount), checks
`event.key === 'Escape'`. It closes whichever dialog is currently open, in
this priority order (innermost first):

1. Confirm-leave dialog (`state.confirmLeave`)
2. Debug dialog (`state.debugOpen`)
3. Rules dialog (`state.rules`)

Only the first open dialog in that order is closed per keypress — if none are
open, the listener no-ops. This generalizes past the issue's literal ask
(Debug only) because Rules and confirm-leave are the same kind of full-screen
overlay and currently have no ESC support either; adding the same shortcut
inconsistently across dialogs would be a worse end state than doing it once.

## 2 — Ctrl+Click pops the Debug dialog into its own window

**Trigger:** Ctrl+Click (or Cmd+Click on macOS, via `event.metaKey ||
event.ctrlKey`) on the existing "Debug" header button. A plain click keeps
today's behavior (opens the in-page overlay). Ctrl+Click instead calls
`window.open('', 'tschau-sepp-debug')` and keeps the returned reference in
component state (not persisted — it's a live object, not serializable).

**Rendering:** the popup is not a separate route or bundle — it's the same
Debug dialog markup (Journal/Cards tabs, tab-switch buttons, card grid),
written into the popup's `document` by the main window on:

- popup open (initial paint)
- every subsequent `render()` of the main component, whenever `debugTab`,
  `debugLog`, or the derived `debugCards` change

This reuses the exact view-model object (`journalRows`, `debugCards`,
`rankHeaders`, `journalTabColor`, etc.) the in-page dialog already computes —
no new data plumbing, just a second paint target. Tab-switch buttons inside
the popup call back into `window.opener`'s `showJournalTab`/`showCardsTab`
handlers (available via the opener reference, same-origin), which update the
shared state; both windows re-render from that one state change.

A direct window reference is enough here — no `BroadcastChannel` or
`postMessage` protocol needed — because the popup only ever exists while the
main tab is open (it's a debug aid tied to a single play session, not a
feature that must survive a main-window reload).

**Lifecycle:**

- If the popup already exists (state holds a live reference) and isn't
  closed, Ctrl+Click focuses it (`popup.focus()`) instead of opening a
  second one.
- If the main window's Debug dialog closes (`closeDebug`) while the popup is
  open, the popup is also closed (`popup.close()`) — the popup is a view of
  "debug session in progress," not an independent artifact.
- If the user closes the popup manually (OS window controls), the next
  `render()` detects `popup.closed === true` and clears the stored reference;
  no explicit "popup closed" event handling is required beyond that check.

## 3 — Discard label names who played the card

`playCard(who, c)` (index.html, `playCard`) already knows the seat index at
the moment a card is discarded. Tag the card object with that seat when it's
pushed onto `discard`:

```js
discard: s.discard.concat([{ ...c, playedBy: who }])
```

In the Cards-tab label builder (`debugCards` construction), when
`loc === 'discard'`, append the player name using the existing `nm()` helper
(`nm(inDiscard.playedBy, my, seats)`, which already returns `'Du'` for the
viewer's own seat or the bot's name otherwise):

```
"Siebni Eichle — abgleit (Computer)"
"Siebni Eichle — abgleit (Du)"
```

Only the discard label changes. `otherHand`'s "i re anderne Hand" label is
left as-is — with exactly two seats in solo mode, "another hand" is already
unambiguous (it can only be the bot), so naming it explicitly would be a
no-op change to the visible text.

## Out of scope

- P2P multiplayer support for any of the three changes.
- A general "any dialog can pop into its own window" feature — only Debug
  gets a pop-out; Rules and confirm-leave keep their in-page-only behavior.
- Persisting the popup across a main-window reload (`BroadcastChannel`/
  cross-session sync) — see the lifecycle note above for why this isn't
  needed.
