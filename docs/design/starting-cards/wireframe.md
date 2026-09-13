# Wireframe: choose the number of starting cards

Issue: [#7](https://github.com/freaxnx01/game-tschau-sepp/issues/7)
Phase 1 of the UI workflow. Approved 2026-09-10.

## Decisions taken before drawing

- **Values: 5 or 7 only** — matches the existing `startcharte` prop's options
  (`source/Tschau Sepp Online.dc.html:432`). A two-state toggle is the smallest
  change, and these are the counts the game is already balanced around. 9 was
  rejected: 9 x 4 players = 36 = the whole deck, leaving nothing to draw.
- **Start menu only** — not also in the multiplayer lobby. One place to look.
- The control feeds `startRound()`'s
  `parseInt(this.props.startcharte ?? '5', 10) || 5` at line 719.
- In P2P the **host** decides: only the host runs `startRound()` and syncs the
  dealt hands, so a guest's local choice is irrelevant by construction.
- Persistence is `localStorage`, per the stack overlay.

## Menu with the new region

```text
┌──────────────────────────────────────────────────────────────┐
│                       Tschau Sepp                            │
│      S'klassische Schwiizer Chartespiel — mit ächte           │
│                      Jasscharte                              │
│              Das Spiel isch em Eric gwidmet.                 │
│                                                              │
│        ♠ Schilte   ♦ Rose   ♣ Eichle   ♥ Schälle             │
│                                                              │
│  ┌────────────────────────────────────────────────────┐ NEW  │
│  │  Startcharte:   ┌─────────┐  ┌─────────┐           │      │
│  │                 │   5 ✓   │  │    7    │           │      │
│  │                 └─────────┘  └─────────┘           │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  Gäge dr Computer:                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐          │
│  │      Gmüetlich       │  │       Gwieft         │          │
│  │  für gmüetlichi Sepp │  │   für gwiefti Füchs  │          │
│  └──────────────────────┘  └──────────────────────┘          │
│                                                              │
│  ┌────────────────────────────────────────────────────┐      │
│  │   Mit Kollege über s Internet spiele (2–4)         │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  Tipp: Bi dr letschte Charte nöd vergässe «Tschau!» z'säge…   │
│  Quellcode uf GitHub — freaxnx01/game-tschau-sepp            │
└──────────────────────────────────────────────────────────────┘
```

## The toggle, close up

```text
   Startcharte:   ┌─────────┐  ┌─────────┐
                  │    5    │  │    7    │     ← unselected: flat, muted
                  └─────────┘  └─────────┘

   Startcharte:   ┏━━━━━━━━━┓  ┌─────────┐
                  ┃    5    ┃  │    7    │     ← selected: gold border,
                  ┗━━━━━━━━━┛  └─────────┘        raised, brighter fill
```

Reuses the menu's existing button vocabulary — same gradient fill, `2px`
border and `border-radius` as the difficulty buttons, at a smaller size so it
reads as a setting rather than a third way to start a game.

## States

| State | Behaviour |
|---|---|
| Default (first visit) | 5 selected — current behaviour, unchanged |
| Returning visitor | last choice, from `localStorage` |
| Storage absent, unreadable or invalid | falls back to 5 silently |

No loading, empty or error state: the value is a local two-way choice with no
async work and no failure mode. The `localStorage` read is wrapped in
try/catch, because it throws outright in some contexts (private windows,
blocked site data).

## Behaviour carried into Phase 2

- Applies to the **next** round started; never disturbs a game in progress.
- Governs both solo buttons and any game the host opens.
- The dc `startcharte` prop remains the initial default, so a published build
  can still ship a different value; the runtime choice overrides it.
- Keyboard: two real `<button>`s, tabbable, `aria-pressed` on the selected one.
