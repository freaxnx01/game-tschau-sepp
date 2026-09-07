// Tests for the Ass-cover draw: a human who must cover an Ass draws ONE card
// per click and then decides, instead of being force-drawn until a cover shows
// up. The bot keeps drawing in bulk — it only draws when it holds no cover.
import fs from 'node:fs';

// Usage: node scripts/sim/test-cover-draw.mjs [source-or-index.html]
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

// An eichle Ass on the discard pile, seat 0 to move and owing the cover.
// A cover is: any Ass, any Under, or an eichle card.
const ACE = { id: 900, suit: 'eichle', rank: 'A' };
const NON_COVER = [{ id: 901, suit: 'rose', rank: '6' }, { id: 902, suit: 'schilte', rank: '9' }];
const COVER = { id: 903, suit: 'eichle', rank: 'K' };

// pile.pop() draws from the end, so the last entry is the first card drawn.
function coverState(hand, pile) {
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 0, roundNum: 1, starter: 0,
    seats: [
      { name: 'Du', kind: 'local', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'Computer', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  c.startRound();
  c.setState({
    phase: 'play', turn: 0, cover: 0, hasDrawn: false, wish: null, pending7: 0,
    discard: [ACE], pile: pile.slice(),
    seats: c.state.seats.map((x, i) => i === 0 ? { ...x, hand: hand.slice() } : { ...x, hand: [] }),
  });
  return c;
}

// Three cards deep to the first cover — the old bulk draw took all three at once.
const DEEP = [COVER, NON_COVER[1], NON_COVER[0]];

{
  const c = coverState([{ id: 910, suit: 'rose', rank: '7' }], DEEP);
  c.drawFor(0);
  check('cover draw: one click draws exactly one card',
    c.state.seats[0].hand.length === 2, 'hand=' + c.state.seats[0].hand.length);
}

{
  // The reported bug: holding the Under, the player wants to draw one card and
  // then decide whether to spend the joker — not be handed three cards.
  const c = coverState([{ id: 911, suit: 'rose', rank: 'U' }], DEEP);
  c.drawFor(0);
  check('cover draw: drawing is allowed and still one card while holding an Under',
    c.state.seats[0].hand.length === 2, 'hand=' + c.state.seats[0].hand.length);
}

{
  const c = coverState([{ id: 912, suit: 'rose', rank: '7' }], DEEP);
  c.drawFor(0);
  c.drawFor(0);
  check('cover draw: a second click draws again (hasDrawn must not block it)',
    c.state.seats[0].hand.length === 3, 'hand=' + c.state.seats[0].hand.length);
}

{
  const c = coverState([{ id: 913, suit: 'rose', rank: '7' }], DEEP);
  c.drawFor(0);
  c.drawFor(0);
  c.drawFor(0);
  const hand = c.state.seats[0].hand;
  check('cover draw: only covering cards stay playable',
    hand.filter(x => c.canPlay(x)).map(x => x.id).join() === String(COVER.id),
    'playable=' + JSON.stringify(hand.filter(x => c.canPlay(x)).map(x => x.id)));
}

{
  // Nothing left to draw and nothing to recycle — the Ass stays bare.
  const c = coverState([{ id: 914, suit: 'rose', rank: '7' }], []);
  c.drawFor(0);
  check('cover draw: an empty pile ends the turn instead of drawing',
    c.state.seats[0].hand.length === 1 && c.state.message === c.M(0, 'coverFail'),
    'hand=' + c.state.seats[0].hand.length + ' msg=' + c.state.message);
}

{
  // The bot has no cover in hand, so drawing straight to the first cover is
  // still the right (and unchanged) behaviour for it.
  const c = coverState([], DEEP);
  const r = c.drawUntilCover(1);
  check('bot: drawUntilCover still draws through to the first cover',
    r.n === 3 && r.found && r.found.id === COVER.id, 'n=' + r.n + ' found=' + JSON.stringify(r.found));
}

process.exit(failed ? 1 : 0);
