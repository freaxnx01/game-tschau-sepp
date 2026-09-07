# Plan: resolve a pending-7 draw when the pile cannot serve it

Issue: [#16](https://github.com/freaxnx01/game-tschau-sepp/issues/16)
Spec: [2026-09-07-pending-draw-exhausted-pile-design.md](../specs/2026-09-07-pending-draw-exhausted-pile-design.md)

## Goal

`drawFor()` must resolve a pending-7 draw that yields no cards instead of
falling through and leaving a seat with an empty hand and no win.

## Global constraints

- **Edit `source/Tschau Sepp Online.dc.html`, then run `scripts/bundle.sh`.**
  Never hand-edit the dc block in `index.html`; the pre-commit hook and CI both
  run `scripts/check-dc-sync.sh`.
- TDD: the failing test comes first and must fail for the stated reason.
- Buildless stack — no dependencies, no build step, no framework.
- Surgical: only the pending-draw branch of `drawFor()` changes.

## Task 1 — Failing test

**Files:** `scripts/sim/test-pending-draw.mjs` (new)

**Interfaces:** none new. Drives `Component` directly, following the harness
scaffold in `scripts/sim/test-reshuffle.mjs` (fake `DCLogic`, timers swallowed
via `globalThis.setTimeout = () => 0`, component source read out of the
`text/x-dc` script block).

### Write the failing test

Build a two-seat state where the pile is empty and the discard holds a single
card, so `recycleDiscard()` reports `reshuffled: false` and `drawCards()`
returns nothing.

```js
// Tests for resolving a pending-7 draw when the draw pile cannot serve it.
// See docs/superpowers/specs/2026-09-07-pending-draw-exhausted-pile-design.md
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

globalThis.setTimeout = () => 0; // swallow timers — synchronous assertions only
globalThis.setInterval = () => 0;

class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(update, cb) {
    const patch = typeof update === 'function' ? update(this.state) : update;
    this.state = { ...this.state, ...patch };
    cb && cb();
  }
  forceUpdate() {}
}

const Component = new Function('DCLogic', 'StreamableLogic', 'React', src + '\n;return Component;')(DCLogic, DCLogic, {});

let failed = false;
function check(name, cond, detail) {
  if (cond) { console.log('PASS ' + name); return; }
  failed = true;
  console.log('FAIL ' + name + (detail ? ': ' + detail : ''));
}

// An exhausted pile: nothing to draw and a single-card discard, so
// recycleDiscard() cannot reshuffle and drawCards() returns [].
function exhausted({ turn, pendingWinner, hands }) {
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 0, roundNum: 1, starter: 0,
    seats: [
      { name: 'Du', kind: 'local', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'Bot', kind: 'bot', hand: [], said: true, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  c.startRound();
  c.setState({
    phase: 'play', turn, cover: null, wish: null, hasDrawn: false, roundEnd: null,
    pending7: 2, sevenChain: 1, pendingWinner,
    pile: [], discard: [{ id: 900, suit: 'schilte', rank: '9' }],
    seats: c.state.seats.map((x, i) => ({ ...x, hand: hands[i].slice() })),
  });
  return c;
}

const CARD = { id: 801, suit: 'rose', rank: 'A' };

{
  // The regression: the seat that must draw IS the pending winner. It has no
  // cards, the pile cannot serve the penalty, and the round must end for it.
  const c = exhausted({ turn: 1, pendingWinner: 1, hands: [[CARD], []] });
  c.drawFor(1);
  check('exhausted pile: the round is resolved for the pending winner that drew',
    c.state.pendingWinner === 1 || c.state.roundEnd != null,
    'pendingWinner=' + c.state.pendingWinner + ' roundEnd=' + JSON.stringify(c.state.roundEnd));
  check('exhausted pile: no seat is left with an empty hand and an unresolved round',
    !(c.state.phase === 'play' && c.state.roundEnd == null
      && c.state.seats.some(x => x.status === 'ok' && x.hand.length === 0)),
    'phase=' + c.state.phase + ' hands=' + JSON.stringify(c.state.seats.map(x => x.hand.length)));
}

{
  // Unchanged: the chain broke at another seat, so the winner takes the round.
  const c = exhausted({ turn: 0, pendingWinner: 1, hands: [[CARD], []] });
  c.drawFor(0);
  check('exhausted pile: a broken chain still resolves for the winner',
    c.state.pending7 === 0, 'pending7=' + c.state.pending7);
}

{
  // Unchanged: nobody is out, so the unservable penalty is waived.
  const c = exhausted({ turn: 0, pendingWinner: null, hands: [[CARD], [CARD]] });
  c.drawFor(0);
  check('exhausted pile: with no pending winner the penalty is waived',
    c.state.pending7 === 0 && c.state.roundEnd == null,
    'pending7=' + c.state.pending7 + ' roundEnd=' + JSON.stringify(c.state.roundEnd));
}

process.exit(failed ? 1 : 0);
```

**Verify:** `node scripts/sim/test-pending-draw.mjs "source/Tschau Sepp Online.dc.html"`
fails on the first two checks — the seat is left with an empty hand and the
round unresolved — and passes the last two.

## Task 2 — Resolve the exhausted draw

**Files:** `source/Tschau Sepp Online.dc.html` (`drawFor()`), then `index.html`
via `scripts/bundle.sh`.

**Interfaces:** no signature changes.

### Make it pass

In `drawFor()`, the pending-7 block currently reads:

```js
    if (s.pending7 > 0) {
      this.setState({ pending7: 0, sevenChain: 0 });
      if (s.pendingWinner != null) {
        const w = s.pendingWinner;
        this.setState({ pendingWinner: null });
        if (who !== w) {
          // Chain isch bi dim Sitz brochen worde, bevor's zrugg zum Gwinner isch cho — sini Rundä stoht.
          this.setState({ bubble: { seat: w, text: 'Sepp!' }, message: this.M(w, 'sepp') });
          this.after(600, () => this.endRound(w));
          return;
        }
        // dr Gwinner sälber het müesse zieh (het ja kei Charte) — Rundä gaht wieter
      }
    }
```

Change the `who !== w` condition so an unservable draw also resolves for the
winner. The winner keeps drawing and playing on only while cards actually
arrive:

```js
    if (s.pending7 > 0) {
      this.setState({ pending7: 0, sevenChain: 0 });
      if (s.pendingWinner != null) {
        const w = s.pendingWinner;
        this.setState({ pendingWinner: null });
        // Dr Gwinner sälber cha na wiiterspiele — aber nume, wenn er würklich
        // Charte übercho het. Isch dr Stapel läär, isch d Rundä nöd meh z'löse.
        if (who !== w || !got.length) {
          // Chain isch brochen — sini Rundä stoht.
          this.setState({ bubble: { seat: w, text: 'Sepp!' }, message: this.M(w, 'sepp') });
          this.after(600, () => this.endRound(w));
          return;
        }
      }
    }
```

**Verify:**

1. `node scripts/sim/test-pending-draw.mjs "source/Tschau Sepp Online.dc.html"` — all pass.
2. `./scripts/bundle.sh` — regenerates `index.html`, dc-sync clean.
3. `node scripts/sim/test-pending-draw.mjs` (bundle) — all pass.
4. `node scripts/sim/test-guard.mjs && node scripts/sim/test-reshuffle.mjs && node scripts/sim/test-debug-dialog.mjs && node scripts/sim/test-cover-draw.mjs` — all pass.
5. `node scripts/sim/harness.mjs '' 300 20` — 0 violations, 0 stalls.

## Task 3 — Changelog

**Files:** `CHANGELOG.md`

Add under `[Unreleased]` → `Fixed`:

```markdown
- An unservable 7-penalty (exhausted draw pile) no longer leaves the pending winner holding an empty hand with the round unresolved (#16)
```

**Verify:** `[Unreleased]` has the entry and the file still parses as Keep a Changelog.

## Out of scope

- `botTurn()`'s mirrored `pendingWinner` branch — same shape, but a bot only
  reaches it with no playable card and `pw !== me` already covers the same-seat
  case. Leave it.
- Any change to the 7-stacking rules or to `canPlay()`.
- The originally reported symptom in #16 — not reproducible; see the
  investigation comment on the issue.
