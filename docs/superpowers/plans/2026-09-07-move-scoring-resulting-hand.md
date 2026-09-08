# Plan: score the resulting hand in move advice

Issue: [#17](https://github.com/freaxnx01/game-tschau-sepp/issues/17)
Spec: [2026-09-07-move-scoring-resulting-hand-design.md](../specs/2026-09-07-move-scoring-resulting-hand-design.md)

## Goal

The "Nöd optimal" tip must stop recommending a move that strands an unplayable
remainder, by judging a move on the hand it leaves rather than on the card alone.

## Global constraints

- **Edit `source/Tschau Sepp Online.dc.html`, then run `scripts/bundle.sh`.**
  Never hand-edit the dc block in `index.html`; the pre-commit hook and CI both
  run `scripts/check-dc-sync.sh`.
- TDD: the failing test comes first and must fail for the stated reason.
- Buildless stack — no dependencies, no build step, no framework.
- `botPick()` must not change. Bot behaviour is out of scope.
- Suit keys are `rose`, `schilte`, `eichle`, **`schaelle`** (not `schelle`) —
  a wrong key silently yields `undefined` in card names.

## Task 1 — Failing test

**Files:** `scripts/sim/test-advice.mjs` (new)

**Interfaces:** exercises `advise()`, `moveScore()`, `scoreCard()`,
`strandedHand()` on `Component`. Harness scaffold follows
`scripts/sim/test-reshuffle.mjs`.

### Write the failing test

```js
// Tests for move advice scoring the hand a move LEAVES BEHIND (#17).
// See docs/superpowers/specs/2026-09-07-move-scoring-resulting-hand-design.md
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

globalThis.setTimeout = () => 0;
globalThis.setInterval = () => 0;
globalThis.window = { innerHeight: 900, innerWidth: 1400 };

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

// Two-player position with the given hand; the discard top is a Schälle 6 so
// every Schälle card and every Ass/Under is playable.
function position(hand) {
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 0,
    phase: 'play', turn: 0, cover: null, wish: null, wisher: null,
    pending7: 0, sevenChain: 0, pendingWinner: null, hasDrawn: false,
    discard: [{ id: 9, suit: 'schaelle', rank: '6' }], pile: [], history: [], debugLog: [],
    seats: [
      { name: 'Du', kind: 'local', hand: hand.slice(), said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'Bot', kind: 'bot', hand: [{ id: 10, suit: 'rose', rank: 'K' }, { id: 11, suit: 'rose', rank: '9' }], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  return c;
}

// Would tryPlay() show a tip for playing `played`?
function tipFires(c, played) {
  const s = c.state, hand = s.seats[0].hand;
  const adv = c.advise();
  return adv.card && adv.card.id !== played.id && (adv.score - c.moveScore(played, hand, s)) >= 18;
}

const ASS = { id: 1, suit: 'schaelle', rank: 'A' };
const ACHT = { id: 2, suit: 'schaelle', rank: '8' };

{
  // The reported position: playing the Ass and covering with the 8 sheds both
  // cards; playing the 8 first strands a bare Ass.
  const c = position([ASS, ACHT]);
  check('reported position: no tip when the Ass is played',
    !tipFires(c, ASS), 'advise=' + JSON.stringify(c.advise().card));
  check('reported position: the Ass is the recommended move',
    c.advise().card.id === ASS.id, 'advise=' + JSON.stringify(c.advise().card));
}

{
  // Playing the 8 must not be tipped as better either.
  const c = position([ASS, ACHT]);
  check('reported position: playing the 8 is never tipped toward the 8',
    c.advise().card.id !== ACHT.id, 'advise=' + JSON.stringify(c.advise().card));
}

{
  // The stranded-remainder rule itself.
  const c = position([ASS, ACHT]);
  check('strandedHand: a lone Ass is a dead end', c.strandedHand([ASS]) === true);
  check('strandedHand: a lone 8 is a dead end', c.strandedHand([ACHT]) === true);
  check('strandedHand: a lone ordinary card is not',
    c.strandedHand([{ id: 5, suit: 'schaelle', rank: '9' }]) === false);
  check('strandedHand: two cards are not a dead end', c.strandedHand([ASS, ACHT]) === false);
}

{
  // Control: a genuinely bad move must still be tipped, or the fix has just
  // silenced the feature.
  const UNDER = { id: 3, suit: 'rose', rank: 'U' };
  const KOENIG = { id: 4, suit: 'schaelle', rank: 'K' };
  const NUENI = { id: 5, suit: 'schaelle', rank: '9' };
  const c = position([UNDER, KOENIG, NUENI]);
  check('control: dumping the Under with an ordinary card available is still tipped',
    tipFires(c, UNDER), 'advise=' + JSON.stringify(c.advise().card));
}

process.exit(failed ? 1 : 0);
```

**Verify:** `node scripts/sim/test-advice.mjs "source/Tschau Sepp Online.dc.html"`
fails — `c.moveScore` and `c.strandedHand` are not functions, and the reported
position recommends the 8.

## Task 2 — Stranded remainder and a shared move score

**Files:** `source/Tschau Sepp Online.dc.html`, then `index.html` via `scripts/bundle.sh`.

**Interfaces:**

- `strandedHand(others) -> boolean` (new)
- `moveScore(card, hand, state) -> number` (new)
- `scoreCard(c, hand, s)` — unchanged signature, one added term
- `advise()` — unchanged signature, now scores via `moveScore()`

### Step 1 — constants

Beside the existing `static COOLDOWN_MAX`:

```js
  static SHED_BONUS = 20;       // Wert vo dere zwöite Charte, wo d Pflicht-Deckig abschmiisst
  static STRANDED_PENALTY = 25; // Abzug, wenn dr Zug e Sackgass-Hand hinderlaat
```

### Step 2 — `strandedHand()`

Directly above `scoreCard()`:

```js
  // E Restehand us nume einere Charte, wo nöd cha fertig mache (es blutts Ass
  // oder en Achti), isch e Sackgass — du muesch nachhär zwingend zieh.
  strandedHand(others) {
    return others.length === 1 && (others[0].rank === 'A' || others[0].rank === '8');
  }
```

### Step 3 — charge the remainder in `scoreCard()`

`scoreCard()` already computes `const others = hand.filter(o => o.id !== c.id);`.
Immediately before `return sc;` add:

```js
    if (this.strandedHand(others)) sc -= Component.STRANDED_PENALTY;
```

### Step 4 — `moveScore()`

After `scoreCard()`, replacing the combo logic that currently lives inline in
`tryPlay()`:

```js
  // Bewerte dr ganz Zug, nöd nur d Charte: es Ass zieht en erzwungeni Deckig
  // no sich, drum schmiisst dä Zug zwei Charte ab. D Deckig isch Pflicht — sie
  // wird nöd wie e freii Wahl bestroft, sie zellt als abgschmissni Charte.
  moveScore(c, hand, s) {
    let sc = this.scoreCard(c, hand, s);
    if (c.rank !== 'A') return sc;
    const afterHand = hand.filter(o => o.id !== c.id);
    const coverCands = afterHand.filter(o => o.rank === 'A' || o.rank === 'U' || o.suit === c.suit);
    if (!coverCands.length) return sc;
    const bestCover = coverCands.reduce((a, b) =>
      this.scoreCard(b, afterHand, s) > this.scoreCard(a, afterHand, s) ? b : a);
    const rest = afterHand.filter(o => o.id !== bestCover.id);
    sc += Component.SHED_BONUS;
    if (this.strandedHand(rest)) sc -= Component.STRANDED_PENALTY;
    return sc;
  }
```

### Step 5 — `advise()` uses it

```js
    cand.forEach(c => { const sc = this.moveScore(c, hand, s); if (sc > bestSc) { bestSc = sc; best = c; } });
```

### Step 6 — `tryPlay()` uses it

Replace the whole inline combo block — from `// Ass zieht en erzwungeni Deckig
no sich …` through the `effScore += bestCoverSc;` closing braces — with:

```js
    const effScore = this.moveScore(c, hand, s);
```

`const hand = s.seats[my].hand;` above it stays; the `let effScore` declaration
goes away with the block.

**Verify:**

1. `node scripts/sim/test-advice.mjs "source/Tschau Sepp Online.dc.html"` — all pass.
2. `./scripts/bundle.sh` — regenerates `index.html`, dc-sync clean.
3. `node scripts/sim/test-advice.mjs` (bundle) — all pass.
4. `node scripts/sim/test-guard.mjs && node scripts/sim/test-reshuffle.mjs && node scripts/sim/test-debug-dialog.mjs && node scripts/sim/test-cover-draw.mjs` — all pass.
5. `node scripts/sim/harness.mjs '' 300 20` — 0 violations, 0 stalls.
6. `grep -n "scoreCard" source/"Tschau Sepp Online.dc.html"` — reached only from
   `moveScore()` and `advise()`/`tryPlay()` via it; `botPick()` still untouched.

## Task 3 — Changelog

**Files:** `CHANGELOG.md`

Add under `[Unreleased]` → `Fixed`:

```markdown
- The "Nöd optimal" tip no longer recommends a move that strands an unplayable card, such as playing an 8 and keeping a bare Ass (#17)
```

**Verify:** `[Unreleased]` has the entry and the file still parses as Keep a Changelog.

## Out of scope

- `botPick()` and bot strength — `scoreCard()` is not on the bot's path.
- `reasonFor()`'s wording, including the 8 branch's "wärsch grad nomol dra gsi".
- Tuning `SHED_BONUS` / `STRANDED_PENALTY` beyond making the acceptance
  criteria pass, and the `>= 18` tip threshold.
