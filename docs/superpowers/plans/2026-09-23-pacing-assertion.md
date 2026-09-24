# Pacing Assertion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `test-spectator.mjs` must assert the pacing *mechanism* — the gap between table events — instead of the round's total length, which is set by the deal and flakes on roughly one CI run in ten.

**Architecture:** The test wraps `playCard`, `drawCards` and `drawUntilCover` on `Component.prototype` to record the simulated time of every table event during one spectated round, then asserts the smallest gap between consecutive events is at least 500 ms. No game code changes.

**Tech Stack:** Node sim harness under `scripts/sim/`, no dependencies, no build step.

**Spec:** [2026-09-23-pacing-assertion-design.md](../specs/2026-09-23-pacing-assertion-design.md)

## Global Constraints

- **Test-only change.** No file under `source/` is modified and `index.html` is not regenerated. `scripts/bundle.sh` is not run.
- Buildless stack — no dependencies, no `package.json`, no test framework.
- The other assertions in `test-spectator.mjs` stay exactly as they are.
- The floor is **500 ms** against a measured minimum of 700 ms. Do not tighten it to 700: the margin is what stops the test re-breaking when someone tunes a delay.
- This file's comments are English; keep them English.

---

### Task 1: Assert the gap instead of the duration

**Files:**
- Modify: `scripts/sim/test-spectator.mjs` (the final block, `:122-135`)

**Interfaces:** none; the file is a standalone script.

- [ ] **Step 1: Prove the current assertion is unsound, not merely flaky**

Build a mutant whose bot moves have no delay at all — the regression this check exists to catch:

```bash
python3 -c "
import io
t=io.open('index.html',encoding='utf-8').read()
old='this.after(delay || (900 + Math.random() * 800), () => this.botTurn());'
new='this.after(0, () => this.botTurn());'
assert t.count(old)==1
io.open('/tmp/index-nodelay.html','w',encoding='utf-8').write(t.replace(old,new))
"
ok=0; for i in $(seq 20); do node scripts/sim/test-spectator.mjs /tmp/index-nodelay.html 2>&1 | grep -q 'FAIL pacing' || ok=$((ok+1)); done; echo "old assertion passed $ok/20 against the broken build"
```

Expected: roughly **7 of 20** — the current assertion misses the regression it is named for more than a third of the time. Record the number; Step 4 repeats this and must get 0.

- [ ] **Step 2: Rewrite the block**

In `scripts/sim/test-spectator.mjs`, replace the whole final block — from the `{` on the line above `// The whole point:` through its closing `}` — with:

```javascript
{
  // The whole point: it plays itself, at watchable pace, without a human.
  //
  // Pacing is asserted as the GAP between table events, not as the round's
  // total length. A round's length is set by the deal — measured over 200
  // rounds it ranges from 12s to 201s, so a lower bound on it fails on ~8% of
  // deals for no reason connected to pacing. The gap is what maybeBot()
  // actually guarantees (900-1700ms, or an explicit 250-1400ms), and it never
  // dropped below 700ms across those same 200 rounds.
  const events = [];
  for (const m of ['playCard', 'drawCards', 'drawUntilCover']) {
    const orig = Component.prototype[m];
    Component.prototype[m] = function (...args) { events.push(now); return orig.apply(this, args); };
  }
  const c = spectate();
  drain();
  const s = c.state;
  check('the round plays itself to an end', s.phase === 'roundEnd' || !!s.roundEnd,
    'phase=' + s.phase);
  let minGap = Infinity;
  for (let i = 1; i < events.length; i++) minGap = Math.min(minGap, events[i] - events[i - 1]);
  check('pacing stays human-watchable', events.length > 1 && minGap >= 500,
    events.length + ' events, closest ' + minGap + 'ms apart');
  const all = [...s.seats.flatMap(x => x.hand), ...s.pile, ...s.discard];
  check('all 36 cards are accounted for', all.length === 36, 'total=' + all.length);
}
```

Note what does **not** change: `the round plays itself to an end` and `all 36 cards are accounted for` keep their current assertions, and `t0` disappears because nothing measures duration any more.

- [ ] **Step 3: Run it against the current build, twenty times**

```bash
ok=0; for i in $(seq 20); do node scripts/sim/test-spectator.mjs >/dev/null 2>&1 && ok=$((ok+1)); done; echo "$ok/20"
```

Expected: `20/20`. Anything less means the floor is too high for some deal — do not lower it below 500 without re-measuring the minimum gap first, because the floor is the whole point of the check.

- [ ] **Step 4: Run it against the mutant**

```bash
for i in 1 2 3; do node scripts/sim/test-spectator.mjs /tmp/index-nodelay.html 2>&1 | grep pacing; done
```

Expected: `FAIL pacing stays human-watchable: <n> events, closest 0ms apart` on **every** run — unlike the old assertion, which passed a third of the time.

- [ ] **Step 5: Run the rest of the suites**

```bash
for t in scripts/sim/test-*.mjs; do echo "== $t"; node "$t" || echo "FAILED $t"; done
scripts/check-dc-sync.sh
```

Expected: every suite exits 0 and the bundle is reported in sync — this change must not touch it.

- [ ] **Step 6: Commit**

```bash
rm -f /tmp/index-nodelay.html
git add scripts/sim/test-spectator.mjs
git commit -m "test(sim): assert the pacing mechanism, not the round's length

The check asserted that a spectated round lasts >20s of simulated time.
Round length is set by the deal — 12s to 201s across 200 rounds — so it
failed on ~8% of deals for no reason connected to pacing, and it had
already turned a PR red that passed on a plain re-run.

It was also unsound: against a build with maybeBot's delay forced to 0 it
still passed 7 times in 20. It measured the wrong thing in both
directions.

It now records the simulated time of every table event and asserts that no
two land closer than 500ms, which is what maybeBot's scheduling actually
guarantees. The floor sits below the measured 700ms minimum on purpose, so
tuning a delay does not re-break it.

Closes #37"
```

---

### Task 2: Record the trade, and skip the changelog

**Files:** none.

**Interfaces:** none.

- [ ] **Step 1: Do not add a changelog entry**

`CHANGELOG.md` is hand-curated user-facing prose. A sim-suite assertion is not user-facing and gets no entry — the commit message carries the reasoning. This step exists to make the omission deliberate rather than forgotten.

- [ ] **Step 2: Note what the new check no longer catches**

Comment on #37 before it closes, so the trade is on the record and not only in a spec file:

> The new assertion does not catch a change that makes rounds *shorter* without changing scheduling — a rules change that ends rounds early, for example. That is deliberate: #33 was exactly such a change, it was intentional, and the old assertion reported it as a failure rather than as news. If round length is ever worth guarding, it wants its own check with a seeded deal.
