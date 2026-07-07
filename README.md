# Tschau Sepp 🌹🛡️🌰🔔

The classic **Swiss card game** — a Mau-Mau / Uno-style game with authentic
**Jasskarten** (36 cards, suits *Rose · Schilte · Eichle · Schälle*). Play
**solo against the computer** (two AI difficulty levels) or **online against a
friend** (serverless peer-to-peer). Coaching/hint system, multi-round scoring,
synthesized sound, and a fully Swiss-German (Schwiizerdütsch) interface.

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

## Online 2-Player

Play head-to-head against a friend with no backend — signaling is manual copy-paste,
gameplay runs peer-to-peer over WebRTC:

1. One player clicks **Spiel erstelle** and gets an **offer code**.
2. The other clicks **Spiel biitrette**, pastes the offer, and returns an **answer code**.
3. Paste the answer back and you're connected — the game then runs directly between the
   two browsers over an `RTCDataChannel`.

Signaling codes travel however you like (chat, email). Connectivity uses Google's public
**STUN** servers only. Note: STUN-only can fail behind strict/symmetric NATs (some
corporate networks) — a TURN server or a tiny signaling service would fix that, but it's
out of scope for this static deployment.

## Tech

- **Single self-contained page.** `index.html` is the complete game — markup, styles,
  game logic, card art, and the component runtime, all inlined into one file. No build
  step, no server, no bundling.
- **No external asset files.** Every card face, suit symbol, and card back is generated
  at runtime as inline SVG; every sound is synthesized with the Web Audio API. Network
  dependencies are limited to the *Vollkorn* web font from Google Fonts (falls back to
  Georgia offline) and, for online play, Google's public STUN servers.

## Running Locally

`index.html` is fully self-contained, so you can just open it directly in a browser
(it even works from `file://`) — or, to mirror production, serve it over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Source & Maintenance

`index.html` is a bundled artifact. The original, editable source lives in `source/`:

- `source/Tschau Sepp Online.dc.html` — an HTML "Design Component": the template plus a
  `Component` logic class in a script tag. It references `./support.js` relatively.
- `source/support.js` — the component runtime (generated from a TypeScript build; do not
  edit by hand).

To change the game, edit the source, open the `.dc.html` locally to test, then
re-generate a self-contained `index.html` (inline `support.js` into the file). Deploying
the two source files side by side (an `index.html` next to `support.js` with the relative
`./support.js` reference intact) also works.

## Provenance & Credits

Designed by **Claude Design** and delivered as a self-contained publish package. The
game logic, rules, AI, artwork, and Swiss-German copy are the designer's; this repo was
assembled by [Claude Code](https://claude.com/claude-code) to publish the handoff on the
web.
