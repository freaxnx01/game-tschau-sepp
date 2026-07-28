// CPU-vs-CPU simulation harness for game-tschau-sepp.
// Extracts the dc-logic Component class from index.html, runs it in Node with
// a synchronous state host + deterministic fake timers, and verifies the
// 36-card invariant after EVERY state change.
//
// Invariant checked (whenever a round is live):
//   - exactly 36 cards across pile + discard + all hands
//   - every id 0..35 appears exactly once
//   - every (suit,rank) pair appears exactly once
//   - per rank: exactly 4 cards (one per suit)  <-- the user's "max 4 sevens"
import fs from 'node:fs';

// Usage: node scripts/sim/harness.mjs [index.html] [games] [roundsPerGame]
//        CANARY=1 node scripts/sim/harness.mjs '' 2 3   # self-test: corrupt deck, expect violations
const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const GAMES = parseInt(process.argv[3] ?? '500', 10);
const ROUNDS_PER_GAME = parseInt(process.argv[4] ?? '20', 10);

const html = fs.readFileSync(INDEX, 'utf8');
const m = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.error('dc script not found'); process.exit(2); }
const src = m[1];

// ---------- seeded PRNG (mulberry32) for reproducible runs ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- deterministic fake timer queue ----------
let queue = [];   // {at, seq, fn}
let now = 0;
let seq = 0;
globalThis.setTimeout = (fn, ms) => { queue.push({ at: now + (ms || 0), seq: seq++, fn }); return seq; };
globalThis.clearTimeout = () => {};
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};

function runQueue(component, stopWhen, maxEvents) {
  let events = 0;
  while (queue.length) {
    if (stopWhen()) return { ok: true, events };
    if (++events > maxEvents) return { ok: false, reason: 'maxEvents', events };
    queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const job = queue.shift();
    now = job.at;
    job.fn();
  }
  return { ok: stopWhen(), reason: queue.length ? undefined : 'queueEmpty', events };
}

// ---------- invariant checking ----------
const SUITS = ['rose', 'schilte', 'eichle', 'schaelle'];
const RANKS = ['6', '7', '8', '9', 'B', 'U', 'O', 'K', 'A'];
let checksRun = 0;
let roundsChecked = 0;
const violations = [];

function checkInvariant(state, ctx) {
  if (!state.seats || !state.seats.length) return;
  if (!['play', 'wish', 'roundEnd'].includes(state.phase)) return;
  if (!state.discard || !state.discard.length) return; // round not dealt yet
  checksRun++;
  const all = [];
  for (const seat of state.seats) for (const c of (seat.hand || [])) all.push(c);
  for (const c of state.pile) all.push(c);
  for (const c of state.discard) all.push(c);

  const problems = [];
  if (all.length !== 36) problems.push(`total cards = ${all.length}, expected 36`);
  const byId = new Map(), byFace = new Map(), byRank = new Map();
  for (const c of all) {
    byId.set(c.id, (byId.get(c.id) || 0) + 1);
    const f = c.suit + '-' + c.rank;
    byFace.set(f, (byFace.get(f) || 0) + 1);
    byRank.set(c.rank, (byRank.get(c.rank) || 0) + 1);
  }
  for (const [id, n] of byId) if (n !== 1) problems.push(`card id ${id} appears ${n}x`);
  for (const s of SUITS) for (const r of RANKS) {
    const n = byFace.get(s + '-' + r) || 0;
    if (n !== 1) problems.push(`${s}-${r} appears ${n}x`);
  }
  for (const r of RANKS) {
    const n = byRank.get(r) || 0;
    if (n !== 4) problems.push(`rank ${r} count = ${n}, expected 4`);
  }
  if (problems.length) {
    violations.push({ ...ctx, problems: problems.slice(0, 10), snapshot: summarize(state) });
  }
}

function summarize(s) {
  return {
    phase: s.phase, turn: s.turn, pending7: s.pending7, cover: s.cover, wish: s.wish,
    hands: s.seats.map(x => (x.hand || []).map(c => `${c.id}:${c.suit}-${c.rank}`)),
    pile: s.pile.map(c => c.id).join(','),
    discard: s.discard.map(c => `${c.id}:${c.suit}-${c.rank}`).join(' '),
  };
}

// ---------- minimal dc host ----------
let currentCtx = {};
class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(update, cb) {
    const patch = typeof update === 'function' ? update(this.state) : update;
    this.state = { ...this.state, ...patch };
    checkInvariant(this.state, currentCtx);
    cb && cb();
  }
  forceUpdate() {}
  componentDidMount() {}
  componentDidUpdate() {}
  componentWillUnmount() {}
  renderVals() { return {}; }
}

const factory = new Function('DCLogic', 'StreamableLogic', 'React', src + '\n;return Component;');
const Component = factory(DCLogic, DCLogic, {});

// CANARY=1: deliberately corrupt the deck (5th seven) to prove the checker fires.
if (process.env.CANARY) {
  const orig = Component.prototype.buildDeck;
  Component.prototype.buildDeck = function () {
    const d = orig.call(this);
    const seven = d.find(c => c.rank === '7');
    const victim = d.find(c => c.rank === '9');
    victim.suit = seven.suit; victim.rank = '7'; // now two identical sevens
    return d;
  };
}

// ---------- game driver ----------
let totalRounds = 0, stalls = 0;

function playGame(gameIdx, difficulty, startcharte) {
  const seed = 0xC0FFEE ^ gameIdx;
  Math.random = mulberry32(seed);
  queue = []; now = 0;
  currentCtx = { game: gameIdx, seed, difficulty, startcharte };

  const c = new Component({ startcharte });
  c.state = { ...c.state, sound: false, mode: 'bot', difficulty, mySeat: 0, roundNum: 1, starter: 0 };
  c.state.seats = [
    { name: 'Bot-A', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    { name: 'Bot-B', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
  ];

  for (let round = 1; round <= ROUNDS_PER_GAME; round++) {
    currentCtx = { game: gameIdx, seed, difficulty, startcharte, round };
    c.startRound();
    const res = runQueue(c, () => c.state.phase === 'roundEnd', 200000);
    if (!res.ok) {
      stalls++;
      violations.push({ ...currentCtx, problems: [`STALL: round did not finish (${res.reason})`], snapshot: summarize(c.state) });
      return;
    }
    totalRounds++; roundsChecked++;
    // drain leftover timers (bubbles etc.) then advance
    runQueue(c, () => false, 1000);
    if (round < ROUNDS_PER_GAME) {
      c.setState({ roundNum: c.state.roundNum + 1, starter: c.nextOk(c.state.starter) });
    }
  }
}

const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  const difficulty = g % 2 === 0 ? 'gwieft' : 'gmuetlich';
  const startcharte = g % 4 < 2 ? '5' : '7';
  playGame(g, difficulty, startcharte);
  if (violations.length > 20) break;
}

console.log(JSON.stringify({
  games: GAMES,
  roundsPlayed: totalRounds,
  invariantChecks: checksRun,
  stalls,
  violations: violations.length,
  wallMs: Date.now() - t0,
}, null, 2));
if (violations.length) {
  console.log('\n=== VIOLATIONS ===');
  for (const v of violations.slice(0, 5)) console.log(JSON.stringify(v, null, 2));
  process.exit(1);
}
