// Tests for the start-menu control that chooses how many cards each player is
// dealt (#7). See docs/design/starting-cards/{wireframe,flow}.md
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

globalThis.setTimeout = () => 0;
globalThis.setInterval = () => 0;

// A localStorage stand-in we can also make throw, the way a private window does.
function fakeStorage({ throws = false, seed = null } = {}) {
  const store = seed == null ? {} : { tschauSeppStartCards: seed };
  return {
    getItem(k) { if (throws) throw new Error('denied'); return k in store ? store[k] : null; },
    setItem(k, v) { if (throws) throw new Error('denied'); store[k] = String(v); },
    _dump: () => store,
  };
}
globalThis.window = {
  innerHeight: 900, innerWidth: 1400, localStorage: fakeStorage(),
  addEventListener() {}, removeEventListener() {},
};
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

function fresh(props = { startcharte: '5' }, storage = fakeStorage()) {
  globalThis.window.localStorage = storage;
  const c = new Component(props);
  c.state = {
    ...c.state, sound: false, mode: 'bot', mySeat: 0,
    seats: [
      { name: 'Du', kind: 'local', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'Bot', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  return c;
}

{
  // Default is the current behaviour, unchanged.
  const c = fresh();
  check('default is 5', c.state.startCards === 5, 'startCards=' + c.state.startCards);
}

{
  // The dc prop still seeds the value — the sim harness varies it per game,
  // so losing this would silently collapse its 7-card coverage.
  check('dc prop 7 seeds the state', fresh({ startcharte: '7' }).state.startCards === 7);
  check('an invalid dc prop falls back to 5', fresh({ startcharte: '9' }).state.startCards === 5);
  check('a missing dc prop falls back to 5', fresh({}).state.startCards === 5);
}

{
  // Picking writes state and mirrors to storage.
  const st = fakeStorage();
  const c = fresh({ startcharte: '5' }, st);
  c.setStartCards(7);
  check('picking 7 updates the state', c.state.startCards === 7, 'startCards=' + c.state.startCards);
  check('picking 7 is persisted', st._dump().tschauSeppStartCards === '7',
    'stored=' + JSON.stringify(st._dump()));
}

{
  // A stored choice is restored on mount, overriding the prop default.
  const c = fresh({ startcharte: '5' }, fakeStorage({ seed: '7' }));
  c.componentDidMount();
  check('a stored 7 is restored on mount', c.state.startCards === 7, 'startCards=' + c.state.startCards);
}

{
  // Junk in storage must not leak into the game.
  const c = fresh({ startcharte: '5' }, fakeStorage({ seed: '99' }));
  c.componentDidMount();
  check('invalid stored value is ignored', c.state.startCards === 5, 'startCards=' + c.state.startCards);
}

{
  // Private windows throw on access — the control must still work for the session.
  const c = fresh({ startcharte: '5' }, fakeStorage({ throws: true }));
  let threw = false;
  try { c.componentDidMount(); c.setStartCards(7); } catch (e) { threw = true; }
  check('throwing storage does not break the control', !threw && c.state.startCards === 7,
    'threw=' + threw + ' startCards=' + c.state.startCards);
}

{
  // Flow doc, screen inventory: the count must stay frozen for a whole match,
  // since startRound() also runs for "Nöchsti Rundä".
  const c = fresh();
  c.setState({ phase: 'play' });
  c.setStartCards(7);
  check('the count cannot change mid-match', c.state.startCards === 5, 'startCards=' + c.state.startCards);
}

{
  // The value actually reaches the deal.
  [5, 7].forEach(n => {
    const c = fresh();
    c.setStartCards(n);
    c.startRound();
    const sizes = c.state.seats.map(x => x.hand.length);
    check('startRound deals ' + n + ' cards to each seat',
      sizes.every(x => x === n), 'sizes=' + JSON.stringify(sizes));
  });
}

{
  // The binding the template renders.
  const c = fresh();
  c.setState({ discard: [], pile: [], history: [] });
  const opts = c.renderVals().startCardOptions;
  check('two options are offered', opts.length === 2, 'n=' + opts.length);
  check('labels are 5 and 7', opts.map(o => o.label).join() === '5,7', opts.map(o => o.label).join());
  check('aria-pressed marks only the selected one',
    opts.map(o => o.pressed).join() === 'true,false', opts.map(o => o.pressed).join());
  opts[1].pick();
  check('clicking an option applies it', c.state.startCards === 7, 'startCards=' + c.state.startCards);
}

process.exit(failed ? 1 : 0);
