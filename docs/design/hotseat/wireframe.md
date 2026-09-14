# Wireframe: local hotseat multiplayer

Issue: [#2](https://github.com/freaxnx01/game-tschau-sepp/issues/2)
Phase 1 of the UI workflow. Approved 2026-09-14.

## Decisions taken before drawing

The issue listed two open questions; both were answered:

- **Hand-off UX: a full-screen reveal gate.** Rejected: blurring the hand only,
  and a slim confirm bar — both leave the board visible during hand-off.
- **Tipp/coach: off entirely in hotseat.** Between two humans a coach is an
  advantage asymmetry, and the "Nöd optimal" tips leak information about the
  hand.

Two further decisions:

- **Default names `Spiler 1` / `Spiler 2`, editable on the menu.** Name entry
  already exists for P2P (`myName`, `myNameCustom`), and named players make the
  reveal gate far clearer than "the other one".
- **The second human is a second `kind: 'local'` seat, with `mySeat` following
  the turn.** `renderVals()` already draws `s.mySeat`'s hand face-up at the
  bottom and every other seat as a face-down opponent, so moving `mySeat`
  reuses all existing rendering, messaging, toasts and scoring rather than
  adding a second rendering path.

## Screen 1 — Menu entry

```text
│  Gäge dr Computer:                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐          │
│  │      Gmüetlich       │  │       Gwieft         │          │
│  └──────────────────────┘  └──────────────────────┘          │
│                                                              │
│  ┌────────────────────────────────────────────────────┐ NEW  │
│  │  Zu zweit am gliche Grät:                          │      │
│  │  ┌───────────────┐  ┌───────────────┐              │      │
│  │  │ Spiler 1      │  │ Spiler 2      │  ← editable  │      │
│  │  └───────────────┘  └───────────────┘              │      │
│  │  ┌──────────────────────────────────────────────┐  │      │
│  │  │              Spiel starte                    │  │      │
│  │  └──────────────────────────────────────────────┘  │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐      │
│  │   Mit Kollege über s Internet spiele (2–4)         │      │
│  └────────────────────────────────────────────────────┘      │
```

Sits between the solo buttons and the online button — the three ways to start a
game, ordered by how local they are. The `Startcharte` toggle (#7) above applies
to it unchanged.

## Screen 2 — The reveal gate

Covers **everything**. No card, no discard pile, no score visible behind it:

```text
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                    ♠  ♦  ♣  ♥                                │
│                                                              │
│                 Gib s Grät em Vreni                          │
│                                                              │
│              Vreni het 6 Charte · Du hesch 4                 │
│                                                              │
│          ┌────────────────────────────────────┐              │
│          │        Bereit — ufdecke            │              │
│          └────────────────────────────────────┘              │
│                                                              │
│            Turbo-Sepp het e Siebni gleit —                   │
│                  du muesch 2 zieh                            │
└──────────────────────────────────────────────────────────────┘
```

- **Name of the incoming player** is the headline, so the device reaches the
  right person.
- **Card counts only, never faces.** How many cards an opponent holds is already
  public on the board; it is shown so the incoming player is not blind.
- **What just happened** in small text (the existing `message` string) — again
  public information the board already displays.
- One large hit target, comfortable on a phone passed between hands.

## Screen 3 — In-game differences

```text
┌──────────────────────────────────────────────────────────────┐
│ Tschau Sepp    ● Vreni 6 Ch. · 12 P.   ● Res 4 Ch. · 20 P.   │
├──────────────────────────────────────────────────────────────┤
│              [ board exactly as today ]                      │
│                                                              │
│   ┌────────┐                                    ╔══════════╗ │
│   │ Tipp?  │  ← REMOVED in hotseat              ║ Tschau!  ║ │
│   └────────┘                                    ╚══════════╝ │
│                                                              │
│              [ active player's hand, face up ]               │
└──────────────────────────────────────────────────────────────┘
```

The board is unchanged — the active player is whoever `mySeat` currently points
at. **Tipp is gone**: button hidden and the "Nöd optimal" tips suppressed.

## States

| State | Behaviour |
|---|---|
| Normal turn change | Reveal gate, then the board |
| Same player again (an 8, or "nomol dra") | **No gate** — the device does not change hands |
| Round ends | Round-end card as today, no gate before it |
| Empty / loading / error | **N/A** — no data fetch, no async, no failure mode |

The "same player again" case matters: an 8 grants a double turn, and a gate
there would be a pointless tap *and* would leak that something special happened.
