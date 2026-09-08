// Tests for resolving a pending-7 draw when the draw pile cannot serve it.
// See docs/superpowers/specs/2026-09-07-pending-draw-exhausted-pile-design.md
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

globalThis.setTimeout = () => 0; // swallow timers — synchronous assertions only
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

// An exhausted pile: nothing to draw and a single-card discard, so
// recycleDiscard() cannot reshuffle and drawCards() returns [].
function exhausted({ turn, pendingWinner, hands }) {
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 0, roundNum: 1, starter: 0,
    seats: [
      { name: 'Du', kind: 'local', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'Bot', kind: 'bot', hand: [], said: true, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  c.startRound();
  c.setState({
    phase: 'play', turn, cover: null, wish: null, hasDrawn: false, roundEnd: null,
    pending7: 2, sevenChain: 1, pendingWinner,
    pile: [], discard: [{ id: 900, suit: 'schilte', rank: '9' }],
    seats: c.state.seats.map((x, i) => ({ ...x, hand: hands[i].slice() })),
  });
  return c;
}

const CARD = { id: 801, suit: 'rose', rank: 'A' };

{
  // The regression: the seat that must draw IS the pending winner. It has no
  // cards, the pile cannot serve the penalty, and the round must end for it.
  const c = exhausted({ turn: 1, pendingWinner: 1, hands: [[CARD], []] });
  c.drawFor(1);
  check('exhausted pile: the round is resolved for the pending winner that drew',
    c.state.pendingWinner === 1 || c.state.roundEnd != null,
    'pendingWinner=' + c.state.pendingWinner + ' roundEnd=' + JSON.stringify(c.state.roundEnd));
  check('exhausted pile: no seat is left with an empty hand and an unresolved round',
    !(c.state.phase === 'play' && c.state.roundEnd == null
      && c.state.seats.some(x => x.status === 'ok' && x.hand.length === 0)),
    'phase=' + c.state.phase + ' hands=' + JSON.stringify(c.state.seats.map(x => x.hand.length)));
}

{
  // Unchanged: the chain broke at another seat, so the winner takes the round.
  const c = exhausted({ turn: 0, pendingWinner: 1, hands: [[CARD], []] });
  c.drawFor(0);
  check('exhausted pile: a broken chain still resolves for the winner',
    c.state.pending7 === 0, 'pending7=' + c.state.pending7);
}

{
  // Unchanged: nobody is out, so the unservable penalty is waived.
  const c = exhausted({ turn: 0, pendingWinner: null, hands: [[CARD], [CARD]] });
  c.drawFor(0);
  check('exhausted pile: with no pending winner the penalty is waived',
    c.state.pending7 === 0 && c.state.roundEnd == null,
    'pending7=' + c.state.pending7 + ' roundEnd=' + JSON.stringify(c.state.roundEnd));
}

process.exit(failed ? 1 : 0);
