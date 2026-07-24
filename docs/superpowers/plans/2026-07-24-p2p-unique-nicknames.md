# P2P Unique Nicknames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop two players from ending up with the same auto-picked nickname when
playing zu dritt (or with any player count) over P2P.

**Architecture:** The host is authoritative over `seats` and already receives every
guest's chosen name in the `hello` message before assigning a seat. Dedup happens
host-side, in `onGuestMsg`, at that single point — no protocol round-trip beyond
adding one boolean field to the existing `hello` message.

**Tech Stack:** Vanilla JS, single-file "Design Component" class (no framework, no
build step beyond keeping the generated bundle in sync — see Global Constraints).

## Global Constraints

- **Dual-file edit, every task.** `index.html` (repo root) is a generated bundle of
  `source/Tschau Sepp Online.dc.html` — comparing the two files shows the only
  differences are a `<script src="./version.js">` tag, one unrelated pre-existing
  drawable-pile-count fix, and an appended hub-nav overlay block. There is no
  bundler tool available in this environment to regenerate `index.html` from the
  source, so **every code change in this plan must be applied identically to both
  `source/Tschau Sepp Online.dc.html` and `index.html`** — same line content, same
  place in the class body (the two files are line-for-line identical in the
  regions this plan touches). Skipping one file leaves them silently diverged.
- **No test runner** — this repo is buildless (see `CLAUDE.md` § Tooling & Testing).
  The test gate is a documented manual in-browser P2P playtest, not automated
  tests. Every task's verification step is manual: open the file in a browser
  (`python3 -m http.server 8000` from the repo root, or open `index.html` directly)
  and check the described behavior, console open, no errors.
- **Name pool stays 12 Swiss-German funny names** — do not add, remove, or
  translate entries; only change how they're selected.
- **`custom` flag semantics** — a name only counts as "custom" (exempt from
  dedup/rename) when the player actually typed something (`myName` non-empty) AND
  they typed it themselves (`myNameCustom` true). An emptied field or an
  auto/re-rolled name is never custom.

---

### Task 1: Extract the name pool + add `uniqueFunnyName()` helper

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html:394-427`
- Modify: `index.html:395-428` (identical change, one line lower — see Global
  Constraints)

**Interfaces:**
- Produces: `this.NAME_POOL` (class field, `string[]`, the 12 funny names).
  `this.funnyName(): string` — unchanged signature, now reads from `this.NAME_POOL`.
  `this.uniqueFunnyName(existingNames: string[]): string` — new. Returns a name from
  `NAME_POOL` not present (case-insensitive, trimmed) in `existingNames`; if none
  are free, returns `funnyName() + ' ' + n` for the smallest `n >= 2` that's unique
  against `existingNames`.

Current code in both files (class field block, right after `state = {...};`):

```javascript
  tk = 0;
  caches = {};
  sndSeq = 0;
  guests = {}; // host: seatIdx -> {pc, chan}
```

And, further down, the existing `funnyName()`:

```javascript
  funnyName() {
    const N = ['Turbo-Sepp', 'Jass-Vreni', 'Schälle-Ueli', 'Eichle-Elvira', 'Under-Hund', 'Bänkli-Beni', 'Rose-Röbi', 'Schilte-Sämi', 'Chäs-Chäthi', 'Gipfeli-Gusti', 'Räbeliechtli-Res', 'Fondue-Fritzli'];
    return N[Math.floor(Math.random() * N.length)];
  }
```

- [ ] **Step 1: Add the `NAME_POOL` class field**

In **both** `source/Tschau Sepp Online.dc.html` and `index.html`, replace:

```javascript
  tk = 0;
  caches = {};
  sndSeq = 0;
  guests = {}; // host: seatIdx -> {pc, chan}
```

with:

```javascript
  tk = 0;
  caches = {};
  sndSeq = 0;
  guests = {}; // host: seatIdx -> {pc, chan}
  NAME_POOL = ['Turbo-Sepp', 'Jass-Vreni', 'Schälle-Ueli', 'Eichle-Elvira', 'Under-Hund', 'Bänkli-Beni', 'Rose-Röbi', 'Schilte-Sämi', 'Chäs-Chäthi', 'Gipfeli-Gusti', 'Räbeliechtli-Res', 'Fondue-Fritzli'];
```

- [ ] **Step 2: Rewrite `funnyName()` to use the pool, and add `uniqueFunnyName()`**

In **both** files, replace:

```javascript
  funnyName() {
    const N = ['Turbo-Sepp', 'Jass-Vreni', 'Schälle-Ueli', 'Eichle-Elvira', 'Under-Hund', 'Bänkli-Beni', 'Rose-Röbi', 'Schilte-Sämi', 'Chäs-Chäthi', 'Gipfeli-Gusti', 'Räbeliechtli-Res', 'Fondue-Fritzli'];
    return N[Math.floor(Math.random() * N.length)];
  }
```

with:

```javascript
  funnyName() {
    return this.NAME_POOL[Math.floor(Math.random() * this.NAME_POOL.length)];
  }
  uniqueFunnyName(existingNames) {
    const taken = new Set((existingNames || []).map(n => (n || '').trim().toLowerCase()));
    const free = this.NAME_POOL.filter(n => !taken.has(n.toLowerCase()));
    if (free.length) return free[Math.floor(Math.random() * free.length)];
    const base = this.funnyName();
    let n = 2;
    while (taken.has((base + ' ' + n).toLowerCase())) n++;
    return base + ' ' + n;
  }
```

- [ ] **Step 3: Manual verification**

Open `index.html` in a browser (`python3 -m http.server 8000`, then
`http://localhost:8000`). Open the browser console. Confirm:
- No console errors on load.
- The menu's "random name" button (see Task 2) still fills in a name from the
  pool as before — `funnyName()`'s behavior is unchanged from a player's
  perspective.

- [ ] **Step 4: Commit**

```bash
git add "source/Tschau Sepp Online.dc.html" index.html
git commit -m "refactor: extract NAME_POOL, add uniqueFunnyName() helper"
```

---

### Task 2: Track whether the player's name was typed on purpose

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html:384` (state init), `:1606-1607` (UI
  bindings — line numbers as of Task 1's edit; search for `myName: ''` and
  `randomName:` if they've shifted)
- Modify: `index.html` (identical change, one line lower)

**Interfaces:**
- Consumes: nothing new.
- Produces: `this.state.myNameCustom` (`boolean`) — `true` only when the player
  edited the name field themselves; read by Task 3.

Current code (state initializer):

```javascript
  state = {
    phase: 'menu', // menu | play | wish | roundEnd
    mode: 'bot', // bot | host | guest
    difficulty: 'gwieft',
    myName: '',
```

Current code (UI bindings, in the render-props object):

```javascript
      myName: s.myName,
      setName: (e) => this.setState({ myName: e.target.value }),
      randomName: () => this.setState({ myName: this.funnyName() }),
```

- [ ] **Step 1: Add `myNameCustom` to initial state**

In **both** files, replace:

```javascript
  state = {
    phase: 'menu', // menu | play | wish | roundEnd
    mode: 'bot', // bot | host | guest
    difficulty: 'gwieft',
    myName: '',
```

with:

```javascript
  state = {
    phase: 'menu', // menu | play | wish | roundEnd
    mode: 'bot', // bot | host | guest
    difficulty: 'gwieft',
    myName: '',
    myNameCustom: false,
```

- [ ] **Step 2: Set the flag on manual edit and clear it on re-roll**

In **both** files, replace:

```javascript
      myName: s.myName,
      setName: (e) => this.setState({ myName: e.target.value }),
      randomName: () => this.setState({ myName: this.funnyName() }),
```

with:

```javascript
      myName: s.myName,
      setName: (e) => this.setState({ myName: e.target.value, myNameCustom: true }),
      randomName: () => this.setState({ myName: this.funnyName(), myNameCustom: false }),
```

- [ ] **Step 3: Manual verification**

In the browser (menu → "Online spiele" / multiplayer entry point that shows the
name field):
- Type a custom name into the field → no visible change (this flag isn't shown in
  UI yet), but confirm typing still works normally.
- Click the "random name" button → confirm it still fills in a pool name and the
  field is editable afterward.
- No console errors.

- [ ] **Step 4: Commit**

```bash
git add "source/Tschau Sepp Online.dc.html" index.html
git commit -m "feat: track whether player's name was manually typed"
```

---

### Task 3: Dedup nicknames on the host when a guest joins

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` (guest-side `hello` send, host-side
  `onGuestMsg`)
- Modify: `index.html` (identical change, one line lower)

**Interfaces:**
- Consumes: `this.uniqueFunnyName(existingNames)` from Task 1,
  `this.state.myNameCustom` from Task 2.
- Produces: `hello` message now carries `custom: boolean`. Seats assigned by the
  host are guaranteed unique among auto-picked names.

Current code (guest sends `hello` on data-channel open):

```javascript
        ch.onopen = () => {
          this.send({ t: 'hello', name: (this.state.myName || this.funnyName()).slice(0, 18) });
          this.snd('tschau');
          this.setState({ mode: 'guest', mp: { stage: 'guest-wait', lobby: null } });
        };
```

Current code (host handles `hello` in `onGuestMsg`):

```javascript
  onGuestMsg(ch, d) {
    if (d.t === 'hello') {
      if (ch._seat != null) return;
      const idx = this.state.seats.length;
      if (idx >= 4 || this.state.phase !== 'menu') { try { ch.send(JSON.stringify({ t: 'full' })); } catch (e) { } return; }
      ch._seat = idx;
      this.guests[idx] = { chan: ch, pc: this.pendingPc };
      this.pendingPc = null;
      ch.onclose = () => this.guestGone(ch._seat);
      const seats = this.state.seats.concat([{ name: (d.name || 'Gascht').slice(0, 18), kind: 'remote', hand: [], said: false, status: 'ok', score: 0, rounds: 0 }]);
      this.snd('tschau');
      this.setState({ seats, mp: { stage: 'host-lobby', myCode: '', expiresAt: null } });
      this.sendLobby();
      return;
    }
```

- [ ] **Step 1: Send the `custom` flag with `hello`**

In **both** files, replace:

```javascript
        ch.onopen = () => {
          this.send({ t: 'hello', name: (this.state.myName || this.funnyName()).slice(0, 18) });
          this.snd('tschau');
          this.setState({ mode: 'guest', mp: { stage: 'guest-wait', lobby: null } });
        };
```

with:

```javascript
        ch.onopen = () => {
          const isCustom = !!(this.state.myName && this.state.myNameCustom);
          this.send({ t: 'hello', name: (this.state.myName || this.funnyName()).slice(0, 18), custom: isCustom });
          this.snd('tschau');
          this.setState({ mode: 'guest', mp: { stage: 'guest-wait', lobby: null } });
        };
```

- [ ] **Step 2: Dedup on the host before assigning the seat**

In **both** files, replace:

```javascript
      ch._seat = idx;
      this.guests[idx] = { chan: ch, pc: this.pendingPc };
      this.pendingPc = null;
      ch.onclose = () => this.guestGone(ch._seat);
      const seats = this.state.seats.concat([{ name: (d.name || 'Gascht').slice(0, 18), kind: 'remote', hand: [], said: false, status: 'ok', score: 0, rounds: 0 }]);
      this.snd('tschau');
      this.setState({ seats, mp: { stage: 'host-lobby', myCode: '', expiresAt: null } });
      this.sendLobby();
      return;
    }
```

with:

```javascript
      ch._seat = idx;
      this.guests[idx] = { chan: ch, pc: this.pendingPc };
      this.pendingPc = null;
      ch.onclose = () => this.guestGone(ch._seat);
      const existingNames = this.state.seats.map(x => x.name);
      const incomingName = (d.name || 'Gascht').slice(0, 18);
      const collides = existingNames.some(n => n.trim().toLowerCase() === incomingName.trim().toLowerCase());
      const name = (collides && !d.custom) ? this.uniqueFunnyName(existingNames) : incomingName;
      const seats = this.state.seats.concat([{ name, kind: 'remote', hand: [], said: false, status: 'ok', score: 0, rounds: 0 }]);
      this.snd('tschau');
      this.setState({ seats, mp: { stage: 'host-lobby', myCode: '', expiresAt: null } });
      this.sendLobby();
      return;
    }
```

- [ ] **Step 3: Manual P2P verification (3 clients)**

Open `index.html` in 3 separate browser tabs/windows (or 2 tabs + your phone, per
the app's existing P2P join flow: host creates a code in tab A, tabs B and C join
using it).

- In tabs B and C, leave the name field blank (or click "random name" a few times
  to force a collision — the 12-name pool makes this easy to hit within a handful
  of tries) → after both join the host's lobby, confirm all three lobby entries
  (host + 2 guests) show **distinct** names. Repeat the join a few times if the
  first attempt didn't happen to collide, to confirm the dedup path is actually
  exercised.
- In tab B, manually type a name that matches the host's current name exactly,
  and join → confirm the lobby shows the **duplicate, unmodified** name (custom
  names are respected even on collision).
- Console stays clean (no errors) throughout in all three tabs.
- Play a full round to confirm nothing else in the seat/lobby flow broke.

- [ ] **Step 4: Commit**

```bash
git add "source/Tschau Sepp Online.dc.html" index.html
git commit -m "fix: dedup auto-picked P2P nicknames on join (#4)"
```

---

### Task 4: Version bump, changelog, release

**Files:**
- Modify: `version.js`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing.
- Produces: released `v0.1.1` tag; `window.GAME_VERSION` matches.

Current `version.js`:

```javascript
// version.js — display mirror of the authoritative git tag vX.Y.Z.
// Bump this to match the tag at release time (see CHANGELOG.md / release flow).
window.GAME_VERSION = "0.1.0";
```

Current `CHANGELOG.md` head:

```markdown
# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com) and
[Semantic Versioning](https://semver.org).

## [Unreleased]

## [0.1.0] - 2026-07-18
```

- [ ] **Step 1: Bump `version.js`**

Replace:

```javascript
window.GAME_VERSION = "0.1.0";
```

with:

```javascript
window.GAME_VERSION = "0.1.1";
```

- [ ] **Step 2: Add the changelog entry**

Replace:

```markdown
## [Unreleased]

## [0.1.0] - 2026-07-18
```

with:

```markdown
## [Unreleased]

## [0.1.1] - 2026-07-24

### Fixed

- P2P: two players could end up with the same auto-picked nickname when
  joining a session (e.g. playing zu dritt). The host now assigns a unique
  pool name on collision; manually typed names are left untouched. (#4)

## [0.1.0] - 2026-07-18
```

- [ ] **Step 3: Commit, tag, and push**

```bash
git add version.js CHANGELOG.md
git commit -m "chore(release): v0.1.1"
git tag v0.1.1
git push && git push --tags
```

- [ ] **Step 4: Final manual verification**

Reload `index.html` from the pushed `main` (or served locally) and confirm the
version badge in the bottom-right nav now reads `v0.1.1` and links to the
changelog. Re-run the 3-client P2P check from Task 3 Step 3 once more against
this final state.
