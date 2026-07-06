# Tschau Sepp 🌹🛡️🌰🔔

The classic **Swiss card game** — a Mau-Mau / Uno-style game played head-to-head
against the computer with authentic **Jasskarten** (36 cards, suits *Rose · Schilte ·
Eichle · Schälle*). Two AI difficulty levels, a coaching/hint system, multi-round
scoring, synthesized sound, and a fully Swiss-German (Schwiizerdütsch) interface.

**▶️ Play it: https://github.freaxnx01.ch/game-tschau-sepp/**

## How to Play

Match the top discard card by **suit** or **rank**. Can't (or won't) play? Draw one —
if it fits you may play it, otherwise pass. First to empty their hand wins the round
and scores the value of the opponent's remaining cards.

| Card | Effect |
| --- | --- |
| **7** | Opponent draws 2 — *stackable* (2 → 4 → 6 …) by answering with another 7 |
| **8** | Opponent is skipped — you play again. You can't finish on an 8 |
| **Under** (Joker) | Playable on anything; you wish for a colour the next card must match |
| **Ass** | Must be "decked": cover it with another Ass, the same suit, or an Under — else draw until you can. You can't finish on a bare Ass |
| **Last card** | Press **Tschau!** *before* playing your second-to-last card, or take 2 penalty cards. The winning card is announced **Sepp!** |

**Scoring:** Ass 11 · Banner 10 · Künig 4 · Ober 3 · Under 2. Rounds and points
accumulate; the starter alternates each round.

**Difficulty:** *Gmüetlich* (easy — plays randomly, sometimes forgets to say Tschau) ·
*Gwieft* (smart — hoards Unders, blocks with 7s, plays for double turns, dumps
high-value cards). Stuck? Hit **Tipp?** for the best move; a coach also flags clearly
suboptimal plays.

## Tech

- **Single self-contained page.** No build step, no server, no bundler.
- `index.html` is the original **design-component** file authored by Claude Design; it
  uses a compact template DSL (`<x-dc>`, `<sc-if>`, `<sc-for>`, `{{ }}`) with the game
  logic in a `class Component`.
- `support.js` is a small (~10 KB) runtime — a `DCLogic` base class plus a template
  engine with in-place DOM reconciliation — that executes that component in the
  browser. It was written to accompany the handoff (the original bundle referenced but
  did not include it).
- **No external assets.** Every card face, suit symbol, and card back is generated at
  runtime as inline SVG; every sound is synthesized with the Web Audio API. The only
  network dependency is the *Vollkorn* web font from Google Fonts.

## Running Locally

It uses no ES-module imports, so you can open `index.html` directly — or, to mirror
production, serve it over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Provenance & Credits

Designed by **Claude Design** and delivered as a high-fidelity design-component
handoff. The game logic, rules, AI, artwork, and Swiss-German copy are the designer's;
the accompanying `support.js` runtime and this repo were produced by
[Claude Code](https://claude.com/claude-code) to make the handoff playable on the web.
