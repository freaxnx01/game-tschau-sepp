# Invite Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The host shares a link carrying the offer code in the URL fragment; opening it lands the guest on *Spiel biitrette* with the code already filled in, one tap from generating the answer.

**Architecture:** Three small JS additions — `joinLinkFor()` builds the URL, `readJoinLink()` consumes it at boot and clears the fragment, `copyJoinLink()` puts it on the clipboard — plus render bindings and one markup change per file. No change to `enc()`, `dec()`, the `TS1.` format, or the WebRTC flow.

**Tech Stack:** Vanilla JS in a dc-tool bundle (`source/Tschau Sepp Online.dc.html` → `index.html`), Node sim harness under `scripts/sim/`.

**Spec:** [2026-09-24-invite-link-design.md](../specs/2026-09-24-invite-link-design.md)

## Global Constraints

- **Task 3 changes `<x-dc>` markup, and `scripts/bundle.sh` does NOT sync markup.** Per `AGENT-NOTES.md` the same edit must be hand-written into **both** `source/Tschau Sepp Online.dc.html` and `index.html`, character for character. `scripts/check-dc-sync.sh` fails with a `{{ placeholder }}` mismatch if only one is done — that is the guard working, not a broken bundler. Tasks 1, 2 and 4 are JS-only and regenerate normally.
- **The sim tests read `index.html`.** Run `scripts/bundle.sh` before every test run.
- Buildless stack — no dependencies, no signalling server, no shortener, no QR.
- TDD: the failing test comes first and must fail for the stated reason.
- Swiss-German comments and UI text.
- `CHANGELOG.md` is hand-curated English prose, one line per entry.

### Deviation from the spec, already decided

The spec says the prefilled code field is **read-only**. It is **editable** here. The spec's own failure list includes a messenger mangling the URL, and a read-only field makes that unrecoverable — the guest could see a truncated code and not be able to paste a good one over it. The field is still prefilled and still marked `fromLink`; it just stays repairable.

---

### Task 1: Failing test for the link

**Files:**
- Create: `scripts/sim/test-invite-link.mjs`

**Interfaces:**
- Consumes: the `text/x-dc` block of `index.html` against a stub `DCLogic`, plus stubs for `window.location` and `window.history`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

```javascript
// Tests für de Iiladigs-Link (#41): dr Host teilt e URL mit em Offer-Code im
// Fragment, dr Gascht macht si uf und findet de Code scho iigfüegt vor.
//
// Was hier NÖD prüefbar isch: d Markup-Chnöpf sälber und de echti WebRTC-
// Handshake. S Erschte deckt check-dc-sync.sh ab, s Zweite blibt e Handprob.
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const src = fs.readFileSync(INDEX, 'utf8').match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

let now = 0, seq = 0, timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), i: seq++, fn }); return seq; };
globalThis.setInterval = () => 0;
globalThis.clearTimeout = () => {};
globalThis.clearInterval = () => {};

let replaced = [];
function stubWindow(hash) {
  replaced = [];
  globalThis.window = {
    innerHeight: 900, innerWidth: 1400,
    addEventListener() {}, removeEventListener() {},
    location: { origin: 'https://github.freaxnx01.ch', pathname: '/game-tschau-sepp/', search: '', hash },
    history: { replaceState: (a, b, url) => { replaced.push(url); globalThis.window.location.hash = ''; } },
  };
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
}

class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(update, cb) { const p = typeof update === 'function' ? update(this.state) : update; this.state = { ...this.state, ...p }; cb && cb(); }
  forceUpdate() {}
}
stubWindow('');
const Component = new Function('DCLogic', 'StreamableLogic', 'React', src + '\n;return Component;')(DCLogic, DCLogic, {});

let failed = false;
function check(name, cond, detail) { if (cond) { console.log('PASS ' + name); return; } failed = true; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
// E fählendi Methode isch e Fehlschlag, kei Absturz — susch verliert dr
// RED-Schritt sini Läsbarkeit.
function attempt(name, fn) {
  try { return fn(); }
  catch (e) { failed = true; console.log('FAIL ' + name + ': threw ' + e.message); return null; }
}

// E echte Code-Form: TS1. + Base64, wo absichtlich es '+' und es '=' din het.
const CODE = 'TS1.abc+def/ghi=';

function boot(hash) {
  stubWindow(hash);
  timers = [];
  const c = new Component({ startcharte: '5' });
  c.componentDidMount();
  return c;
}

{
  // 1) Dr Link zeigt uf die glich Sitte, mit em Code im Fragment.
  const c = boot('');
  const link = attempt('joinLinkFor', () => c.joinLinkFor(CODE));
  check('the link points at this page with a #join fragment',
    link === 'https://github.freaxnx01.ch/game-tschau-sepp/#join=' + encodeURIComponent(CODE), link);
}

{
  // 2) S '+' im Base64 darf unterwegs nöd zunere Leerschlag werde.
  const c = boot('');
  const link = attempt('joinLinkFor', () => c.joinLinkFor(CODE)) || '';
  const payload = link.split('#join=')[1] || '';
  check('the payload round-trips, + and = included', decodeURIComponent(payload) === CODE, payload);
  check('the raw + is escaped in the link', payload !== '' && !payload.includes('+'), payload);
}

{
  // 3) Mit eme Link chunt me direkt uf «Spiel biitrette», Code scho drin.
  const c = boot('#join=' + encodeURIComponent(CODE));
  const mp = c.state.mp || {};
  check('an invite link opens the join stage', mp.stage === 'join-paste', 'stage=' + mp.stage);
  check('the code is prefilled', c.peerCode === CODE, 'peerCode=' + c.peerCode);
  check('and it is marked as coming from a link', mp.fromLink === true, JSON.stringify(mp));
  check('nothing was negotiated yet', !c.pc, 'pc=' + !!c.pc);
}

{
  // 4) E kaputti Fragment fällt uf de bestehend Fehlerwäg zrugg — nöd uf en neue.
  const c = boot('#join=nonsense');
  const mp = c.state.mp || {};
  check('a malformed fragment still opens the join stage', mp.stage === 'join-paste', 'stage=' + mp.stage);
  check('and reports no error at boot', !mp.error, 'error=' + mp.error);
}

{
  // 5) S Fragment wird sofort putzt: es Neulade sott nöd nomol biitrette.
  const c = boot('#join=' + encodeURIComponent(CODE));
  check('the fragment is cleared from the address bar', replaced.length === 1,
    JSON.stringify(replaced));
  check('and the cleaned url keeps path and search', replaced[0] === '/game-tschau-sepp/',
    replaced[0]);
}

{
  // 6) Ohni Fragment blibt alles wie bisher.
  const c = boot('');
  check('no fragment means the normal menu', !c.state.mp, JSON.stringify(c.state.mp));
  check('and nothing was rewritten', replaced.length === 0, JSON.stringify(replaced));
}

process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/sim/test-invite-link.mjs`

Expected: exit 1, with ten FAIL lines and three PASS. The three that already pass are the negative cases — no fragment means no `mp` state, nothing rewritten, nothing negotiated — and they must keep passing throughout.

Note the `attempt()` helper: a missing method reports `FAIL … threw c.joinLinkFor is not a function` rather than crashing the run. If the suite aborts with a stack trace instead of printing FAIL lines, the harness is wrong, not the code.

- [ ] **Step 3: Commit**

```bash
git add scripts/sim/test-invite-link.mjs
git commit -m "test(p2p): cover the invite link and its fragment handling

Refs #41"
```

---

### Task 2: The link, the boot hook, and the bindings

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html`
- Regenerate: `index.html` via `scripts/bundle.sh`
- Test: `scripts/sim/test-invite-link.mjs`

**Interfaces:**
- Produces: `joinLinkFor(code)` → `string`; `readJoinLink()` → void; `copyJoinLink()` → void; render bindings `copyLinkLabel`, `copyJoinLink`, `mpCodeVisible`, `toggleCode`, `mpPeerCode`. Task 3's markup consumes all five.

- [ ] **Step 1: Add the three methods**

Immediately above `copyCode() {`, insert:

```javascript
  // Query: d Iiladigs-URL für dä Offer-Code — s Fragment gaht nie an Server.
  joinLinkFor(code) {
    const l = (typeof window !== 'undefined' && window.location) || {};
    return (l.origin || '') + (l.pathname || '') + '#join=' + encodeURIComponent(code || '');
  }
  // Command: es #join= im URL uufnäh, s Fragment putze und uf «biitrette» stelle.
  // Verbunde wird erscht, wenn dr Spiler sälber tippt — es Link chunt vo überall.
  readJoinLink() {
    const l = (typeof window !== 'undefined' && window.location) || {};
    const hash = l.hash || '';
    const m = hash.match(/^#join=(.+)$/);
    if (!m) return;
    let code = '';
    try { code = decodeURIComponent(m[1]); } catch (e) { code = m[1]; }
    try { window.history.replaceState(null, '', (l.pathname || '') + (l.search || '')); } catch (e) { }
    this.peerCode = code;
    this.setState({ myName: this.state.myName || this.funnyName(), mp: { stage: 'join-paste', fromLink: true, peerCode: code } });
  }
  copyJoinLink() {
    const code = this.state.mp && this.state.mp.myCode;
    if (!code) return;
    const done = () => {
      this.setState({ mp: { ...this.state.mp, copiedLink: true } });
      this.after(1600, () => { if (this.state.mp) this.setState({ mp: { ...this.state.mp, copiedLink: false } }); });
    };
    try { navigator.clipboard.writeText(this.joinLinkFor(code)).then(done, () => { }); } catch (e) { }
  }
```

Both `location` guards are load-bearing, not defensive noise: `scripts/sim/test-start-cards.mjs` stubs a `window` with no `location`, and without the guard `componentDidMount` throws and that suite dies.

- [ ] **Step 2: Read the fragment at boot**

In `componentDidMount()`, after the stored-start-cards lines, add the call:

```javascript
    const stored = this.storedStartCards();
    if (stored != null) this.setState({ startCards: stored });
    this.readJoinLink();
```

- [ ] **Step 3: Add the render bindings**

In `renderVals()`, after `copyLabel:`, insert:

```javascript
      copyLinkLabel: mp && mp.copiedLink ? 'Kopiert!' : 'Link kopiere',
      copyJoinLink: () => this.copyJoinLink(),
      mpCodeVisible: !!(mp && mp.codeVisible),
      toggleCode: () => this.setState({ mp: { ...(this.state.mp || {}), codeVisible: !(this.state.mp || {}).codeVisible } }),
      mpPeerCode: (mp && mp.peerCode) || '',
```

- [ ] **Step 4: Keep `setPeer` in step with the new binding**

Task 3 binds the join textarea's `value` to `mpPeerCode`. The field is uncontrolled today — `setPeer` writes only to `this.peerCode`, never to state — so once bound, every keystroke would be overwritten by the stale state value. Change:

```javascript
      setPeer: (e) => { this.peerCode = e.target.value; },
```

to:

```javascript
      setPeer: (e) => {
        this.peerCode = e.target.value;
        // S Feld isch jetzt an mpPeerCode bunde — ohni das würd jede Tastedruck
        // vom alte Wärt überschriebe.
        this.setState({ mp: { ...(this.state.mp || {}), peerCode: e.target.value } });
      },
```

- [ ] **Step 5: Re-bundle and run**

```bash
scripts/bundle.sh
node scripts/sim/test-invite-link.mjs
```

Expected: thirteen PASS, exit 0.

- [ ] **Step 6: Run every other suite**

```bash
for t in scripts/sim/test-*.mjs; do echo "== $t"; node "$t" || echo "FAILED $t"; done
```

Expected: all pass. `test-start-cards.mjs` is the one to watch — it is the suite whose `window` stub has no `location`.

- [ ] **Step 7: Commit**

```bash
git add source/ index.html
git commit -m "feat(p2p): build and consume a #join= invite link

The host's offer code can now travel as a link. joinLinkFor() builds
<origin><path>#join=<percent-encoded code>; readJoinLink() consumes it at
boot, clears the fragment via history.replaceState so a reload does not
re-join, and opens the join stage with the code prefilled. Nothing is
negotiated until the guest taps Biitrette.

A fragment is used rather than a query parameter so a live SDP offer never
reaches the server's logs or a Referer header. The payload is
percent-encoded because base64 contains + , which would silently become a
space if the value were ever re-parsed as a query string.

Refs #41"
```

---

### Task 3: The lobby buttons and the prefilled field

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` **and** `index.html` — the same edit, by hand, in both

**Interfaces:**
- Consumes: `copyJoinLink`, `copyLinkLabel`, `mpCodeVisible`, `toggleCode`, `mpPeerCode` from Task 2.

> **This is the task that breaks if you run `bundle.sh` and assume it did the work.** It does not sync markup. Edit `source/`, then make the identical edit in `index.html`, then let `check-dc-sync.sh` confirm.

- [ ] **Step 1: Host lobby — link first, code behind a toggle**

In **both** files, inside `<sc-if value="{{ mpShowCode }}" …>`, replace the heading, textarea and copy-button row with:

```html
              <div style="font-size: 16px; font-weight: 800; color: #4a3416; margin-top: 16px;">1 · Schick dä Link am nöchste Spieler:</div>
              <div style="display: flex; align-items: center; gap: 12px; margin-top: 6px; flex-wrap: wrap;">
                <button onClick="{{ copyJoinLink }}" style="font-family: inherit; font-size: 15px; font-weight: 700; color: #f6efd9; background: linear-gradient(180deg, #8a5f38, #6b4426); border: 1px solid #3a2512; border-radius: 8px; padding: 7px 18px; cursor: pointer;" style-hover="filter: brightness(1.15);">{{ copyLinkLabel }}</button>
                <button onClick="{{ toggleCode }}" style="font-family: inherit; font-size: 14px; font-weight: 700; color: #4a3416; background: #fdf8ea; border: 2px solid #b8923a; border-radius: 8px; padding: 6px 14px; cursor: pointer;" style-hover="filter: brightness(0.95);">Code zeige</button>
                <sc-if value="{{ showMpCountdown }}" hint-placeholder-val="{{ false }}">
                  <span style="font-size: 14px; font-weight: 800; color: #7c1f26;">Dä Code isch no {{ mpCountdown }} gültig</span>
                </sc-if>
              </div>
              <sc-if value="{{ mpCodeVisible }}" hint-placeholder-val="{{ false }}">
                <textarea readOnly="{{ true }}" value="{{ mpMyCode }}" style="width: 100%; height: 64px; margin-top: 6px; font-family: monospace; font-size: 10px; line-height: 1.3; color: #4a3416; background: #fdf8ea; border: 2px solid #b8923a; border-radius: 10px; padding: 8px 10px; resize: none; word-break: break-all;"></textarea>
                <button onClick="{{ copyCode }}" style="margin-top: 6px; font-family: inherit; font-size: 15px; font-weight: 700; color: #f6efd9; background: linear-gradient(180deg, #8a5f38, #6b4426); border: 1px solid #3a2512; border-radius: 8px; padding: 7px 18px; cursor: pointer;" style-hover="filter: brightness(1.15);">{{ copyLabel }}</button>
              </sc-if>
```

Only the `mpShowCode` block changes. The second textarea in that block — *«2 · Er schickt dir en Antwort-Code zrugg»* — and the whole `mpJoinCode` stage further down are untouched.

- [ ] **Step 2: Join stage — prefill the field**

In **both** files, in the `<sc-if value="{{ mpJoinPaste }}" …>` block, change:

```html
            <textarea onChange="{{ setPeer }}" placeholder="Code do iifüege…" style="width: 100%; height: 64px; margin-top: 6px; font-family: monospace; font-size: 10px; line-height: 1.3; color: #4a3416; background: #fdf8ea; border: 2px solid #b8923a; border-radius: 10px; padding: 8px 10px; resize: none; word-break: break-all;"></textarea>
```

to:

```html
            <textarea onChange="{{ setPeer }}" value="{{ mpPeerCode }}" placeholder="Code do iifüege…" style="width: 100%; height: 64px; margin-top: 6px; font-family: monospace; font-size: 10px; line-height: 1.3; color: #4a3416; background: #fdf8ea; border: 2px solid #b8923a; border-radius: 10px; padding: 8px 10px; resize: none; word-break: break-all;"></textarea>
```

The field stays editable on purpose — see the spec deviation above.

- [ ] **Step 3: Prove both files match**

```bash
scripts/check-dc-sync.sh
```

Expected: `✓ dc-sync: source and bundle dc blocks and template bindings are identical`.

If it reports a `{{ placeholder }}` difference, the edit landed in one file only. Do **not** run `bundle.sh` to "fix" it — that syncs the script block, not the markup, and will leave the two files disagreeing in a way the next regenerate silently reverts.

- [ ] **Step 4: Re-run the suites**

```bash
node scripts/sim/test-invite-link.mjs
for t in scripts/sim/test-*.mjs; do echo "== $t"; node "$t" || echo "FAILED $t"; done
```

Expected: all pass. The sim cannot see markup, so this proves the JS still works, and Step 3 proves the markup is consistent.

- [ ] **Step 5: Commit**

```bash
git add source/ index.html
git commit -m "feat(p2p): lobby offers the link first, code behind a toggle

Refs #41"
```

---

### Task 4: Changelog and the manual gate

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:** none.

- [ ] **Step 1: Full suite and harness**

```bash
for t in scripts/sim/test-*.mjs; do echo "== $t"; node "$t" || echo "FAILED $t"; done
node scripts/sim/harness.mjs '' 500 20
scripts/check-dc-sync.sh
```

Expected: all suites exit 0; `"violations": 0` and `"stalls": 0`; dc-sync clean.

- [ ] **Step 2: Changelog entry**

Under `## [Unreleased]`, in `### Added`:

```markdown
- Host an online game by sharing a link instead of a code: the guest opens it and the offer is already filled in, one tap from joining (#41)
```

- [ ] **Step 3: State the manual gate in the PR description**

The WebRTC handshake cannot be simulated. The PR description must list, as an outstanding **human** verification step rather than a claim:

> Two devices: host copies the link, guest opens it on the other device, taps Biitrette, sends the answer code back, game starts. Also worth one pass through a messenger that wraps long URLs.

Do not claim this was run.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): invite link for online games

Refs #41"
```
