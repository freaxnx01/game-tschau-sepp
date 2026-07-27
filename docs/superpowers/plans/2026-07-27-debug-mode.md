# Debug Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-game debug overlay (round journal + full-deck card-location grid) so players can verify deck integrity themselves, plus a wording fix that separates "cards to draw" from "sevens chained" in the stackable-7 message.

**Architecture:** All game logic and templates live in a single `Component` class (`source/Tschau Sepp Online.dc.html`), rendered via a custom template engine (`sc-if`/`sc-for`/`{{ }}` bindings, compiled by `support.js`). New state fields (`debugLog`, `debugOpen`, `sevenChain`) drive a new modal section that follows the existing Rules-modal pattern. No new files, no build tooling, no framework.

**Tech Stack:** Vanilla JS (ES class extending `DCLogic`), inline SVG card art, no bundler.

## Global Constraints

- This repo is a **bundled dc-tool game**: `index.html` is a generated artifact. The editable source is `source/Tschau Sepp Online.dc.html`. Per CLAUDE.md: never hand-edit the generated file only — edit the source, then mirror the identical change into `index.html` (there is no automated re-bundle command in this repo; `index.html` and the source are kept in sync by applying the same edit to both, verified by diff at the end).
- Buildless stack — **no test runner exists**. Per `.ai/stacks/browser-game.md`, the test gate is a disciplined manual in-browser playtest, not automated tests. Every task ends with a manual verification checklist instead of an automated test run.
- Debug mode is solo-only (`mode === 'bot'`) — hidden/disabled in P2P (`mode === 'host' | 'guest'`).
- Swiss-German copy conventions: match existing tone/spelling (e.g. "Siebni", "Charte", "gspielt") — see existing strings in `msgText`/templates for style.
- `CHANGELOG.md` `[Unreleased]` section must be updated (Keep a Changelog format, per base instructions) — not `version.js` (that's bumped at release time only).
- Do not touch `support.js` (generated, not hand-edited) or `TODO.md`'s "Verify card integrity" line beyond noting single-player is now covered (multiplayer part stays open — out of scope here).

---

## File Structure

| File | Change |
|---|---|
| `source/Tschau Sepp Online.dc.html` | Primary edits: state fields, `playCard`/`pickWish`/`nextTurn`/`tryDraw`-equivalent logic, `msgText`, top-bar button, new modal template block, `render()` data. |
| `index.html` | Identical edits mirrored in, at the corresponding locations (files are near-duplicates; see Task 6 for the sync/diff check). |
| `CHANGELOG.md` | New `[Unreleased]` entries. |

No test files — see Global Constraints.

---

### Task 1: State fields, resets, and journal population

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` (state block ~L380-394, `startRound` ~L670-674, `resetToMenu` ~L686, disconnect-reset ~L1216, `playCard` ~L792-891, `pickWish` ~L910)
- Modify: `index.html` (same locations, offset by the existing 1-line `version.js` diff — match by surrounding text, not line number)

**Interfaces:**
- Produces: `state.debugLog` — array of `{ seat: number, suit: string, rank: string, effect: string }`, newest last, unbounded, reset to `[]` every round/menu-reset.
- Produces: `state.debugOpen` — boolean, modal visibility (default `false`).

- [ ] **Step 1: Add new state fields**

In the `state = { ... }` block, add `debugLog` next to `history`, and `debugOpen` next to `rules`:

```js
  state = {
    // ...unchanged...
    sound: true, rules: false, debugOpen: false, tip: null, hintId: null,
    roundEnd: null, bubble: null, history: [], debugLog: [], drawToast: null,
    // ...unchanged...
  };
```

- [ ] **Step 2: Reset `debugLog` everywhere `history: []` is reset**

There are 3 more reset sites beyond the initial state block. Add `debugLog: []` immediately after each `history: []`:

```js
// startRound() patch:
hasDrawn: false, drawToast: null, bubble: null, roundEnd: null, rules: false, history: [], debugLog: [], tip: null, hintId: null,
```

```js
// resetToMenu():
this.setState({ phase: 'menu', mode: 'bot', seats: [], mp: null, bubble: null, rules: false, confirmLeave: false, history: [], debugLog: [], roundEnd: null });
```

```js
// disconnect-to-menu handler:
this.setState({ phase: 'menu', mode: 'bot', seats: [], mp: { stage: 'choose', error: msg || 'D Verbindig isch verlore gange.' }, bubble: null, rules: false, confirmLeave: false, history: [], debugLog: [], roundEnd: null });
```

- [ ] **Step 3: Log every play in `playCard(who, c)`**

Right after the existing `history` line (which already runs unconditionally before any branch), add a `baseEntry` and thread `patch.debugLog` through every branch that calls `this.setState(patch)` or `this.setState(patch); return;`. The base entry:

```js
const history = s.history.concat([{ seat: who, id: c.id, suit: c.suit, rank: c.rank }]).slice(-12);
const baseEntry = { seat: who, suit: c.suit, rank: c.rank };
const patch = { seats, discard: s.discard.concat([c]), history, hasDrawn: false, cover: null, hintId: null };
```

Then set `patch.debugLog` in each branch, right before its `this.setState(patch)` call:

```js
// bare ace branch (hand.length === 0 after Ace):
patch.debugLog = s.debugLog.concat([{ ...baseEntry, effect: 'Blutt Ass — muess decke' }]);
patch.message = this.M(who, 'bareAce');
this.setState(patch);
```

```js
// ace with cards left in hand:
patch.debugLog = s.debugLog.concat([{ ...baseEntry, effect: 'Muess decke' }]);
patch.cover = who;
patch.message = this.M(who, 'coverPrompt');
this.setState(patch);
```

```js
// 8 as last card:
patch.debugLog = s.debugLog.concat([{ ...baseEntry, effect: 'Achti als letschti Charte — zieht 1, nomol dra' }]);
patch.message = this.M(who, 'eightLast');
this.setState(patch);
```

```js
// hand empty, said Tschau, rank 7 (win-with-seven, stacking continues):
patch.debugLog = s.debugLog.concat([{ ...baseEntry, effect: '+2, Stapel jetzt ' + (s.pending7 + 2) + ' (als letschti Charte)' }]);
patch.pending7 = s.pending7 + 2;
patch.sevenChain = s.sevenChain + 1;
patch.pendingWinner = who;
this.setState(patch);
```

```js
// hand empty, said Tschau, not 7 (round win):
patch.debugLog = s.debugLog.concat([{ ...baseEntry, effect: 'Sepp! Gwunne' }]);
patch.bubble = { seat: who, text: 'Sepp!' };
patch.message = this.M(who, 'sepp');
this.setState(patch);
```

```js
// hand empty, forgot Tschau:
patch.debugLog = s.debugLog.concat([{ ...baseEntry, effect: '«Tschau» vergässe — 2 Strofcharte' }]);
patch.message = this.M(who, 'forgot');
this.setState(patch);
```

```js
// Under, bot (wish known synchronously):
const w = this.botWish(hand);
patch.wish = w;
patch.debugLog = s.debugLog.concat([{ ...baseEntry, effect: 'Wunsch: ' + this.suitName(w) }]);
patch.message = this.M(who, 'wished', w);
```

```js
// Under, human (wish not known yet — logged now, updated in pickWish):
patch.phase = 'wish'; patch.wisher = who;
patch.debugLog = s.debugLog.concat([{ ...baseEntry, effect: 'Under gspielt — wartet uf Wunsch' }]);
patch.message = this.M(who, 'wishPrompt');
this.setState(patch);
return;
```

```js
// regular play (fallthrough — includes rank 7):
if (c.rank === '7') { patch.pending7 = s.pending7 + 2; patch.sevenChain = s.sevenChain + 1; }
patch.debugLog = s.debugLog.concat([{ ...baseEntry, effect: c.rank === '7' ? ('+2, Stapel jetzt ' + patch.pending7) : '' }]);
this.setState(patch);
this.after(200, () => this.nextTurn(who, c));
```

- [ ] **Step 4: Update the pending Under-wish entry once the human player picks**

In `pickWish(suit)`, after the wish is set, replace the effect text of the last `debugLog` entry (which is the "wartet uf Wunsch" one from Step 3) instead of appending a new entry:

```js
pickWish(suit) {
  const s = this.state;
  const debugLog = s.debugLog.slice();
  if (debugLog.length) debugLog[debugLog.length - 1] = { ...debugLog[debugLog.length - 1], effect: 'Wunsch: ' + this.suitName(suit) };
  // ...existing pickWish body continues, add `debugLog` to whatever patch/setState it already builds...
}
```

Read the existing `pickWish` body first (source ~L910) to see its current `setState` call and merge `debugLog` into that same patch rather than adding a second `setState` call.

- [ ] **Step 5: Manual verification**

Serve locally and play a solo round:

```bash
python3 -m http.server 8000
# open http://localhost:8000/source/Tschau%20Sepp%20Online.dc.html
```

Checklist:
- [ ] Play several cards including a 7, an Under (pick a wish), and reach a round end. No console errors.
- [ ] Start a new round — confirm (via temporarily adding `console.log(this.state.debugLog)` at the top of `render()`, then removing it) that `debugLog` resets to `[]` and accumulates one entry per play with the expected `effect` text for each branch exercised.
- [ ] Remove the temporary `console.log` before moving on.

- [ ] **Step 6: Commit**

```bash
git add "source/Tschau Sepp Online.dc.html" index.html
git commit -m "feat(debug): track per-round play journal and debug modal state"
```

---

### Task 2: Seven-chain counter + message wording fix

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` (state ~L388, `msgText` cases `'seven'`/`'drewN'` ~L469/475, call sites ~L903/1076, `tryDraw`-equivalent pending7-clear site)
- Modify: `index.html` (same locations)

**Interfaces:**
- Consumes: nothing new from Task 1 beyond the state shape already added.
- Produces: `state.sevenChain` — number, count of consecutively stacked 7s in the current pending-penalty chain; reset to `0` whenever `pending7` is cleared (drawn) or a new round starts.

- [ ] **Step 1: Add `sevenChain` to state and all reset sites**

Add `sevenChain: 0` next to every `pending7: 0` occurrence found via `grep -n "pending7: 0" "source/Tschau Sepp Online.dc.html"` — this includes the initial state block, `startRound`, and the pending-penalty-cleared branch (where the player actually draws the accumulated penalty).

- [ ] **Step 2: Increment `sevenChain` wherever `pending7` is incremented**

Both increment sites were already touched in Task 1 Step 3 (`patch.sevenChain = s.sevenChain + 1` alongside each `patch.pending7 = s.pending7 + 2`). Confirm both are present; this step is a verification, not new code, if Task 1 was done first.

- [ ] **Step 3: Update `msgText` to accept `{n, chain}` for `'seven'`/`'drewN'`**

```js
case 'seven': return mine ? ('Siebni! (' + x.chain + '. Siebni i Folg) Zieh ' + x.n + ' Charte — oder stack sälber e Siebni!') : ('Siebni! ' + O + ' muess ' + x.n + ' Charte zieh — oder stacke.');
```

```js
case 'drewN': return mine ? ('Du ziehsch ' + x.n + ' Charte' + (x.chain > 1 ? ' (' + x.chain + ' Siebni gstapled)' : '') + '.') : (O + ' zieht ' + (x.n > 1 ? x.n + ' Charte.' : 'e Charte.'));
```

- [ ] **Step 4: Update the two call sites to pass the new shape**

```js
// nextTurn(), replacing: msg = this.M(nxt, 'seven', s.pending7);
if (s.pending7 > 0) msg = this.M(nxt, 'seven', { n: s.pending7, chain: s.sevenChain });
```

```js
// pending-penalty-drawn branch, replacing: message: this.M(me, 'drewN', s.pending7)
this.setState({ pending7: 0, sevenChain: 0, pendingWinner: null, message: this.M(me, 'drewN', { n: s.pending7, chain: s.sevenChain }) });
```

- [ ] **Step 5: Manual verification**

```bash
python3 -m http.server 8000
```

Checklist:
- [ ] Start a solo round, force a 7-chain by playing/drawing until you can stack 2-3 sevens in a row (bot difficulty `gwieft` stacks aggressively — easiest to test).
- [ ] Confirm the on-screen message reads e.g. "Siebni! (2. Siebni i Folg) Zieh 4 Charte…" and the number in "i Folg" matches the actual count of sevens played, not the draw count.
- [ ] Let the penalty resolve (draw) and confirm the message clears correctly and `sevenChain` doesn't leak into the next chain (play a fresh, unrelated 7 afterward and confirm it starts counting from 1 again).

- [ ] **Step 6: Commit**

```bash
git add "source/Tschau Sepp Online.dc.html" index.html
git commit -m "fix(messages): show seven-chain count alongside draw-penalty count"
```

---

### Task 3: Debug button + modal shell (tab switching, no content yet)

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` (top bar template ~L48-49, new modal block after the Rules modal ~L369, `render()` data block ~L1592-1694)
- Modify: `index.html` (same locations)

**Interfaces:**
- Consumes: `state.debugOpen` (Task 1).
- Produces: `showDebug`, `debugTab` ('journal' | 'cards'), `openDebug`, `closeDebug`, `setDebugTab(tab)` — template bindings other tasks' render blocks plug into.

- [ ] **Step 1: Add the "Debug" button next to "Regle", gated to solo mode**

```html
<sc-if value="{{ showDebugBtn }}" hint-placeholder-val="{{ false }}">
  <button onClick="{{ openDebug }}" style="font-family: inherit; font-size: 15px; font-weight: 700; color: #f3ead2; background: linear-gradient(180deg, #8a5f38, #6b4426); border: 1px solid #3a2512; border-radius: 8px; padding: 7px 14px; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.4);" style-hover="filter: brightness(1.15);">Debug</button>
</sc-if>
```

Place this immediately after the existing "Regle" button (before the sound-toggle button), inside the same top-bar button group.

- [ ] **Step 2: Add the modal shell after the Rules modal block**

```html
<!-- ================= DEBUG ================= -->
<sc-if value="{{ showDebug }}" hint-placeholder-val="{{ false }}">
  <div data-screen-label="Debug" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15,20,12,0.5); z-index: 70;">
    <div style="background: linear-gradient(180deg, #f6efdc, #ede1c2); border: 3px solid #b8923a; box-shadow: 0 0 0 6px #3a2818, 0 20px 50px rgba(0,0,0,0.6); border-radius: 20px; padding: 28px 36px; max-width: 720px; max-height: 80vh; overflow-y: auto; animation: popIn 0.3s;">
      <div style="font-size: 26px; font-weight: 900; color: #7c1f26; text-align: center;">Debug</div>
      <div style="display: flex; gap: 10px; justify-content: center; margin-top: 14px;">
        <button onClick="{{ showJournalTab }}" style="font-family: inherit; font-size: 15px; font-weight: 700; color: {{ journalTabColor }}; background: #fdf8ea; border: 2px solid #b8923a; border-radius: 10px; padding: 8px 18px; cursor: pointer;">Journal</button>
        <button onClick="{{ showCardsTab }}" style="font-family: inherit; font-size: 15px; font-weight: 700; color: {{ cardsTabColor }}; background: #fdf8ea; border: 2px solid #b8923a; border-radius: 10px; padding: 8px 18px; cursor: pointer;">Charte</button>
      </div>
      <!-- Journal and Cards content added in Tasks 4 and 5 -->
      <div style="text-align: center; margin-top: 22px;">
        <button onClick="{{ closeDebug }}" style="font-family: inherit; font-size: 18px; font-weight: 800; color: #f6efd9; background: linear-gradient(180deg, #8a5f38, #6b4426); border: 2px solid #3a2512; border-radius: 12px; padding: 10px 34px; cursor: pointer;" style-hover="filter: brightness(1.12);">Zuemache</button>
      </div>
    </div>
  </div>
</sc-if>
```

- [ ] **Step 3: Wire up render() data and handlers**

Near `showRules: s.rules,` add:

```js
showDebugBtn: s.phase !== 'menu' && s.mode === 'bot',
showDebug: s.debugOpen && s.mode === 'bot',
showJournalTab: () => this.setState({ debugTab: 'journal' }),
showCardsTab: () => this.setState({ debugTab: 'cards' }),
journalTabColor: (s.debugTab || 'journal') === 'journal' ? '#7c1f26' : '#4a3416',
cardsTabColor: (s.debugTab || 'journal') === 'cards' ? '#7c1f26' : '#4a3416',
```

Near `openRules: () => this.setState({ rules: true }),` add:

```js
openDebug: () => this.setState({ debugOpen: true, debugTab: 'journal' }),
closeDebug: () => this.setState({ debugOpen: false }),
```

Add `debugTab: 'journal'` to the initial `state = { ... }` block next to `debugOpen: false`.

- [ ] **Step 4: Manual verification**

```bash
python3 -m http.server 8000
```

Checklist:
- [ ] Start a solo game — "Debug" button appears in the top bar next to "Regle".
- [ ] Click it — modal opens with two tab buttons and a close button, no content yet, no console errors.
- [ ] Click each tab button — the active tab's label changes color (visual confirmation the state wiring works).
- [ ] Close and reopen — state persists correctly (tab resets to Journal on open).
- [ ] Start a multiplayer (host or guest) game — confirm the Debug button does **not** appear.

- [ ] **Step 5: Commit**

```bash
git add "source/Tschau Sepp Online.dc.html" index.html
git commit -m "feat(debug): add debug modal shell with journal/cards tabs"
```

---

### Task 4: Journal tab content

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` (inside the modal shell from Task 3, `render()` data)
- Modify: `index.html` (same location)

**Interfaces:**
- Consumes: `state.debugLog` (Task 1), `showJournalTab`/`journalTabColor` wiring (Task 3).
- Produces: `journalRows` — array of `{ text: string }` for template rendering.

- [ ] **Step 1: Add the journal list markup**

Insert inside the modal shell, right after the tab-button row, wrapped in an `sc-if` on the active tab:

```html
<sc-if value="{{ showJournalPanel }}" hint-placeholder-val="{{ false }}">
  <div style="margin-top: 16px; font-size: 15px; color: #3d3018; line-height: 1.6;">
    <sc-if value="{{ hasJournalRows }}" hint-placeholder-val="{{ false }}">
      <sc-for list="{{ journalRows }}" as="j" hint-placeholder-count="0">
        <div style="padding: 4px 0; border-bottom: 1px solid rgba(184,146,58,0.35);">{{ j.text }}</div>
      </sc-for>
    </sc-if>
    <sc-if value="{{ !hasJournalRows }}" hint-placeholder-val="{{ true }}">
      <div style="text-align: center; color: #8a7350; font-style: italic;">Na kei Charte gspielt disi Rundi.</div>
    </sc-if>
  </div>
</sc-if>
```

- [ ] **Step 2: Compute `journalRows` in `render()`**

```js
const journalRows = s.debugLog.map(e => {
  const who = this.nm(e.seat);
  const card = this.rankName(e.rank) + ' ' + this.suitName(e.suit);
  return { text: who + ': ' + card + (e.effect ? ' — ' + e.effect : '') };
});
```

Add to the returned data object:

```js
showJournalPanel: (s.debugTab || 'journal') === 'journal',
hasJournalRows: journalRows.length > 0,
journalRows,
```

- [ ] **Step 3: Manual verification**

```bash
python3 -m http.server 8000
```

Checklist:
- [ ] Start a solo game, open Debug — Journal tab shows "Na kei Charte gspielt disi Rundi." before any card is played.
- [ ] Play a few cards (include a 7 and an Under) — each appears as a new row in play order, seat name correct, effect text matches what was set in Task 1 (e.g. "+2, Stapel jetzt 4" for a 7, "Wunsch: Rose" for an Under once chosen).
- [ ] Start a new round — journal clears back to the empty-state message.

- [ ] **Step 4: Commit**

```bash
git add "source/Tschau Sepp Online.dc.html" index.html
git commit -m "feat(debug): render play journal in debug modal"
```

---

### Task 5: Cards tab — full-deck location grid

**Files:**
- Modify: `source/Tschau Sepp Online.dc.html` (inside the modal shell, `render()` data)
- Modify: `index.html` (same location)

**Interfaces:**
- Consumes: `state.pile`, `state.discard`, `state.seats[*].hand`, `state.mySeat`, `this.face(c)`, `this.backUri()`, `this.suitName`/`rankName` (all existing).
- Produces: `debugCards` — array of 36 `{ uri: string, dim: boolean, borderColor: string, label: string }` for the grid template.

- [ ] **Step 1: Add the grid markup**

```html
<sc-if value="{{ showCardsPanel }}" hint-placeholder-val="{{ false }}">
  <div style="display: grid; grid-template-columns: repeat(9, 1fr); gap: 6px; margin-top: 16px;">
    <sc-for list="{{ debugCards }}" as="dc" hint-placeholder-count="0">
      <div title="{{ dc.label }}" style="aspect-ratio: 2 / 3; background-image: url({{ dc.uri }}); background-size: 100% 100%; border-radius: 6px; opacity: {{ dc.op }}; border: 2px solid {{ dc.borderColor }};"></div>
    </sc-for>
  </div>
  <div style="display: flex; gap: 16px; justify-content: center; margin-top: 12px; font-size: 13px; color: #4a3416;">
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#7c1f26;margin-right:5px;"></span>Dini Hand</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#31694a;margin-right:5px;"></span>Abgleit</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#8a7350;margin-right:5px;"></span>Zugstapel / anderi Händ</span>
  </div>
</sc-if>
```

- [ ] **Step 2: Compute `debugCards` in `render()`**

```js
const allRanks = ['6', '7', '8', '9', 'B', 'U', 'O', 'K', 'A'];
const allSuits = ['rose', 'schilte', 'eichle', 'schaelle'];
const findCard = (suit, rank) => {
  const inDiscard = s.discard.find(c => c.suit === suit && c.rank === rank);
  if (inDiscard) return { card: inDiscard, loc: 'discard' };
  const myHand = (s.seats[my] ? s.seats[my].hand : []).find(c => c.suit === suit && c.rank === rank);
  if (myHand) return { card: myHand, loc: 'myHand' };
  for (let i = 0; i < s.seats.length; i++) {
    if (i === my) continue;
    const found = (s.seats[i].hand || []).find(c => c.suit === suit && c.rank === rank);
    if (found) return { card: found, loc: 'otherHand' };
  }
  const inPile = s.pile.find(c => c.suit === suit && c.rank === rank);
  if (inPile) return { card: inPile, loc: 'pile' };
  return { card: null, loc: 'unknown' };
};
const debugCards = [];
for (const suit of allSuits) {
  for (const rank of allRanks) {
    const { card, loc } = findCard(suit, rank);
    const known = card || { suit, rank };
    const uri = loc === 'discard' || loc === 'myHand' ? this.face(known) : this.backUri();
    const op = loc === 'discard' ? 0.45 : 1;
    const borderColor = loc === 'myHand' ? '#7c1f26' : loc === 'discard' ? '#31694a' : '#8a7350';
    const locLabel = { discard: 'abgleit', myHand: 'i dinere Hand', otherHand: 'i re anderne Hand', pile: 'im Zugstapel', unknown: 'nöd gfunde (!)' }[loc];
    debugCards.push({ uri, op, borderColor, label: this.rankName(rank) + ' ' + this.suitName(suit) + ' — ' + locLabel });
  }
}
```

Add to the returned data object:

```js
showCardsPanel: (s.debugTab || 'journal') === 'cards',
debugCards,
```

> **Note:** `loc === 'unknown'` should never happen in a correct deck — if a card is genuinely missing this is the strongest signal of a real duplication/loss bug, hence the explicit `(!)` label rather than silently omitting it.

- [ ] **Step 3: Manual verification**

```bash
python3 -m http.server 8000
```

Checklist:
- [ ] Start a solo game, open Debug, switch to "Charte" tab — grid of 36 cards renders, 4 columns... actually 9 columns × 4 rows, no layout overflow.
- [ ] Count the four 7-rank cells (one per suit) — confirm exactly 4 exist in the grid (sanity-checks the "8 sevens" report directly).
- [ ] Play a card from your hand — its cell switches from "your hand" border color to "discarded" (dimmed) on next Debug open.
- [ ] Hover a cell — the title tooltip shows the expected location text.
- [ ] No cell shows the "(!)" unknown-location label during normal play.

- [ ] **Step 4: Commit**

```bash
git add "source/Tschau Sepp Online.dc.html" index.html
git commit -m "feat(debug): render full-deck card-location grid in debug modal"
```

---

### Task 6: Sync check, full playtest, changelog, TODO note

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]` section)
- Verify (no further edits expected): `index.html`, `source/Tschau Sepp Online.dc.html`

**Interfaces:** None — this is an integration/verification task.

- [ ] **Step 1: Diff source vs. index.html to confirm only the known, pre-existing deltas remain**

```bash
diff <(tail -n +2 index.html) <(tail -n +2 "source/Tschau Sepp Online.dc.html")
```

Expected remaining differences are only the ones that predate this plan: the `version.js` script tag, the `drawable`/`pileStackN` computation drift, and the trailing games-hub `<nav>`/version-badge footer block in `index.html`. If any *other* difference shows up, one of the mirrored edits in Tasks 1-5 was missed or applied inconsistently — fix it before proceeding.

- [ ] **Step 2: Full manual playtest**

```bash
python3 -m http.server 8000
```

Run the existing manual-verification checklist from `.ai/stacks/browser-game.md` plus the new Debug-mode specific checks already covered task-by-task above, once more end-to-end in a single sitting:
- [ ] Page loads with an empty console.
- [ ] Full solo round playable start to finish (including at least one 7-chain, one Ace-cover, one Under-wish, one Sepp win).
- [ ] Debug modal: Journal and Cards tabs both correct throughout, resets each round.
- [ ] `localStorage` state (name, sound setting) persists across reload.

- [ ] **Step 3: Update CHANGELOG.md**

Add under `[Unreleased]`:

```markdown
### Added
- Debug mode (solo games): a "Debug" button opens a modal showing this round's play journal and a full 36-card grid of where every card currently is — lets players verify deck integrity themselves.

### Fixed
- The stackable-seven message now shows how many sevens were chained separately from how many cards must be drawn, so the draw count (2→4→6→8) can't be misread as a count of seven cards.
```

(If `[Unreleased]` doesn't exist yet at the top of the file, add it above the latest release section, following Keep a Changelog format.)

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): add debug mode and seven-chain message fix"
```
