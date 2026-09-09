// Tests for resolving a pending-7 draw when the draw pile cannot serve it.
// See docs/superpowers/specs/2026-09-07-pending-draw-exhausted-pile-design.md
//
// The resolution is deferred through this.after(600, ...), so these tests run a
// fake clock rather than swallowing timers — swallowing them would assert on a
// state the player never sees.
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

let now = 0, seq = 0, timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), i: seq++, fn }); return seq; };
globalThis.setInterval = () => 0;
globalThis.clearTimeout = () => {};
function drain(limit = 500) {
  let steps = 0;
  while (timers.length && steps++ < limit) {
    timers.sort((a, b) => a.at - b.at || a.i - b.i);
    const t = timers.shift(); now = t.at; t.fn();
  }
}
globalThis.window = { innerHeight: 900, innerWidth: 1400 };

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
function exhausted({ turn, pendingWinner, hands, kinds = ['local', 'bot'] }) {
  timers = [];
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 0, roundNum: 1, starter: 0,
    seats: [
      { name: 'Du', kind: kinds[0], hand: [], said: true, status: 'ok', score: 0, rounds: 0 },
      { name: 'Bot', kind: kinds[1], hand: [], said: true, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  c.startRound();
  drain();
  timers = [];
  c.setState({
    phase: 'play', turn, cover: null, wish: null, hasDrawn: false, roundEnd: null,
    pending7: 2, sevenChain: 1, pendingWinner,
    pile: [], discard: [{ id: 900, suit: 'schilte', rank: '9' }],
    seats: c.state.seats.map((x, i) => ({ ...x, hand: hands[i].slice() })),
  });
  return c;
}

const CARD = { id: 801, suit: 'rose', rank: 'A' };
const resolved = s => s.phase !== 'play' || s.roundEnd != null;
const limbo = s => s.phase === 'play' && s.roundEnd == null
  && s.seats.some(x => x.status === 'ok' && x.hand.length === 0);

{
  // The regression: the seat that must draw IS the pending winner. It holds no
  // cards, the pile cannot serve the penalty, and the round must end for it.
  const c = exhausted({ turn: 1, pendingWinner: 1, hands: [[CARD], []] });
  c.drawFor(1);
  drain();
  check('drawFor: the round resolves for the pending winner that drew nothing', resolved(c.state),
    'phase=' + c.state.phase + ' roundEnd=' + JSON.stringify(c.state.roundEnd));
  check('drawFor: no seat is left with an empty hand and an unresolved round', !limbo(c.state),
    'hands=' + JSON.stringify(c.state.seats.map(x => x.hand.length)));
}

{
  // Unchanged: the chain broke at another seat, so the winner takes the round.
  const c = exhausted({ turn: 0, pendingWinner: 1, hands: [[CARD], []] });
  c.drawFor(0);
  drain();
  check('drawFor: a broken chain still resolves for the winner',
    c.state.pending7 === 0 && resolved(c.state), 'pending7=' + c.state.pending7);
}

{
  // Unchanged: nobody is out, so the unservable penalty is waived and play goes on.
  const c = exhausted({ turn: 0, pendingWinner: null, hands: [[CARD], [CARD]] });
  c.drawFor(0);
  drain();
  check('drawFor: with no pending winner the penalty is waived',
    c.state.pending7 === 0 && c.state.roundEnd == null, 'pending7=' + c.state.pending7);
}

{
  // The same hole on the bot side (PR review, #21): the bot IS the pending
  // winner, it wraps back to itself, and the pile cannot serve the penalty.
  const c = exhausted({ turn: 1, pendingWinner: 1, hands: [[CARD], []], kinds: ['local', 'bot'] });
  c.botTurn();
  drain();
  check('botTurn: the round resolves for a bot pending winner that drew nothing', resolved(c.state),
    'phase=' + c.state.phase + ' roundEnd=' + JSON.stringify(c.state.roundEnd));
  check('botTurn: no bot seat is left with an empty hand and an unresolved round', !limbo(c.state),
    'hands=' + JSON.stringify(c.state.seats.map(x => x.hand.length)));
}

{
  // Unchanged on the bot side: chain broken by the bot, winner is the human.
  const c = exhausted({ turn: 1, pendingWinner: 0, hands: [[CARD], []], kinds: ['local', 'bot'] });
  c.botTurn();
  drain();
  check('botTurn: a chain broken at the bot still resolves for the other winner', resolved(c.state),
    'phase=' + c.state.phase + ' roundEnd=' + JSON.stringify(c.state.roundEnd));
}

process.exit(failed ? 1 : 0);
