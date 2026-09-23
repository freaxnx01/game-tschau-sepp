# Dead 7 Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Superseded in part by review of PR #34.** The rule below needs a second
> condition — the round only ends early when the pending winner is the *very next*
> seat — and `botTurn()` must stop clearing `pendingWinner` before the liveness
> check. Both are corrected in the code blocks here and in the spec; the shipped
> implementation is commit `0966f8c` on `fix/33-dead-seven-chain`.

**Goal:** After a forced 7-penalty draw by a seat that is not the pending winner, the drawer keeps the turn only if they now hold a playable 7; otherwise the round is awarded immediately, before the drawer can shed a card.

**Architecture:** One new query method, `canStackSeven(who)`, answers "can this seat play a 7 right now?". `drawFor()` uses it to decide whether the pending winner stays pending or takes the round at once (#33); `botTurn()` uses the same call so a bot that drew a 7 finally gets to play it, which is the #27 fix that never reached the bot path. No other resolution logic changes.

**Tech Stack:** Vanilla JS inside a dc-tool bundle (`source/Tschau Sepp Online.dc.html` → `index.html`), Node-based sim harness under `scripts/sim/` — no framework, no build step, no dependencies.

**Spec:** [2026-09-21-dead-seven-chain-design.md](../specs/2026-09-21-dead-seven-chain-design.md)

## Global Constraints

- **Edit `source/Tschau Sepp Online.dc.html`, then run `scripts/bundle.sh`.** Never hand-edit the dc block in `index.html`; the pre-commit hook and CI both run `scripts/check-dc-sync.sh`.
- **The sim tests read `index.html`, not `source/`.** Run `scripts/bundle.sh` before every test run, or the test measures the pre-edit bundle. Every sim test also takes an alternate bundle path as `argv[2]`.
- This change is JS-only. No `{{ binding }}` or `<x-dc>` markup changes, so no double hand-edit is needed.
- TDD: the failing test comes first and must fail for the stated reason.
- Buildless stack — no dependencies, no `package.json`, no framework.
- Surgical: only `canStackSeven()`, the `pendingWinner` branch of `drawFor()` and the `pending7` branch of `botTurn()` change. The duplicated "bubble + `endRound` after 600 ms" sequence is **not** refactored here — Task 4 records it in `TODO.md`.
- Swiss-German comments and messages, matching the surrounding code.
- `CHANGELOG.md` is hand-curated — write user-facing prose, never run `git cliff`.

---

### Task 1: Failing test for the dead chain and the bot's drawn 7

**Files:**
- Create: `scripts/sim/test-dead-chain.mjs`

**Interfaces:**
- Consumes: the `text/x-dc` script block of `index.html`, evaluated against a stub `DCLogic`. The `position({ p2hand, pile, opponent })` scaffold mirrors the one in `scripts/sim/test-drawn-seven.mjs`, with an `opponent` option so the same position can be run against a bot.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

```javascript
// Tests for a 7 chain that is provably dead (#33).
//
// Rule: after a forced 7-penalty draw by a seat that is not the pending winner,
// the drawer keeps the turn only if they now hold a playable 7. Otherwise the
// chain cannot come back and the round is awarded at once — before the drawer
// can shed a card that would lower their score.
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const src = fs.readFileSync(INDEX, 'utf8').match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

let now = 0, seq = 0, timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), i: seq++, fn }); return seq; };
globalThis.setInterval = () => 0;
globalThis.clearTimeout = () => {};
function drain(limit = 600) {
  let steps = 0;
  while (timers.length && steps++ < limit) {
    timers.sort((a, b) => a.at - b.at || a.i - b.i);
    const t = timers.shift(); now = t.at; t.fn();
  }
}
globalThis.window = { innerHeight: 900, innerWidth: 1400, addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
globalThis.document = { addEventListener() {}, removeEventListener() {} };

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

const SEVEN_LAST = { id: 700, suit: 'rose', rank: '7' };
const DRAWN_SEVEN = { id: 701, suit: 'schilte', rank: '7' };
const PLAYABLE = { id: 702, suit: 'rose', rank: '9' };   // matches the discarded 7's suit
const FILLER = { id: 703, suit: 'eichle', rank: '9' };
const DEEP = [{ id: 800, suit: 'eichle', rank: '6' }, { id: 801, suit: 'eichle', rank: 'K' }];
const KING = { id: 810, suit: 'eichle', rank: 'K' };     // unplayable on a rose 7

// Seat 0 goes out on a 7; seat 1 holds no 7 and must draw `pile`'s top two.
function position({ p2hand, pile, opponent = 'local' }) {
  timers = [];
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 1, roundNum: 1, starter: 0,
    seats: [
      { name: 'Eis', kind: 'local', hand: [], said: true, status: 'ok', score: 0, rounds: 0 },
      { name: 'Zwei', kind: opponent, hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  c.startRound(); drain(); timers = [];
  c.setState({
    phase: 'play', turn: 0, cover: null, wish: null, pending7: 0, sevenChain: 0, pendingWinner: null,
    hasDrawn: false, roundEnd: null,
    discard: [{ id: 900, suit: 'rose', rank: '6' }],
    pile: pile.slice(),
    seats: [
      { ...c.state.seats[0], kind: 'local', hand: [SEVEN_LAST], said: true },
      { ...c.state.seats[1], kind: opponent, hand: p2hand.slice() },
    ],
  });
  c.playCard(0, SEVEN_LAST); drain();
  return c;
}

{
  // 1) Mänsch zieht, käi Siebni derbi, aber öppis Spielbars: d Rundä stoht sofort.
  const c = position({ p2hand: [KING], pile: [...DEEP, PLAYABLE, FILLER] });
  c.drawFor(1); drain();
  const s = c.state;
  check('dead chain ends the round at once', !!s.roundEnd && s.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(s.roundEnd && s.roundEnd.winner) + ' phase=' + s.phase);
  check('the drawer never got to discard', s.seats[1].hand.length === 3,
    'hand=' + s.seats[1].hand.length);
  check('the full hand is scored against the drawer',
    !!s.roundEnd && s.roundEnd.pts === c.pointsOf(s.seats[1].hand),
    'pts=' + (s.roundEnd && s.roundEnd.pts) + ' hand=' + JSON.stringify(s.seats[1].hand.map(x => x.rank)));
}

{
  // 2) Mänsch zieht e Siebni: d Chetti läbt, dr Gwinner blibt pendent (#27).
  const c = position({ p2hand: [KING], pile: [...DEEP, DRAWN_SEVEN, FILLER] });
  c.drawFor(1); drain();
  const s = c.state;
  check('a drawn 7 keeps the round open', !s.roundEnd && s.phase === 'play',
    'phase=' + s.phase + ' roundEnd=' + JSON.stringify(s.roundEnd));
  const drawn = s.seats[1].hand.find(x => x.id === DRAWN_SEVEN.id);
  check('the drawn 7 is playable', !!drawn && c.canPlay(drawn));
}

{
  // 3) Bot zieht e Siebni: glich Rächt wie dr Mänsch — er darf zruggstacke.
  const c = position({ p2hand: [KING], pile: [...DEEP, DRAWN_SEVEN, FILLER], opponent: 'bot' });
  drain();
  const s = c.state;
  check('a bot that drew a 7 keeps the round open', !s.roundEnd,
    'roundEnd=' + JSON.stringify(s.roundEnd && s.roundEnd.winner));
  check('the bot stacks the 7 back at the winner', s.pending7 === 2 && s.turn === 0,
    'pending7=' + s.pending7 + ' turn=' + s.turn);
}

{
  // 4) Bot ohni Siebni: d Rundä stoht sofort — unveränderet.
  const c = position({ p2hand: [KING], pile: [...DEEP, PLAYABLE, FILLER], opponent: 'bot' });
  drain();
  const s = c.state;
  check('a bot without a 7 still concedes at once', !!s.roundEnd && s.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(s.roundEnd && s.roundEnd.winner));
}

{
  // 5) #16 darf nöd regressiere: dr Gwinner sälber zieht us eme lääre Stapel.
  const c = position({ p2hand: [KING], pile: [...DEEP, DRAWN_SEVEN, FILLER] });
  c.drawFor(1); drain();
  c.playCard(1, c.state.seats[1].hand.find(x => x.id === DRAWN_SEVEN.id)); drain();
  c.setState({ pile: [], discard: c.state.discard.slice(-1) });
  c.drawFor(0); drain();
  check('an unservable penalty still ends the round (#16)',
    !!c.state.roundEnd && c.state.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(c.state.roundEnd && c.state.roundEnd.winner));
}

process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/sim/test-dead-chain.mjs`

Expected: exit code 1 with exactly these four FAIL lines, and the other five PASS:

```text
FAIL dead chain ends the round at once: roundEnd=null phase=play
FAIL the full hand is scored against the drawer: pts=null hand=["K","9","9"]
FAIL a bot that drew a 7 keeps the round open: roundEnd=0
FAIL the bot stacks the 7 back at the winner: pending7=0 turn=1
```

If any of the five PASS lines fails instead, stop — the position no longer sets up what the test assumes, and the fix would be aimed at the wrong thing.

- [ ] **Step 3: Commit the failing test**

```bash
git add scripts/sim/test-dead-chain.mjs
git commit -m "test(game): cover a 7 chain that cannot come back

Refs #33"
```

---

### Task 2: `canStackSeven()` and the two resolution branches

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` (new method above `drawFor` `:1236`, the `pendingWinner` branch of `drawFor` `:1259-1275`, the `pending7` branch of `botTurn` `:1411-1423`)
- Regenerate: `index.html` via `scripts/bundle.sh`
- Test: `scripts/sim/test-dead-chain.mjs` (from Task 1)

**Interfaces:**
- Produces: `canStackSeven(who)` → `boolean` — true when seat `who` holds at least one 7 that `canPlay()` currently accepts. Both branches below call it; nothing else does.

- [ ] **Step 1: Add the query method**

Immediately above `drawFor(who) {`, insert:

```javascript
  // Query: het dä Sitz e Siebni, wo er jetzt grad spiele chönnt?
  canStackSeven(who) {
    const seat = this.state.seats[who];
    return !!seat && seat.hand.some(c => c.rank === '7' && this.canPlay(c));
  }

```

It reads `this.state`, not the `s` snapshot taken before the draw, so it sees the cards that were just drawn. `pending7` has already been cleared by the time it is called, so `canPlay()` judges the 7 against the discard top — the winner's own 7, which every 7 rank-matches.

- [ ] **Step 2: End the round in `drawFor()` when the chain is dead**

In `drawFor()`, inside `if (s.pendingWinner != null) {`, replace the trailing comment block:

```javascript
        // Susch blibt dr Gwinner pendent: zieh isch nöd s Glichi wie ufgäh (#27).
        // Dä wo zoge het darf jetzt no spiele — genau wie i ere normale
        // Siebni-Chetti. D Rundä stoht erscht, wenn s würklich zrugg zum
        // Gwinner chunt (siehe nextTurn).
```

with:

```javascript
        // Susch blibt dr Gwinner pendent, aber nume wenn d Chetti no läbt:
        // mit ere spielbare Siebni i dr Hand darf zruggstacket werde (#27).
        // Ohni Siebni isch d Chetti tot — d Rundä stoht sofort, bevor dä wo
        // zoge het no e Charte cha abwerfe (#33).
        if (who !== w && !this.canStackSeven(who) && this.nextOk(who) === w) {
          this.setState({ pendingWinner: null, bubble: { seat: w, text: 'Sepp!' }, message: this.M(w, 'sepp') });
          this.after(600, () => this.endRound(w));
          return;
        }
```

The `who === w` case above it (the winner drawing for themselves, #16) is untouched.

- [ ] **Step 3: Let a bot that drew a 7 play it**

In `botTurn()`, in the `!cand.length && s.pending7 > 0` branch, change:

```javascript
      if (pw != null && (pw !== me || !got.length)) {
```

to:

```javascript
      if (pw != null && (pw !== me ? (!this.canStackSeven(me) && this.nextOk(me) === pw) : !got.length)) {
```

Read as: another seat is the pending winner and this bot cannot stack → concede; or this bot *is* the winner and the pile gave it nothing → concede. A bot holding a playable 7 falls through to the existing `after(1100)` block, where `botPick()` prefers a 7 whenever an opponent holds two cards or fewer — and a card-less winner satisfies that — so the chain goes back.

- [ ] **Step 4: Re-bundle and run the test**

Run:

```bash
scripts/bundle.sh
node scripts/sim/test-dead-chain.mjs
```

Expected: nine PASS lines, exit 0.

- [ ] **Step 5: Check the #27 suite still passes**

Run: `node scripts/sim/test-drawn-seven.mjs`

Expected: all eleven PASS, exit 0. This is the guard against re-breaking #27 — if any line fails, stop and report it rather than adjusting the test.

- [ ] **Step 6: Commit**

```bash
git add source/ index.html
git commit -m "fix(game): end the round once a 7 chain provably cannot come back

A seat forced to draw on a last-card 7 kept the turn even with no 7 in
hand, so it could discard once before the round was awarded — the winner
lost those points. The bot path had the opposite bug: it conceded even
when it had just drawn a playable 7, which is the case #27 was about.
Both now turn on whether the drawer can actually stack.

Closes #33"
```

---

### Task 3: Make the #27 suite assert the new timing

**Files:**
- Modify: `scripts/sim/test-drawn-seven.mjs` (the fourth case, "Responding with a non-7 also breaks the chain")

**Interfaces:** none.

- [ ] **Step 1: Rewrite the case**

That case draws a non-7, plays it, and then asserts the winner took the round. After Task 2 the round has already ended when `playCard()` runs, so the call is a no-op and the assertion passes for the wrong reason. Replace:

```javascript
{
  // Responding with a non-7 also breaks the chain: the winner takes the round.
  const c = position({ p2hand: [KING, OBER], pile: [...DEEP, { id: 704, suit: 'rose', rank: '9' }, FILLER] });
  c.drawFor(1); drain();
  const playable = c.state.seats[1].hand.filter(x => c.canPlay(x) && x.rank !== '7');
  if (playable.length) { c.playCard(1, playable[0]); drain(); }
  check('playing a non-7 hands the round to the winner',
    !!c.state.roundEnd && c.state.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(c.state.roundEnd && c.state.roundEnd.winner));
}
```

with:

```javascript
{
  // Drawing a non-7 breaks the chain outright: the winner takes the round
  // before the drawer can play anything (#33).
  const c = position({ p2hand: [KING, OBER], pile: [...DEEP, { id: 704, suit: 'rose', rank: '9' }, FILLER] });
  c.drawFor(1); drain();
  check('a non-7 draw hands the round to the winner at once',
    !!c.state.roundEnd && c.state.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(c.state.roundEnd && c.state.roundEnd.winner));
  const playable = c.state.seats[1].hand.filter(x => c.canPlay(x) && x.rank !== '7');
  check('the drawer still holds the card it would have discarded', playable.length > 0,
    'playable=' + playable.length);
}
```

- [ ] **Step 2: Run it**

Run: `node scripts/sim/test-drawn-seven.mjs`

Expected: twelve PASS lines, exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/sim/test-drawn-seven.mjs
git commit -m "test(game): assert a non-7 draw ends the round before any discard

Refs #33"
```

---

### Task 4: Full suite, changelog, parked cleanup

**Files:**
- Modify: `CHANGELOG.md`, `TODO.md`

**Interfaces:** none.

- [ ] **Step 1: Verify the bundle is in sync**

Run: `scripts/check-dc-sync.sh`

Expected: exit 0, no drift reported.

- [ ] **Step 2: Run every sim suite**

Run:

```bash
for t in scripts/sim/test-*.mjs; do echo "== $t"; node "$t" || echo "FAILED $t"; done
node scripts/sim/harness.mjs '' 500 20
```

Expected: every suite exits 0; `harness.mjs` reports `"violations": 0` and `"stalls": 0` across 10k rounds. A non-zero `stalls` would mean the new early end left a position unresolvable — stop and report it.

- [ ] **Step 3: Add the changelog entry**

Under `## [Unreleased]` in `CHANGELOG.md`, in a `### Fixed` section (create it if absent), add user-facing prose:

```markdown
- E Rundä stoht jetzt sofort, wenn öpper uf e letschti Siebni zieh muess und
  käi Siebni übercho hät — vorhär hät er no schnäll e Charte chönne abwerfe,
  was em Gwinner Pünkt gchoschtet hät (#33)
- Bots dörfed e zogni Siebni jetzt au zruggstacke, glich wie Mänsche — vorhär
  hät dr Bot d Rundä abgäh, au wenn er grad e Siebni zoge hät
```

- [ ] **Step 4: Record the refactor discovery**

The "bubble + `Sepp!` message + `endRound(w)` after 600 ms" sequence now appears in five places (`drawFor` twice, `botTurn`, `nextTurn`, and `playCard`'s last-card win). Extracting it is out of scope here. Append to `TODO.md`:

```markdown
- [ ] Refactor: extract the repeated "Sepp! bubble + endRound after 600ms" sequence — five copies across drawFor/botTurn/nextTurn/playCard (noticed while fixing #33)
```

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md TODO.md
git commit -m "docs(changelog): a dead 7 chain ends the round at once

Refs #33"
```
