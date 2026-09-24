// Tests for CPU vs CPU spectator mode (#1).
// See docs/design/spectator/{wireframe,flow}.md
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const src = fs.readFileSync(INDEX, 'utf8').match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

let now = 0, seq = 0, timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), i: seq++, fn }); return seq; };
globalThis.setInterval = () => 0;
globalThis.clearTimeout = () => {};
function drain(limit = 4000) {
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

function spectate() {
  timers = [];
  const c = new Component({ startcharte: '5' });
  c.setState({ sound: false });
  c.startSpectate();
  return c;
}

{
  const c = spectate();
  const s = c.state;
  check('both seats are bots', s.seats.every(x => x.kind === 'bot'),
    JSON.stringify(s.seats.map(x => x.kind)));
  check('mode is spectate', s.mode === 'spectate', s.mode);
  check('the two AIs play at different levels',
    c.seatDifficulty(0) === 'gmuetlich' && c.seatDifficulty(1) === 'gwieft',
    c.seatDifficulty(0) + ' vs ' + c.seatDifficulty(1));
}

{
  // Nobody holds secrets: both hands render face-up.
  const c = spectate();
  const v = c.renderVals();
  check('the bottom hand is face-up', v.playerCards.length === 5, 'n=' + v.playerCards.length);
  const oppCard = c.state.seats[1].hand[0];
  check('the opponent hand is face-up too',
    v.opps[0].cards[0].uri === c.face(oppCard), 'uri did not match face()');
  check('the opponent hand is not card backs',
    v.opps[0].cards[0].uri !== v.backUri);
}

{
  // A normal game must be unaffected by the face-up change.
  const c = new Component({ startcharte: '5' });
  c.setState({ sound: false });
  c.start('gwieft');
  const v = c.renderVals();
  check('a solo game still shows the opponent as backs',
    v.opps[0].cards[0].uri === v.backUri);
  check('the solo bot keeps its difficulty on the seat',
    c.seatDifficulty(1) === 'gwieft', c.seatDifficulty(1));
}

{
  // The harness sets only the global field; it must still drive the bots.
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gmuetlich', mySeat: 0,
    seats: [
      { name: 'A', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'B', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  check('a seat without its own level falls back to the global one',
    c.seatDifficulty(0) === 'gmuetlich' && c.seatDifficulty(1) === 'gmuetlich',
    c.seatDifficulty(0) + '/' + c.seatDifficulty(1));
}

{
  // Nothing is clickable — enforced in the commands, not just hidden in the view.
  const c = spectate();
  const v = c.renderVals();
  check('no hint button', v.showHint === false);
  check('no Tschau button', v.showTschau === false);
  check('no Passe button', v.showPasse === false);

  const before = c.state.seats[0].hand.length;
  const card = c.state.seats[0].hand.find(x => c.canPlay(x));
  if (card) c.tryPlay(card.id);
  check('tryPlay refuses while spectating',
    c.state.seats[0].hand.length === before, 'hand ' + before + ' -> ' + c.state.seats[0].hand.length);

  const pile = c.state.pile.length;
  c.drawClick();
  check('drawClick refuses while spectating', c.state.pile.length === pile,
    'pile ' + pile + ' -> ' + c.state.pile.length);

  c.setState({ seats: c.state.seats.map((x, i) => i === 0 ? { ...x, hand: [x.hand[0]], said: false } : x) });
  c.sayTschau();
  check('sayTschau refuses while spectating', c.state.seats[0].said === false);
}

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

process.exit(failed ? 1 : 0);
