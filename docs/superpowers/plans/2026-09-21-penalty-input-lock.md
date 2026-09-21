# Penalty Input Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a deferred penalty animation is pending, player input must not apply — a click on the draw pile must not draw an extra card, hand the turn away, or cancel an Ass-Deckig.

**Architecture:** A single `busy` state flag is set by the three branches of `playCard()` that schedule a penalty through `this.after()` while leaving the turn on the player, and cleared by the setState that ends each animation (plus `nextTurn()`, `endRound()` and `startRound()` as belt-and-braces). Every player-input entry point — `drawFor()`, `play()`, `sayTschau()`, `passTurn()` and their `onNet` counterparts — returns early while the flag is set. The flag also travels in the host→guest snapshot so a P2P guest sees the same locked table.

**Tech Stack:** Vanilla JS inside a dc-tool bundle (`source/Tschau Sepp Online.dc.html` → `index.html`), Node-based sim harness under `scripts/sim/` — no framework, no build step, no dependencies.

**Spec:** [2026-09-21-penalty-input-lock-design.md](../specs/2026-09-21-penalty-input-lock-design.md)

## Global Constraints

- **Edit `source/Tschau Sepp Online.dc.html`, then run `scripts/bundle.sh`.** Never hand-edit the dc block in `index.html`; the pre-commit hook and CI both run `scripts/check-dc-sync.sh`.
- **The sim tests read `index.html`, not `source/`.** Run `scripts/bundle.sh` before every test run, or the test measures the pre-edit bundle.
- This change is JS-only. No `{{ binding }}` or `<x-dc>` markup changes, so no double hand-edit is needed.
- TDD: the failing test comes first and must fail for the stated reason.
- Buildless stack — no dependencies, no `package.json`, no framework.
- Surgical: only the `busy` flag, its guards, the two `renderVals()` values and the two P2P snapshot fields change.
- Swiss-German comments and messages, matching the surrounding code.
- `CHANGELOG.md` is hand-curated — write user-facing prose, never run `git cliff`.

---

### Task 1: Failing regression test for the three penalty windows

**Files:**
- Create: `scripts/sim/test-penalty-lock.mjs`

**Interfaces:**
- Consumes: the `text/x-dc` script block of `index.html`, evaluated against a stub `DCLogic`, following the scaffold in `scripts/sim/test-guard.mjs`.
- Produces: `seat0With(rank, said)`, `advance(ms)` and `snapshot(c)` helpers, reused by Tasks 3 and 4 in the same file.

The test adds a virtual clock on top of the existing scaffold: `setTimeout` callbacks are queued instead of run, so a click can be injected at a chosen moment inside the animation window.

- [ ] **Step 1: Write the failing test**

```javascript
// Regression test (#32): während ere lauffende Strof-Animation darf en Iigab
// vom Spiler nöd wirke — en Klick uf de Zugstapel derf kei extra Charte zieh,
// dr Zug nöd wiitergäh und kei Ass-Deckig ufhebe.
//
// D Charte wo mir i d Hand lege isch e Dublette vo dr Farb obe uf em Ablage-
// stapel — dä Test prüeft s Timing, nöd d 36-Charte-Invariante (das macht
// harness.mjs).
import fs from 'node:fs';

// Usage: node scripts/sim/test-penalty-lock.mjs [index.html]
const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

// Virtuelli Uhr: d Timer wärded gsammlet statt usgfüehrt, so chame en Klick
// ganz gnau is Animations-Fenschter inne lege.
let now = 0;
let seq = 0;
const timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), fn, id: ++seq }); return seq; };
globalThis.setInterval = () => 0;
globalThis.clearTimeout = (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
globalThis.window = { innerHeight: 900, innerWidth: 1400 };

function advance(ms) {
  const target = now + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at || a.id - b.id);
    if (!timers.length || timers[0].at > target) break;
    const t = timers.shift();
    now = t.at;
    t.fn();
  }
  now = target;
}

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

// 2-Spiler-Rundä, dr Mänsch (Sitz 0) am Zug mit genau einere Charte i dr Hand.
function seat0With(rank, said) {
  now = 0;
  timers.length = 0;
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 0, roundNum: 1, starter: 0,
    seats: [
      { name: 'Mänsch', kind: 'human', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'Bot', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  c.startRound();
  const top = c.state.discard[c.state.discard.length - 1];
  const card = { id: 'T1', rank, suit: top.suit };
  const seats = c.state.seats.map((x, i) => i === 0 ? { ...x, hand: [card], said } : x);
  c.setState({ seats, turn: 0, phase: 'play', hasDrawn: false, pending7: 0, cover: null });
  return { c, card };
}

function snapshot(c) {
  const s = c.state;
  return { hand: s.seats[0].hand.length, turn: s.turn, cover: s.cover, hasDrawn: s.hasDrawn };
}

// Ei Mal mit eme Klick mittendrin, ei Mal ohni — beidi Läuf müend im gliche
// Zuestand ände.
function compare(label, rank, said) {
  const clicked = seat0With(rank, said);
  clicked.c.playCard(0, clicked.card);
  advance(300);
  clicked.c.drawClick();
  advance(3000);
  const got = snapshot(clicked.c);

  const baseline = seat0With(rank, said);
  baseline.c.playCard(0, baseline.card);
  advance(3000);
  const want = snapshot(baseline.c);

  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: klickt=${JSON.stringify(got)} ohni=${JSON.stringify(want)}`);
  return ok;
}

// E Rundä wo mittendrin ändet derf d Sperri nöd i di nöchschti mitnäh —
// susch isch dr Tisch für immer gsperrt.
function roundClearsTheLock() {
  const { c } = seat0With('8', true);
  c.setState({ busy: true });
  c.startRound();
  const ok = c.state.busy === false;
  console.log(`${ok ? 'PASS' : 'FAIL'} nöii Rundä löst d Sperri: busy=${c.state.busy} (erwartet false)`);
  return ok;
}

let failed = false;
if (!compare('Achti als letschti Charte', '8', true)) failed = true;
if (!compare('«Tschau» vergässe', 'K', false)) failed = true;
if (!compare('blutts Ass', 'A', true)) failed = true;
if (!roundClearsTheLock()) failed = true;

process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/sim/test-penalty-lock.mjs`

Expected: exit code 1, with all four lines FAIL — e.g. `FAIL Achti als letschti Charte: klickt={"hand":2,"turn":1,...} ohni={"hand":1,"turn":0,...}`.

- [ ] **Step 3: Commit the failing test**

```bash
git add scripts/sim/test-penalty-lock.mjs
git commit -m "test(game): cover input during a pending penalty animation

Refs #32"
```

---

### Task 2: The `busy` flag and the input guards

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` (initial state `:485-493`, `startRound` `:852-855`, `playCard` `:1081-1149`, `nextTurn` `:1180-1198`, `endRound` `:1471-1489`, `drawFor` `:1239`, `play` `:1040`, `sayTschau` `:1219`, `passTurn` `:1299`, `onNet` `:1745-1756`)
- Regenerate: `index.html` via `scripts/bundle.sh`
- Test: `scripts/sim/test-penalty-lock.mjs` (from Task 1)

**Interfaces:**
- Produces: `state.busy` — `true` while a deferred penalty animation is pending, `false` otherwise. Tasks 3 and 4 read it.

- [ ] **Step 1: Add the flag to the initial state**

In the initial state block, change:

```javascript
    hasDrawn: false,
```

to:

```javascript
    hasDrawn: false, busy: false,
```

- [ ] **Step 2: Clear the flag on every round start**

In `startRound()`, change:

```javascript
      hasDrawn: false, drawToast: null, reshuffleToast: null, bubble: null, roundEnd: null, rules: false, history: [], debugLog: [], tip: null, hintId: null,
```

to:

```javascript
      hasDrawn: false, busy: false, drawToast: null, reshuffleToast: null, bubble: null, roundEnd: null, rules: false, history: [], debugLog: [], tip: null, hintId: null,
```

- [ ] **Step 3: Set and clear the flag in the bare-Ace branch**

In `playCard()`, the `c.rank === 'A' && hand.length === 0` branch, change:

```javascript
        patch.message = this.M(who, 'bareAce');
        this.setState(patch);
        this.snd('penalty');
        this.after(900, () => {
          const r = this.drawUntilCover(who); this.snd('draw');
          this.after(300, () => {
            this.setState({ cover: who, turn: who, message: this.M(who, 'coverDrawn', r.n) });
```

to:

```javascript
        patch.message = this.M(who, 'bareAce');
        patch.busy = true;
        this.setState(patch);
        this.snd('penalty');
        this.after(900, () => {
          const r = this.drawUntilCover(who); this.snd('draw');
          this.after(300, () => {
            this.setState({ cover: who, turn: who, busy: false, message: this.M(who, 'coverDrawn', r.n) });
```

- [ ] **Step 4: Set and clear the flag in the 8-as-last-card branch**

In the same method, change:

```javascript
      patch.message = this.M(who, 'eightLast');
      this.setState(patch);
      this.snd('penalty');
      this.after(900, () => {
        this.drawCards(who, 1); this.snd('draw');
        this.after(400, () => {
          this.setState({ turn: who, message: this.M(who, 'again'), hasDrawn: false });
```

to:

```javascript
      patch.message = this.M(who, 'eightLast');
      patch.busy = true;
      this.setState(patch);
      this.snd('penalty');
      this.after(900, () => {
        this.drawCards(who, 1); this.snd('draw');
        this.after(400, () => {
          this.setState({ turn: who, message: this.M(who, 'again'), hasDrawn: false, busy: false });
```

- [ ] **Step 5: Set the flag in the forgot-Tschau branch**

In the same method, change:

```javascript
      patch.message = this.M(who, 'forgot');
      this.setState(patch);
```

(the one in the `hand.length === 0` / `'forgot'` branch, immediately above `this.after(700, () => { this.drawCards(who, 2); ...`) to:

```javascript
      patch.message = this.M(who, 'forgot');
      patch.busy = true;
      this.setState(patch);
```

This branch ends in `nextTurn()`, which clears the flag in Step 6.

- [ ] **Step 6: Clear the flag on both exits of `nextTurn()`**

In `nextTurn()`, change the `pendingWinner` early return:

```javascript
      this.setState({ pendingWinner: null, bubble: { seat: w, text: 'Sepp!' }, message: this.M(w, 'sepp') });
```

to:

```javascript
      this.setState({ pendingWinner: null, busy: false, bubble: { seat: w, text: 'Sepp!' }, message: this.M(w, 'sepp') });
```

and the normal exit:

```javascript
    this.setState({ turn: nxt, message: msg, hasDrawn: false, cover: null, hintId: null });
```

to:

```javascript
    this.setState({ turn: nxt, message: msg, hasDrawn: false, busy: false, cover: null, hintId: null });
```

- [ ] **Step 7: Clear the flag when a round ends**

In `endRound()`, change:

```javascript
    this.setState({ phase: 'roundEnd', seats, roundEnd: { winner, pts, card: topCard, cards: lastCards.length ? lastCards : (topCard ? [topCard] : []) } });
```

to:

```javascript
    this.setState({ phase: 'roundEnd', seats, busy: false, roundEnd: { winner, pts, card: topCard, cards: lastCards.length ? lastCards : (topCard ? [topCard] : []) } });
```

`after()` drops its callback when `this.tk` changes, so a branch interrupted by a round change would otherwise leave `busy` set forever. Steps 2 and 7 are that safety net.

- [ ] **Step 8: Guard `drawFor()`**

Change:

```javascript
    if (s.phase !== 'play' || s.turn !== who || s.hasDrawn) return;
```

to:

```javascript
    if (s.busy || s.phase !== 'play' || s.turn !== who || s.hasDrawn) return;
```

This is the authority point reached by both `drawClick()` and `onNet 'draw'`, so it closes the P2P path too.

- [ ] **Step 9: Guard the card-click entries**

In `play(id)`, change:

```javascript
    if (s.phase !== 'play' || s.turn !== my) return;
```

to:

```javascript
    if (s.busy || s.phase !== 'play' || s.turn !== my) return;
```

In `onNet()`, `case 'play'`, change:

```javascript
        if (s.phase !== 'play' || s.turn !== seat) return;
```

to:

```javascript
        if (s.busy || s.phase !== 'play' || s.turn !== seat) return;
```

`playCard()` itself stays unguarded — the bot and the deferred callbacks call it directly and must keep working.

- [ ] **Step 10: Guard `sayTschau()`, `passTurn()` and `onNet 'tschau'`**

In `sayTschau()`, change:

```javascript
    if (s.phase !== 'play' || !me || me.hand.length !== 1 || me.said) return;
```

to:

```javascript
    if (s.busy || s.phase !== 'play' || !me || me.hand.length !== 1 || me.said) return;
```

In `passTurn()`, change:

```javascript
    if (s.phase !== 'play' || s.turn !== s.mySeat || !s.hasDrawn) return;
```

to:

```javascript
    if (s.busy || s.phase !== 'play' || s.turn !== s.mySeat || !s.hasDrawn) return;
```

In `onNet()`, `case 'tschau'`, change:

```javascript
        if (s.phase === 'play' && s.seats[seat].hand.length === 1 && !s.seats[seat].said) {
```

to:

```javascript
        if (!s.busy && s.phase === 'play' && s.seats[seat].hand.length === 1 && !s.seats[seat].said) {
```

A swallowed input is silent — no `snd('deny')`, no message.

- [ ] **Step 11: Re-bundle and run the test**

Run:

```bash
scripts/bundle.sh
node scripts/sim/test-penalty-lock.mjs
```

Expected: `scripts/bundle.sh` reports the dc block in sync; the test prints four PASS lines and exits 0.

- [ ] **Step 12: Commit**

```bash
git add source/ index.html
git commit -m "fix(game): ignore player input while a penalty animation runs

A click on the draw pile during the deferred penalty of an 8 played as the
last card, a forgotten «Tschau» or a bare Ace passed drawFor()'s guard —
turn was still the player's and hasDrawn still false — so the click's draw
and the scheduled penalty draw both landed. The bare-Ace case also dropped
the Ass-Deckig entirely.

Closes #32"
```

---

### Task 3: Stop the locked table from inviting the click

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` (`renderVals` `:2068` and `:2077`)
- Regenerate: `index.html` via `scripts/bundle.sh`
- Test: `scripts/sim/test-penalty-lock.mjs` (extend)

**Interfaces:**
- Consumes: `state.busy` from Task 2; `seat0With()`, `advance()` from Task 1.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `scripts/sim/test-penalty-lock.mjs`, above the `process.exit(...)` line:

```javascript
// Während em Sperr-Fenschter söll dr Tisch gar nöd zum Klicke iilade.
function renderLocked() {
  const { c, card } = seat0With('8', true);
  c.playCard(0, card);
  advance(300);
  const cursor = c.renderVals().drawCursor;
  const ok = cursor === 'default';
  console.log(`${ok ? 'PASS' : 'FAIL'} Zugstapel gsperrt: drawCursor=${cursor} (erwartet default)`);
  return ok;
}

// E Hand us einere Charte ohni «Tschau» isch im Ass-Fenschter erreichbar —
// dr Knopf söll det verschwinde, nöd bloss nüt tue.
function tschauHiddenWhileBusy() {
  const { c } = seat0With('8', true);
  const seats = c.state.seats.map((x, i) => i === 0 ? { ...x, hand: [{ id: 'T2', rank: '6', suit: 'rose' }], said: false } : x);
  c.setState({ seats, phase: 'play', turn: 0, busy: true });
  const shown = c.renderVals().showTschau;
  const ok = shown === false;
  console.log(`${ok ? 'PASS' : 'FAIL'} Tschau-Knopf gsperrt: showTschau=${shown} (erwartet false)`);
  return ok;
}

if (!renderLocked()) failed = true;
if (!tschauHiddenWhileBusy()) failed = true;
```

- [ ] **Step 2: Run the test to verify the two new cases fail**

Run: `node scripts/sim/test-penalty-lock.mjs`

Expected: the four Task 1 cases still PASS; the two new lines FAIL with `drawCursor=pointer` and `showTschau=true`.

- [ ] **Step 3: Gate both values on the flag**

In `renderVals()`, change:

```javascript
      drawCursor: (myTurn && !s.hasDrawn) ? 'pointer' : 'default',
```

to:

```javascript
      drawCursor: (myTurn && !s.hasDrawn && !s.busy) ? 'pointer' : 'default',
```

and change:

```javascript
      showTschau: !spectate && s.phase === 'play' && myHand.length === 1 && !meSeat.said && meSeat.status === 'ok',
```

to:

```javascript
      showTschau: !spectate && !s.busy && s.phase === 'play' && myHand.length === 1 && !meSeat.said && meSeat.status === 'ok',
```

Both are computed values in `renderVals()`, not markup — `scripts/bundle.sh` regenerates them without the `<x-dc>` double hand-edit.

- [ ] **Step 4: Re-bundle and run the test**

Run:

```bash
scripts/bundle.sh
node scripts/sim/test-penalty-lock.mjs
```

Expected: six PASS lines, exit 0.

- [ ] **Step 5: Commit**

```bash
git add source/ index.html scripts/sim/test-penalty-lock.mjs
git commit -m "fix(ui): stop the locked table inviting a click during a penalty

Refs #32"
```

---

### Task 4: Mirror the lock to P2P guests

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` (`pushState` `:1781-1791`, `applySnap` `:1816-1821`, `drawClick` `:1290`)
- Regenerate: `index.html` via `scripts/bundle.sh`
- Test: `scripts/sim/test-penalty-lock.mjs` (extend)

**Interfaces:**
- Consumes: `state.busy` from Task 2; `seat0With()` from Task 1.
- Produces: `busy` as a field of the host→guest state snapshot.

- [ ] **Step 1: Write the failing test**

Append to `scripts/sim/test-penalty-lock.mjs`, above the `process.exit(...)` line:

```javascript
// Dr Gascht söll de glich gsperrti Tisch gseh wie dr Host.
function busyReachesTheGuest() {
  const { c } = seat0With('8', true);
  c.setState({ mode: 'host', phase: 'play', busy: true });
  const sent = [];
  c.guests = { 1: { chan: { readyState: 'open', send: (m) => sent.push(JSON.parse(m)) } } };
  c.pushState();
  const inSnap = sent.length === 1 && sent[0].busy === true;

  const guest = seat0With('8', true).c;
  guest.setState({ mode: 'guest' });
  if (sent.length) guest.applySnap(sent[0]);
  const applied = guest.state.busy === true;

  const ok = inSnap && applied;
  console.log(`${ok ? 'PASS' : 'FAIL'} busy im Snapshot: gsendet=${inSnap} aagwendet=${applied}`);
  return ok;
}

// Dr Gascht söll de Klick gar nöd erscht abschicke.
function guestDoesNotSendWhileBusy() {
  const { c } = seat0With('8', true);
  const sent = [];
  c.send = (m) => sent.push(m);
  c.setState({ mode: 'guest', phase: 'play', turn: 0, mySeat: 0, hasDrawn: false, busy: true });
  c.drawClick();
  const ok = sent.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} Gascht schickt nüt: ${sent.length} Nachricht(e) (erwartet 0)`);
  return ok;
}

if (!busyReachesTheGuest()) failed = true;
if (!guestDoesNotSendWhileBusy()) failed = true;
```

- [ ] **Step 2: Run the test to verify the two new cases fail**

Run: `node scripts/sim/test-penalty-lock.mjs`

Expected: the six earlier cases PASS; the two new lines FAIL — `gsendet=false aagwendet=false` and `1 Nachricht(e)`.

- [ ] **Step 3: Put the flag in the snapshot**

In `pushState()`, change:

```javascript
        hasDrawn: s.turn === i ? s.hasDrawn : false,
```

to:

```javascript
        hasDrawn: s.turn === i ? s.hasDrawn : false, busy: !!s.busy,
```

- [ ] **Step 4: Apply it on the guest**

In `applySnap()`, change:

```javascript
      hasDrawn: d.hasDrawn, roundNum: d.roundNum, roundEnd: d.roundEnd,
```

to:

```javascript
      hasDrawn: d.hasDrawn, busy: !!d.busy, roundNum: d.roundNum, roundEnd: d.roundEnd,
```

- [ ] **Step 5: Stop the guest sending a doomed draw**

In `drawClick()`, change:

```javascript
      if (s.phase === 'play' && s.turn === s.mySeat && !s.hasDrawn) this.send({ t: 'draw' });
```

to:

```javascript
      if (!s.busy && s.phase === 'play' && s.turn === s.mySeat && !s.hasDrawn) this.send({ t: 'draw' });
```

The host's guards from Task 2 stay the authority — a message from an unpatched guest is still dropped.

- [ ] **Step 6: Re-bundle and run the test**

Run:

```bash
scripts/bundle.sh
node scripts/sim/test-penalty-lock.mjs
```

Expected: eight PASS lines, exit 0.

- [ ] **Step 7: Commit**

```bash
git add source/ index.html scripts/sim/test-penalty-lock.mjs
git commit -m "fix(p2p): carry the penalty lock to guests in the state snapshot

Refs #32"
```

---

### Task 5: Full suite and changelog

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:** none.

- [ ] **Step 1: Verify the bundle is in sync**

Run: `scripts/check-dc-sync.sh`

Expected: exit 0, no drift reported.

- [ ] **Step 2: Run every sim suite**

Run:

```bash
node scripts/sim/test-guard.mjs
node scripts/sim/test-penalty-lock.mjs
for t in scripts/sim/test-*.mjs; do echo "== $t"; node "$t" || echo "FAILED $t"; done
node scripts/sim/harness.mjs '' 500 20
```

Expected: every suite exits 0 and `harness.mjs` reports no 36-card invariant violation across 10k rounds.

- [ ] **Step 3: Add the changelog entry**

Under `## [Unreleased]` in `CHANGELOG.md`, in a `### Fixed` section (create it if the release does not have one yet), add user-facing prose — not a commit subject:

```markdown
- Klicks uf de Zugstapel während ere Strof-Animation zellet nümme: en Achti als
  letschti Charte, es vergässnigs «Tschau» oder es bluttes Ass hät vorhär
  zwei Charte statt einere zoge — und bim Ass isch d Deckpflicht ganz verschwunde.
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): penalty animations no longer eat an extra draw

Refs #32"
```
