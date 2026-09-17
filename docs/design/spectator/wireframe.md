# Wireframe: CPU vs CPU spectator mode

Issue: [#1](https://github.com/freaxnx01/game-tschau-sepp/issues/1)
Phase 1 of the UI workflow. Approved 2026-09-17.

## What already works, verified before designing

Two `kind: 'bot'` seats play a complete round with **no new engine code**:

```text
round played itself : true      winner: Bot A
simulated time      : 106.2s for one round
cards conserved     : 36 ✓
hand area shows     : 0 cards face-up (mySeat = a bot seat)
Tipp button shown   : false
```

- `maybeBot()` already fires `botTurn()` for any bot seat with a 900–1700 ms
  delay, so **pacing is already human-watchable** — no new timer needed.
- `Tipp` already hides itself: it keys off `myTurn`, and it is never the
  human's turn.
- The gap is rendering: `mySeat` points at a bot seat, so `playerCards` is
  empty, and the other seat draws as card backs.

## Decisions

The issue's two open questions, plus two the probe surfaced:

- **Speed: fixed, reuse the existing pacing.** Rejected: a speed selector and a
  pause/step control. The current delay is already watchable; ship without new
  UI and revisit only if it feels wrong in practice.
- **Both hands face-up.** Nobody holds secrets, and seeing both is what makes
  the AI's choices judgeable — the stated motivation. The top seat changes from
  backs to faces; the bottom seat already renders that way.
- **Gmüetlich vs Gwieft**, not same-vs-same. `s.difficulty` is read in exactly
  two places — `botPick()` and the "forgets to say Tschau" roll — so moving it
  onto the seat is small and well covered by the harness.
- **No coaching overlay.** It already hides itself, and `advise()`/`scoreCard()`
  is a different heuristic from `botPick()`, so its "better move" would often
  contradict what the bot actually did.

## Screen 1 — Menu entry

```text
│  ┌────────────────────────────────────────────────────┐      │
│  │   Mit Kollege über s Internet spiele (2–4)         │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐ NEW  │
│  │        Zueluege: Gmüetlich gäge Gwieft             │      │
│  │     ↳ small, muted — a demo, not a way to play     │      │
│  └────────────────────────────────────────────────────┘      │
```

Last and visually quietest of the four entries. The label states the matchup, so
no extra controls are needed.

## Screen 2 — Spectating

```text
┌──────────────────────────────────────────────────────────────┐
│ Tschau Sepp   ● Gmüetlich 5 Ch.   ● Gwieft 4 Ch.   Rundä 1   │
├──────────────────────────────────────────────────────────────┤
│         ┌──┐┌──┐┌──┐┌──┐┌──┐   ← FACE-UP (was backs)         │
│         │6♠││K♦││U♣││9♥││A♠│                                 │
│         └──┘└──┘└──┘└──┘└──┘                                 │
│              Gmüetlich · 5 Charte                            │
│                                                              │
│              ┌──────┐   ┌──────┐                             │
│              │ back │   │  7♦  │   draw pile / discard       │
│              └──────┘   └──────┘                             │
│                                                              │
│            Gwieft leit d Siebni — Gmüetlich zieht 2          │
│                                                              │
│         ┌──┐┌──┐┌──┐┌──┐    ← already face-up today          │
│         │8♣││O♥││6♦││B♠│                                     │
│         └──┘└──┘└──┘└──┘                                     │
│                                                              │
│  [ no Tipp?, no Tschau!, no Passe — nothing is clickable ]   │
└──────────────────────────────────────────────────────────────┘
```

- **No interactive controls.** `Tipp?` self-hides; `Tschau!` and `Passe` must
  also be suppressed — nothing should be clickable, and the AI says Tschau
  itself.
- The existing **gold active ring** already marks whose turn it is, so no new
  turn indicator.
- **`Verlaa`** (top right, unchanged) is the way out.
- Pacing is the existing 900–1700 ms — no speed control, no new timer.

## States

| State | Behaviour |
|---|---|
| Round ends | The normal round-end card; "Nöchsti Rundä" continues the demo |
| Empty / loading / error | **N/A** — no fetch, no async, no failure mode |
