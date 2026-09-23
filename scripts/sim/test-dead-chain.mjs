// Tests for a 7 chain that is provably dead (#33).
//
// Rule: after a forced 7-penalty draw by a seat that is not the pending winner,
// the drawer keeps the turn only if they now hold a playable 7. Otherwise the
// chain cannot come back and the round is awarded at once — before the drawer
// can shed a card that would lower their score.
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
const DRAWN_SEVEN = { id: 701, suit: 'schilte', rank: '7' };
const PLAYABLE = { id: 702, suit: 'rose', rank: '9' };   // matches the discarded 7's suit
const FILLER = { id: 703, suit: 'eichle', rank: '9' };
const DEEP = [{ id: 800, suit: 'eichle', rank: '6' }, { id: 801, suit: 'eichle', rank: 'K' }];
const KING = { id: 810, suit: 'eichle', rank: 'K' };     // unplayable on a rose 7

// Seat 0 goes out on a 7; the seats after it hold what `hands` says and must
// draw `pile`'s top cards. `hands` covers seat 1 upwards — pass `p2hand` for the
// common two-seat case.
function position({ p2hand, hands, pile, opponent = 'local' }) {
  const rest = hands || [p2hand];
  const kinds = [opponent].concat(rest.slice(1).map(() => 'local'));
  timers = [];
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 1, roundNum: 1, starter: 0,
    seats: [{ name: 'Eis', kind: 'local', hand: [], said: true, status: 'ok', score: 0, rounds: 0 }].concat(
      rest.map((h, i) => ({ name: 'Sitz' + (i + 2), kind: kinds[i], hand: [], said: false, status: 'ok', score: 0, rounds: 0 }))),
  };
  c.startRound(); drain(); timers = [];
  c.setState({
    phase: 'play', turn: 0, cover: null, wish: null, pending7: 0, sevenChain: 0, pendingWinner: null,
    hasDrawn: false, roundEnd: null,
    discard: [{ id: 900, suit: 'rose', rank: '6' }],
    pile: pile.slice(),
    seats: [{ ...c.state.seats[0], kind: 'local', hand: [SEVEN_LAST], said: true }].concat(
      rest.map((h, i) => ({ ...c.state.seats[i + 1], kind: kinds[i], hand: h.slice() }))),
  });
  c.playCard(0, SEVEN_LAST); drain();
  return c;
}

{
  // 1) Mänsch zieht, käi Siebni derbi, aber öppis Spielbars: d Rundä stoht sofort.
  const c = position({ p2hand: [KING], pile: [...DEEP, PLAYABLE, FILLER] });
  c.drawFor(1); drain();
  const s = c.state;
  check('dead chain ends the round at once', !!s.roundEnd && s.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(s.roundEnd && s.roundEnd.winner) + ' phase=' + s.phase);
  check('the drawer never got to discard', s.seats[1].hand.length === 3,
    'hand=' + s.seats[1].hand.length);
  check('the full hand is scored against the drawer',
    !!s.roundEnd && s.roundEnd.pts === c.pointsOf(s.seats[1].hand),
    'pts=' + (s.roundEnd && s.roundEnd.pts) + ' hand=' + JSON.stringify(s.seats[1].hand.map(x => x.rank)));
}

{
  // 2) Mänsch zieht e Siebni: d Chetti läbt, dr Gwinner blibt pendent (#27).
  const c = position({ p2hand: [KING], pile: [...DEEP, DRAWN_SEVEN, FILLER] });
  c.drawFor(1); drain();
  const s = c.state;
  check('a drawn 7 keeps the round open', !s.roundEnd && s.phase === 'play',
    'phase=' + s.phase + ' roundEnd=' + JSON.stringify(s.roundEnd));
  const drawn = s.seats[1].hand.find(x => x.id === DRAWN_SEVEN.id);
  check('the drawn 7 is playable', !!drawn && c.canPlay(drawn));
}

{
  // 3) Bot zieht e Siebni: glich Rächt wie dr Mänsch — er darf zruggstacke.
  const c = position({ p2hand: [KING], pile: [...DEEP, DRAWN_SEVEN, FILLER], opponent: 'bot' });
  drain();
  const s = c.state;
  check('a bot that drew a 7 keeps the round open', !s.roundEnd,
    'roundEnd=' + JSON.stringify(s.roundEnd && s.roundEnd.winner));
  check('the bot stacks the 7 back at the winner', s.pending7 === 2 && s.turn === 0,
    'pending7=' + s.pending7 + ' turn=' + s.turn);
  check('the winner stays pending while the chain lives', s.pendingWinner === 0,
    'pendingWinner=' + s.pendingWinner);
}

{
  // 4) Bot ohni Siebni: d Rundä stoht sofort — unveränderet.
  const c = position({ p2hand: [KING], pile: [...DEEP, PLAYABLE, FILLER], opponent: 'bot' });
  drain();
  const s = c.state;
  check('a bot without a 7 still concedes at once', !!s.roundEnd && s.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(s.roundEnd && s.roundEnd.winner));
}

{
  // 5) #16 darf nöd regressiere: dr Gwinner sälber zieht us eme lääre Stapel.
  const c = position({ p2hand: [KING], pile: [...DEEP, DRAWN_SEVEN, FILLER] });
  c.drawFor(1); drain();
  c.playCard(1, c.state.seats[1].hand.find(x => x.id === DRAWN_SEVEN.id)); drain();
  c.setState({ pile: [], discard: c.state.discard.slice(-1) });
  c.drawFor(0); drain();
  check('an unservable penalty still ends the round (#16)',
    !!c.state.roundEnd && c.state.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(c.state.roundEnd && c.state.roundEnd.winner));
}

{
  // 6) Drü Sitz: Sitz 1 cha nöd stacke, aber Sitz 2 het no e Siebni und isch
  //    dra, bevor s zrugg zum Gwinner chunt. D Chetti isch also NÖD tot.
  const OPP_SEVEN = { id: 820, suit: 'schilte', rank: '7' };
  const c = position({ hands: [[KING], [OPP_SEVEN]], pile: [...DEEP, PLAYABLE, FILLER] });
  c.drawFor(1); drain();
  const s = c.state;
  check('with a seat still to come the round does not end early', !s.roundEnd && s.phase === 'play',
    'roundEnd=' + JSON.stringify(s.roundEnd && s.roundEnd.winner) + ' phase=' + s.phase);
  check('the winner is still pending for that seat', s.pendingWinner === 0,
    'pendingWinner=' + s.pendingWinner);
}

{
  // 7) Drü Sitz, aber jetzt zieht dr Sitz DIREKT vor em Gwinner: jetzt isch
  //    d Chetti würklich tot und d Rundä stoht sofort.
  const c = position({ hands: [[PLAYABLE], [KING]], pile: [...DEEP, FILLER, { id: 704, suit: 'eichle', rank: '6' }] });
  c.setState({ turn: 2, pendingWinner: 0, pending7: 2 });
  c.drawFor(2); drain();
  const s = c.state;
  check('the last seat before the winner ends the round at once',
    !!s.roundEnd && s.roundEnd.winner === 0,
    'roundEnd=' + JSON.stringify(s.roundEnd && s.roundEnd.winner) + ' phase=' + s.phase);
}

process.exit(failed ? 1 : 0);
