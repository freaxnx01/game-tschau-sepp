// Tests for responding to a last-card 7 after the forced draw (#27).
//
// Rule: a forced 7-penalty draw does not end the round. The penalised player
// may act on what they drew, exactly as in an ordinary 7 chain. The winner's
// round stands only once play actually returns to them while they hold no
// cards.
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const src = fs.readFileSync(INDEX, 'utf8').match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

let now = 0, seq = 0, timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), i: seq++, fn }); return seq; };
globalThis.setInterval = () => 0;
globalThis.clearTimeout = () => {};
function drain(limit = 600) {
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

const SEVEN_LAST = { id: 700, suit: 'rose', rank: '7' };

// Seat 0 goes out on a 7; seat 1 holds no 7 and must draw `pile`'s top two.
function position({ p2hand, pile }) {
  timers = [];
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 1, roundNum: 1, starter: 0,
    seats: [
      { name: 'Eis', kind: 'local', hand: [], said: true, status: 'ok', score: 0, rounds: 0 },
      { name: 'Zwei', kind: 'local', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  c.startRound(); drain(); timers = [];
  c.setState({
    phase: 'play', turn: 0, cover: null, wish: null, pending7: 0, sevenChain: 0, pendingWinner: null,
    hasDrawn: false, roundEnd: null,
    discard: [{ id: 900, suit: 'rose', rank: '6' }],
    pile: pile.slice(),
    seats: [
      { ...c.state.seats[0], hand: [SEVEN_LAST], said: true },
      { ...c.state.seats[1], hand: p2hand.slice() },
    ],
  });
  c.playCard(0, SEVEN_LAST); drain();
  return c;
}

const DRAWN_SEVEN = { id: 701, suit: 'schilte', rank: '7' };
const FILLER = { id: 702, suit: 'eichle', rank: '9' };
const DEEP = [{ id: 800, suit: 'eichle', rank: '6' }, { id: 801, suit: 'eichle', rank: '8' }];
const KING = { id: 810, suit: 'eichle', rank: 'K' };
const OBER = { id: 811, suit: 'rose', rank: 'O' };

{
  // The reported bug: drawing must not end the round.
  const c = position({ p2hand: [KING, OBER], pile: [...DEEP, DRAWN_SEVEN, FILLER] });
  check('setup: the last-card 7 defers the win', c.state.pendingWinner === 0 && c.state.pending7 === 2,
    'pendingWinner=' + c.state.pendingWinner + ' pending7=' + c.state.pending7);
  c.drawFor(1); drain();
  const s = c.state;
  check('the forced draw does not end the round', !s.roundEnd && s.phase === 'play',
    'phase=' + s.phase + ' roundEnd=' + JSON.stringify(s.roundEnd));
  const drawn = s.seats[1].hand.find(x => x.id === DRAWN_SEVEN.id);
  check('the drawn 7 is in hand', !!drawn);
  check('the drawn 7 can be played', !!drawn && c.canPlay(drawn));
}

{
  // Playing it passes the chain back to the card-less winner, who re-enters.
  const c = position({ p2hand: [KING, OBER], pile: [...DEEP, DRAWN_SEVEN, FILLER] });
  c.drawFor(1); drain();
  c.playCard(1, c.state.seats[1].hand.find(x => x.id === DRAWN_SEVEN.id)); drain();
  check('the chain passed back to the winner', c.state.turn === 0 && c.state.pending7 === 2,
    'turn=' + c.state.turn + ' pending7=' + c.state.pending7);
  // Both seats are local here, so nothing auto-draws: the winner takes the
  // penalty the same way a player would.
  c.drawFor(0); drain();
  const s = c.state;
  check('the winner is drawn back into the game', s.seats[0].hand.length > 0,
    'winner hand=' + s.seats[0].hand.length);
  check('the round did not end when the chain passed back', !s.roundEnd,
    JSON.stringify(s.roundEnd));
  check('pendingWinner is cleared once the winner draws', s.pendingWinner == null,
    'pendingWinner=' + s.pendingWinner);
}

{
  // Chain genuinely broken: nothing playable after the draw -> the winner wins.
  const c = position({ p2hand: [KING], pile: [...DEEP, { id: 703, suit: 'eichle', rank: 'O' }, FILLER] });
  c.drawFor(1); drain();
  const s = c.state;
  check('a broken chain still awards the round to the winner',
    !!s.roundEnd && s.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(s.roundEnd && s.roundEnd.winner) + ' phase=' + s.phase);
}

{
  // Drawing a non-7 breaks the chain outright: the winner takes the round
  // before the drawer can play anything (#33).
  const c = position({ p2hand: [KING, OBER], pile: [...DEEP, { id: 704, suit: 'rose', rank: '9' }, FILLER] });
  c.drawFor(1); drain();
  check('a non-7 draw hands the round to the winner at once',
    !!c.state.roundEnd && c.state.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(c.state.roundEnd && c.state.roundEnd.winner));
  const playable = c.state.seats[1].hand.filter(x => c.canPlay(x) && x.rank !== '7');
  check('the drawer still holds the card it would have discarded', playable.length > 0,
    'playable=' + playable.length);
}

{
  // #16 must not regress: an unservable draw still resolves immediately.
  const c = position({ p2hand: [KING], pile: [] });
  c.setState({ pile: [], discard: c.state.discard.slice(-1) });
  c.drawFor(1); drain();
  check('an unservable penalty still ends the round (#16)',
    !!c.state.roundEnd && c.state.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(c.state.roundEnd && c.state.roundEnd.winner));
}

process.exit(failed ? 1 : 0);
