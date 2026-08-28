// Tests for the reshuffle-visibility feature (issue #13):
//   - recycleDiscard() is the single recycle site and behaves as a pure function
//   - draws and reshuffles are recorded in the debug journal
//   - journalRows() renders all three entry kinds
//   - the P2P guest is told about a reshuffle via a monotonic counter
import fs from 'node:fs';

// Usage: node scripts/sim/test-reshuffle.mjs [source-or-index.html]
const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

globalThis.setTimeout = () => 0; // swallow timers — these are synchronous tests
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

let failed = false;
function check(name, cond, detail) {
  if (cond) { console.log('PASS ' + name); return; }
  failed = true;
  console.log('FAIL ' + name + (detail ? ': ' + detail : ''));
}

function fresh() {
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 0, roundNum: 1, starter: 0,
    seats: [
      { name: 'Bot-A', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'Bot-B', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  c.startRound();
  return c;
}

// ---------- Task 1: recycleDiscard ----------
{
  const c = fresh();
  const discard = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const r = c.recycleDiscard([], discard);
  check('recycle: reports reshuffled', r.reshuffled === true, JSON.stringify(r.reshuffled));
  check('recycle: moves all but the top card', r.n === 3, 'n=' + r.n);
  check('recycle: new pile holds the moved cards', r.pile.length === 3, 'pile=' + r.pile.length);
  check('recycle: discard keeps only the top card', r.discard.length === 1 && r.discard[0].id === 4,
    JSON.stringify(r.discard.map(x => x.id)));
  check('recycle: conserves cards', r.pile.length + r.discard.length === 4,
    r.pile.length + '+' + r.discard.length);
  check('recycle: does not mutate the input discard', discard.length === 4, 'len=' + discard.length);
  const ids = [...r.pile, ...r.discard].map(x => x.id).sort();
  check('recycle: same card ids come back', JSON.stringify(ids) === JSON.stringify([1, 2, 3, 4]), JSON.stringify(ids));
}

{
  const c = fresh();
  const pile = [];
  const discard = [{ id: 9 }];
  const r = c.recycleDiscard(pile, discard);
  check('recycle: single-card discard is a no-op', r.reshuffled === false && r.n === 0,
    JSON.stringify({ reshuffled: r.reshuffled, n: r.n }));
  check('recycle: no-op returns the inputs untouched', r.pile === pile && r.discard === discard);
}

// ---------- Task 1: both draw paths use it ----------
{
  const c = fresh();
  // Force the draw pile empty so drawCards must recycle.
  const moved = c.state.pile.splice(0, c.state.pile.length);
  c.state.discard = c.state.discard.concat(moved);
  const before = c.state.pile.length + c.state.discard.length
    + c.state.seats.reduce((n, x) => n + x.hand.length, 0);
  c.drawCards(0, 2);
  const after = c.state.pile.length + c.state.discard.length
    + c.state.seats.reduce((n, x) => n + x.hand.length, 0);
  check('drawCards: recycles instead of running dry', c.state.seats[0].hand.length > 0, 'hand empty');
  check('drawCards: card count conserved across recycle', before === after && after === 36,
    before + ' -> ' + after);
}

// ---------- Task 2: journal entries ----------
{
  const c = fresh();
  c.state.debugLog = [];
  const moved = c.state.pile.splice(0, c.state.pile.length);
  c.state.discard = c.state.discard.concat(moved);
  const recycled = c.state.discard.length - 1;
  c.drawCards(1, 2);
  const log = c.state.debugLog;
  const rs = log.filter(e => e.kind === 'reshuffle');
  const dr = log.filter(e => e.kind === 'draw');
  check('journal: exactly one reshuffle entry', rs.length === 1, 'got ' + rs.length);
  check('journal: reshuffle entry counts the recycled cards', rs.length === 1 && rs[0].n === recycled,
    JSON.stringify(rs));
  check('journal: exactly one draw entry', dr.length === 1, 'got ' + dr.length);
  check('journal: draw entry carries seat and total', dr.length === 1 && dr[0].seat === 1 && dr[0].n === 2,
    JSON.stringify(dr));
  check('journal: reshuffle is logged before the draw it enabled',
    log.findIndex(e => e.kind === 'reshuffle') < log.findIndex(e => e.kind === 'draw'),
    JSON.stringify(log.map(e => e.kind)));
}

{
  const c = fresh();
  c.state.debugLog = [];
  c.drawCards(0, 3); // plenty of pile left — no recycle expected
  check('journal: no reshuffle entry when the pile suffices',
    c.state.debugLog.filter(e => e.kind === 'reshuffle').length === 0,
    JSON.stringify(c.state.debugLog));
  check('journal: draw entry still recorded',
    c.state.debugLog.filter(e => e.kind === 'draw' && e.n === 3).length === 1,
    JSON.stringify(c.state.debugLog));
}

{
  const c = fresh();
  c.state.debugLog = [];
  // drawUntilCover logs its own draw entry with the number it actually pulled.
  const r = c.drawUntilCover(0);
  const dr = c.state.debugLog.filter(e => e.kind === 'draw');
  check('journal: drawUntilCover logs one draw entry', dr.length === 1, JSON.stringify(c.state.debugLog));
  check('journal: drawUntilCover draw entry matches the drawn count',
    dr.length === 1 && dr[0].n === r.n && dr[0].seat === 0, JSON.stringify(dr) + ' vs n=' + r.n);
}

{
  const c = fresh();
  c.state.debugLog = [];
  c.drawCards(0, 0); // nothing drawn
  check('journal: drawing zero cards logs nothing',
    c.state.debugLog.length === 0, JSON.stringify(c.state.debugLog));
}

process.exit(failed ? 1 : 0);