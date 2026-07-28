// Regression test: playCard() called with a card NOT in the player's hand
// must not mint a duplicate (hand-filter no-op + discard concat).
import fs from 'node:fs';

// Usage: node scripts/sim/test-guard.mjs [index.html]
const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

globalThis.setTimeout = () => 0; // swallow timers — we only test the synchronous move
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

function countCards(s) {
  const all = [...s.seats.flatMap(x => x.hand), ...s.pile, ...s.discard];
  const byId = new Map();
  all.forEach(c => byId.set(c.id, (byId.get(c.id) || 0) + 1));
  const dups = [...byId].filter(([, n]) => n > 1);
  return { total: all.length, dups };
}

const c = new Component({ startcharte: '5' });
c.state = {
  ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 0, roundNum: 1, starter: 0,
  seats: [
    { name: 'Bot-A', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    { name: 'Bot-B', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
  ],
};
c.startRound();

let failed = false;

// Case 1: card that lives in the PILE, not in seat 0's hand
const foreign = c.state.pile.find(x => x.rank !== 'A' && x.rank !== '8' && x.rank !== 'U' && x.rank !== '7');
c.playCard(0, foreign);
let r = countCards(c.state);
if (r.total !== 36 || r.dups.length) {
  failed = true;
  console.log(`FAIL case 1 (pile card): total=${r.total}, dups=${JSON.stringify(r.dups)}`);
} else console.log('PASS case 1: pile card rejected, still 36 unique');

// Case 2: card from the OPPONENT's hand
const stolen = c.state.seats[1].hand.find(x => x.rank !== 'A' && x.rank !== '8' && x.rank !== 'U' && x.rank !== '7') || c.state.seats[1].hand[0];
c.playCard(0, stolen);
r = countCards(c.state);
if (r.total !== 36 || r.dups.length) {
  failed = true;
  console.log(`FAIL case 2 (opponent card): total=${r.total}, dups=${JSON.stringify(r.dups)}`);
} else console.log('PASS case 2: opponent card rejected, still 36 unique');

// Case 3: legit play still works
const own = c.state.seats[c.state.turn].hand.filter(x => c.canPlay(x));
if (own.length) {
  const before = c.state.seats[c.state.turn].hand.length;
  const who = c.state.turn;
  c.playCard(who, own[0]);
  r = countCards(c.state);
  const after = c.state.seats[who].hand.length;
  if (r.total !== 36 || r.dups.length || after !== before - 1) {
    failed = true;
    console.log(`FAIL case 3 (legit play): total=${r.total}, dups=${JSON.stringify(r.dups)}, hand ${before}->${after}`);
  } else console.log('PASS case 3: legit play still moves the card');
} else console.log('SKIP case 3: no playable card in this deal');

process.exit(failed ? 1 : 0);
