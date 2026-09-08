// Tests for move advice scoring the hand a move LEAVES BEHIND (#17).
// See docs/superpowers/specs/2026-09-07-move-scoring-resulting-hand-design.md
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

globalThis.setTimeout = () => 0;
globalThis.setInterval = () => 0;
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

// Two-player position with the given hand; the discard top is a Schälle 6 so
// every Schälle card and every Ass/Under is playable.
function position(hand) {
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 0,
    phase: 'play', turn: 0, cover: null, wish: null, wisher: null,
    pending7: 0, sevenChain: 0, pendingWinner: null, hasDrawn: false,
    discard: [{ id: 9, suit: 'schaelle', rank: '6' }], pile: [], history: [], debugLog: [],
    seats: [
      { name: 'Du', kind: 'local', hand: hand.slice(), said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'Bot', kind: 'bot', hand: [{ id: 10, suit: 'rose', rank: 'K' }, { id: 11, suit: 'rose', rank: '9' }], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  return c;
}

// Would tryPlay() show a tip for playing `played`?
function tipFires(c, played) {
  const s = c.state, hand = s.seats[0].hand;
  const adv = c.advise();
  return adv.card && adv.card.id !== played.id && (adv.score - c.moveScore(played, hand, s)) >= 18;
}

const ASS = { id: 1, suit: 'schaelle', rank: 'A' };
const ACHT = { id: 2, suit: 'schaelle', rank: '8' };

{
  // The reported position: playing the Ass and covering with the 8 sheds both
  // cards; playing the 8 first strands a bare Ass.
  const c = position([ASS, ACHT]);
  check('reported position: no tip when the Ass is played',
    !tipFires(c, ASS), 'advise=' + JSON.stringify(c.advise().card));
  check('reported position: the Ass is the recommended move',
    c.advise().card.id === ASS.id, 'advise=' + JSON.stringify(c.advise().card));
}

{
  // Playing the 8 must not be tipped as better either.
  const c = position([ASS, ACHT]);
  check('reported position: playing the 8 is never tipped toward the 8',
    c.advise().card.id !== ACHT.id, 'advise=' + JSON.stringify(c.advise().card));
}

{
  // The stranded-remainder rule itself.
  const c = position([ASS, ACHT]);
  check('strandedHand: a lone Ass is a dead end', c.strandedHand([ASS]) === true);
  check('strandedHand: a lone 8 is a dead end', c.strandedHand([ACHT]) === true);
  check('strandedHand: a lone ordinary card is not',
    c.strandedHand([{ id: 5, suit: 'schaelle', rank: '9' }]) === false);
  check('strandedHand: two cards are not a dead end', c.strandedHand([ASS, ACHT]) === false);
}

{
  // Control: a genuinely bad move must still be tipped, or the fix has just
  // silenced the feature.
  const UNDER = { id: 3, suit: 'rose', rank: 'U' };
  const KOENIG = { id: 4, suit: 'schaelle', rank: 'K' };
  const NUENI = { id: 5, suit: 'schaelle', rank: '9' };
  const c = position([UNDER, KOENIG, NUENI]);
  check('control: dumping the Under with an ordinary card available is still tipped',
    tipFires(c, UNDER), 'advise=' + JSON.stringify(c.advise().card));
}

process.exit(failed ? 1 : 0);
