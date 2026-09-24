# Gmüetlich Bare-Ass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `gmuetlich` bot must stop playing an Ass it cannot then cover — the one move that is not weak play but self-harm.

**Architecture:** The Ass-safety predicate that `gwieft` already applies is extracted into a query method, `aceIsSafe(c, hand)`, and the `gmuetlich` branch of `botPick()` filters its random choice through it. `gmuetlich` keeps picking at random — only the self-destructive option leaves the set.

**Tech Stack:** Vanilla JS inside a dc-tool bundle (`source/Tschau Sepp Online.dc.html` → `index.html`), Node sim harness under `scripts/sim/` — no framework, no build step.

**Spec:** [2026-09-23-oversized-hand-design.md](../specs/2026-09-23-oversized-hand-design.md)

## Global Constraints

- **Edit `source/Tschau Sepp Online.dc.html`, then run `scripts/bundle.sh`.** Never hand-edit the dc block in `index.html`; the pre-commit hook and CI both run `scripts/check-dc-sync.sh`.
- **The sim tests read `index.html`, not `source/`.** Run `scripts/bundle.sh` before every test run, or the test measures the pre-edit bundle. Every sim test takes an alternate bundle path as `argv[2]`.
- JS-only change — no `{{ binding }}` or `<x-dc>` markup, so no double hand-edit.
- TDD: the failing test comes first and must fail for the stated reason.
- **Scope is the `gmuetlich` half of #36 only.** The oversized-hand report is deferred pending a debug-mode journal — do not attempt a fix for it, do not cap the cover draw, and do not short-circuit `drawUntilCover()` (the spec records why that idea was wrong).
- **Do not close #36.** The commit says `Refs #36`, never `Closes`.
- Swiss-German comments, matching the surrounding code.
- `CHANGELOG.md` is hand-curated English prose, one line per entry — never run `git cliff`.

---

### Task 1: Failing test for the bare Ass

**Files:**
- Create: `scripts/sim/test-bot-ace.mjs`

**Interfaces:**
- Consumes: the `text/x-dc` script block of `index.html` against a stub `DCLogic`, following `scripts/sim/test-guard.mjs`.
- Produces: nothing later tasks depend on.

The position is pinned by hand rather than dealt, and `botPick()` is called directly 200 times, because the defect is a probability — a single call proves nothing either way.

- [ ] **Step 1: Write the failing test**

```javascript
// Tests: au en gmüetliche Bot spielt kei bluttes Ass, wo er nachhär nöd cha
// decke (#36). Zuefällig spiele isch schwach — s eigne Ass nöd decke chöne
// isch nöd schwach, das isch e Selbstschädigung.
import fs from 'node:fs';
const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const src = fs.readFileSync(INDEX, 'utf8').match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
let now = 0, seq = 0, timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), i: seq++, fn }); return seq; };
globalThis.setInterval = () => 0;
globalThis.clearTimeout = () => {};
function drain(limit = 400) { let n = 0; while (timers.length && n++ < limit) { timers.sort((a,b)=>a.at-b.at||a.i-b.i); const t = timers.shift(); now = t.at; t.fn(); } }
globalThis.window = { innerHeight: 900, innerWidth: 1400, addEventListener() {}, removeEventListener() {} };
globalThis.document = { addEventListener() {}, removeEventListener() {} };
class DCLogic { constructor(p){this.props=p||{};this.state={};} setState(u,cb){const p=typeof u==='function'?u(this.state):u;this.state={...this.state,...p};cb&&cb();} forceUpdate(){} }
const Component = new Function('DCLogic','StreamableLogic','React', src + '\n;return Component;')(DCLogic, DCLogic, {});

let failed = false;
function check(name, cond, detail) { if (cond) { console.log('PASS ' + name); return; } failed = true; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }

const TOP = { id: 900, suit: 'rose', rank: '6' };
const ACE = { id: 910, suit: 'rose', rank: 'A' };        // spielbar: Farb rose
const SAFE = { id: 911, suit: 'schilte', rank: '6' };     // spielbar: Rang 6, deckt s Ass aber NÖD
const COVER = { id: 912, suit: 'rose', rank: '9' };       // rose -> würd s Ass decke

function seatAt(difficulty, hand) {
  timers = [];
  const c = new Component({ startcharte: '5' });
  c.state = { ...c.state, sound: false, mode: 'bot', difficulty, mySeat: 0, roundNum: 1, starter: 0,
    seats: [ { name: 'Du', kind: 'human', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
             { name: 'Bot', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 } ] };
  c.startRound(); drain(); timers = [];
  c.setState({ phase: 'play', turn: 1, cover: null, wish: null, pending7: 0, hasDrawn: false,
    discard: [TOP], pile: [{ id: 800, suit: 'eichle', rank: '7' }],
    seats: c.state.seats.map((x, i) => i === 1 ? { ...x, hand: hand.slice() } : { ...x, hand: [{ id: 950, suit: 'eichle', rank: '9' }] }) });
  return c;
}
function picks(c, n) {
  const cand = c.state.seats[1].hand.filter(x => c.canPlay(x));
  const out = { cand: cand.length, ace: 0 };
  for (let i = 0; i < n; i++) if (c.botPick(cand).id === ACE.id) out.ace++;
  return out;
}

{
  // 1) Gmüetlich: s Ass isch spielbar, aber unsicher — und es git e Alternative.
  const c = seatAt('gmuetlich', [ACE, SAFE]);
  const r = picks(c, 200);
  check('both cards are legal here', r.cand === 2, 'cand=' + r.cand);
  check('gmuetlich never plays the unsafe Ass', r.ace === 0, r.ace + '/200 picks were the Ass');
}

{
  // 2) Gmüetlich: s Ass isch sicher (e rose Charte blibt i dr Hand) — denn
  //    darf er's spiele, s isch jo kei Problem.
  const c = seatAt('gmuetlich', [ACE, COVER]);
  const r = picks(c, 200);
  check('a safe Ass is still on the table for gmuetlich', r.ace > 0, r.ace + '/200');
}

{
  // 3) Gmüetlich: s Ass isch s einzig Legali — de spielt er's natürli.
  const c = seatAt('gmuetlich', [ACE, { id: 913, suit: 'schilte', rank: 'K' }]);
  const r = picks(c, 50);
  check('gmuetlich plays an Ass with no alternative', r.cand === 1 && r.ace === 50,
    'cand=' + r.cand + ' ace=' + r.ace);
}

{
  // 4) Gwieft blibt unveränderet: dä het d Sperr scho vorhär gha.
  const c = seatAt('gwieft', [ACE, SAFE]);
  const r = picks(c, 50);
  check('gwieft still refuses the unsafe Ass', r.ace === 0, r.ace + '/50');
  const c2 = seatAt('gwieft', [ACE, { id: 914, suit: 'schilte', rank: 'K' }]);
  const r2 = picks(c2, 50);
  check('gwieft still plays a forced Ass', r2.cand === 1 && r2.ace === 50, 'cand=' + r2.cand + ' ace=' + r2.ace);
}

process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails, and fails for the right reason**

Run: `node scripts/sim/test-bot-ace.mjs`

Expected: exit 1 with exactly one FAIL —

```text
FAIL gmuetlich never plays the unsafe Ass: 97/200 picks were the Ass
```

The count is random and will not be exactly 97; anything near half of 200 is the defect. **If any other case fails, stop** — the other five describe behaviour that is already correct, so a failure there means the position is not what the test assumes and the fix would be aimed at the wrong thing.

- [ ] **Step 3: Commit the failing test**

```bash
git add scripts/sim/test-bot-ace.mjs
git commit -m "test(bot): cover the gmuetlich bare-Ass pick

Refs #36"
```

---

### Task 2: Extract the predicate and apply it to `gmuetlich`

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` (new method above `botPick` `:1467`, the `gmuetlich` branch `:1470`, the `safe` filter `:1475`)
- Regenerate: `index.html` via `scripts/bundle.sh`
- Test: `scripts/sim/test-bot-ace.mjs` (from Task 1)

**Interfaces:**
- Produces: `aceIsSafe(c, hand)` → `boolean` — true for every non-Ass, and for an Ass when `hand` holds another card that would cover it (another Ass, an Under, or the same suit). Both branches of `botPick()` call it; nothing else does.

- [ ] **Step 1: Extract the predicate**

Immediately above `botPick(cand) {`, insert:

```javascript
  // Query: blibt nach dere Charte e Deckig i dr Hand? Für alles usser eme Ass
  // isch d Frag gegenstandslos — nume es Ass muess mer sälber decke.
  aceIsSafe(c, hand) {
    if (c.rank !== 'A') return true;
    return hand.some(o => o.id !== c.id && (o.rank === 'A' || o.rank === 'U' || o.suit === c.suit));
  }

```

- [ ] **Step 2: Route `gmuetlich`'s random pick through it**

Change:

```javascript
    if (this.seatDifficulty(me) === 'gmuetlich') return cand[Math.floor(Math.random() * cand.length)];
```

to:

```javascript
    if (this.seatDifficulty(me) === 'gmuetlich') {
      // Zuefällig — aber nöd sältbstmörderisch: es Ass wo mer nachhär nöd cha
      // decke, isch au für e gmüetliche Bot kei Zug (#36).
      const ok = cand.filter(c => this.aceIsSafe(c, hand));
      const pool = ok.length ? ok : cand;
      return pool[Math.floor(Math.random() * pool.length)];
    }
```

The fallback matters: when every legal card is an unsafe Ass, the bot still has to play one. `ok.length ? ok : cand` is the same shape `gwieft` uses two lines further down (`if (safe.length) pool = safe;`).

Note this filters `cand`, not `pool`. `pool` carries `gwieft`'s preference for keeping Unders back, which is a *strength* heuristic — `gmuetlich` is not supposed to have it, and this change must not give it one.

- [ ] **Step 3: Use the extracted predicate in `gwieft`'s filter too**

Change:

```javascript
    const safe = pool.filter(c => c.rank !== 'A' || hand.some(o => o.id !== c.id && (o.rank === 'A' || o.rank === 'U' || o.suit === c.suit)));
```

to:

```javascript
    const safe = pool.filter(c => this.aceIsSafe(c, hand));
```

Behaviour is identical — this is the same expression, named. Case 4 of the test is the guard that it stayed identical.

- [ ] **Step 4: Re-bundle and run the test**

```bash
scripts/bundle.sh
node scripts/sim/test-bot-ace.mjs
```

Expected: six PASS lines, exit 0.

- [ ] **Step 5: Run every other suite**

```bash
for t in scripts/sim/test-*.mjs; do echo "== $t"; node "$t" || echo "FAILED $t"; done
node scripts/sim/harness.mjs '' 500 20
scripts/check-dc-sync.sh
```

Expected: every suite exits 0; `harness.mjs` reports `"violations": 0` and `"stalls": 0`; the bundle is in sync. `test-advice.mjs` is the one to watch — it exercises the coach, which shares `botPick`'s reasoning.

- [ ] **Step 6: Commit**

```bash
git add source/ index.html
git commit -m "fix(bot): stop gmuetlich playing an Ass it cannot cover

botPick refuses an Ass unless the hand holds a follow-up cover, but the
gmuetlich branch returned a random playable card before that filter ran.
Measured on a position where the Ass is legal but unsafe and a safe
alternative exists: 97 of 200 picks were the Ass.

Playing at random is what makes gmuetlich the weaker opponent; playing an
Ass it then has to draw its way out of is not weakness, it is
self-harm — and it is what grows its hand. The predicate is now shared
with gwieft as aceIsSafe(), and gmuetlich picks at random within the safe
set, falling back to the full set when every legal card is an unsafe Ass.

Refs #36"
```

---

### Task 3: Changelog, and leave the rest of #36 open

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:** none.

- [ ] **Step 1: Add the changelog entry**

Under `## [Unreleased]`, in `### Fixed` (create it if absent), one line of English prose in the file's established style:

```markdown
- The Gmüetlich bot no longer plays an Ass it cannot cover, which used to leave it drawing its way out of a hole it dug itself (#36)
```

- [ ] **Step 2: Do not close the issue**

#36 stays open for the oversized-hand half, which is deferred pending a debug-mode play journal from a real round. Comment on it instead:

> The `gmuetlich` bare-Ass half is fixed. The 34-card hand itself stays open: simulated play tops out at 17 by every driver tried, so the route to the reported state is still unexplained, and a fix aimed at a guessed route is what went wrong the first time. A debug-mode journal from a round where a hand passes ~25 would name the mechanism.

Verify afterwards that #36 is still open and still carries a label indicating it is not ready to implement.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): gmuetlich no longer plays an Ass it cannot cover

Refs #36"
```
