// Tests for local hotseat multiplayer — two humans on one device (#2).
// See docs/design/hotseat/{wireframe,flow}.md
//
// The gate is a pure derivation of existing state, so most of these assert that
// it appears and disappears without any dedicated flag being set.
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

let now = 0, seq = 0, timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), i: seq++, fn }); return seq; };
globalThis.setInterval = () => 0;
globalThis.clearTimeout = () => {};
function drain(limit = 900) {
  let steps = 0;
  while (timers.length && steps++ < limit) {
    timers.sort((a, b) => a.at - b.at || a.i - b.i);
    const t = timers.shift(); now = t.at; t.fn();
  }
}
globalThis.window = {
  innerHeight: 900, innerWidth: 1400,
  addEventListener() {}, removeEventListener() {},
  localStorage: { getItem: () => null, setItem() {} },
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

function hotseat(names = ['Vreni', 'Res']) {
  const c = new Component({ startcharte: '5' });
  c.setState({ hotseatNames: names.slice() });
  c.startHotseat();
  return c;
}
const gate = c => c.renderVals().showReveal;

{
  const c = hotseat();
  const s = c.state;
  check('two local seats are created', s.seats.length === 2 && s.seats.every(x => x.kind === 'local'),
    JSON.stringify(s.seats.map(x => x.kind)));
  check('the entered names are used', s.seats.map(x => x.name).join() === 'Vreni,Res',
    s.seats.map(x => x.name).join());
  check('mode is hotseat', s.mode === 'hotseat', s.mode);
  check('both hands are dealt', s.seats.every(x => x.hand.length === 5),
    JSON.stringify(s.seats.map(x => x.hand.length)));
}

{
  // Blank or whitespace names fall back rather than producing an empty label.
  const c = hotseat(['', '   ']);
  check('blank names fall back to Spiler 1 / Spiler 2',
    c.state.seats.map(x => x.name).join() === 'Spiler 1,Spiler 2',
    c.state.seats.map(x => x.name).join());
}

{
  // The gate: hidden on your own turn, shown when the turn moves.
  const c = hotseat();
  check('no gate at the start of a round', !gate(c));
  c.setState({ turn: 1 });
  check('gate appears when the turn moves to the other seat', gate(c));
  const v = c.renderVals();
  check('gate names the incoming player', v.revealTitle === 'Gib s Grät em Res', v.revealTitle);
  check('gate shows counts, never card faces',
    /^Res het \d+ Charte · Du hesch \d+$/.test(v.revealCounts), v.revealCounts);
}

{
  // The 8 / cover-draw / "nomol dra" case: turn stays on the same seat.
  const c = hotseat();
  c.setState({ turn: 0, mySeat: 0 });
  check('no gate when the same player goes again', !gate(c));
}

{
  // Confirming hands the screen over.
  const c = hotseat();
  c.setState({ turn: 1, tip: 'alte Tipp', hintId: 99 });
  c.revealTurn();
  check('revealTurn moves mySeat to the active seat', c.state.mySeat === 1, 'mySeat=' + c.state.mySeat);
  check('the gate closes after revealing', !gate(c));
  check('the previous player\'s hint is cleared',
    c.state.tip === null && c.state.hintId === null,
    'tip=' + c.state.tip + ' hintId=' + c.state.hintId);
}

{
  // Guards: revealTurn is a no-op outside hotseat and on your own turn.
  const c = hotseat();
  c.setState({ turn: 0, mySeat: 0 });
  c.revealTurn();
  check('revealTurn does nothing on your own turn', c.state.mySeat === 0);

  const solo = new Component({ startcharte: '5' });
  solo.start('gwieft');
  solo.setState({ turn: 1 });
  solo.revealTurn();
  check('revealTurn does nothing outside hotseat', solo.state.mySeat === 0, 'mySeat=' + solo.state.mySeat);
}

{
  // A bot game must never show the gate, whoever's turn it is.
  const c = new Component({ startcharte: '5' });
  c.start('gwieft');
  c.setState({ turn: 1 });
  check('a bot game never shows the gate', !gate(c));
}

{
  // The round-end card owns the screen; the gate must not cover it.
  const c = hotseat();
  c.setState({ turn: 1, phase: 'roundEnd', roundEnd: { winner: 0, card: null } });
  check('no gate while the round-end card is up', !gate(c));
}

{
  // No coach between two humans.
  const c = hotseat();
  check('the hint button is hidden in hotseat', c.renderVals().showHint === false);
  const solo = new Component({ startcharte: '5' });
  solo.start('gwieft');
  check('the hint button still shows in a solo game',
    solo.renderVals().showHint === true, String(solo.renderVals().showHint));
}

{
  // Names are editable before starting.
  const c = new Component({ startcharte: '5' });
  c.setState({ hotseatNames: ['Spiler 1', 'Spiler 2'] });
  c.setHotseatName(1, 'Chäthi');
  check('editing a name updates only that seat',
    c.state.hotseatNames.join() === 'Spiler 1,Chäthi', c.state.hotseatNames.join());
}

{
  // Integration: play a whole round as two humans. Nothing auto-plays in
  // hotseat, so a stall here would be invisible to the unit tests above.
  timers = [];
  const c = hotseat();
  drain();
  let gates = 0, plays = 0, leaked = null, stuck = null;

  for (let step = 0; step < 4000; step++) {
    const s = c.state;
    if (s.phase === 'roundEnd' || s.roundEnd) break;
    if (s.phase === 'wish') { c.pickWish('rose'); drain(); continue; }
    const v = c.renderVals();
    if (v.showReveal) {
      gates++;
      if (/Ass|Under|Ober|Künig|Banner/.test(v.revealCounts)) { leaked = v.revealCounts; break; }
      c.revealTurn(); drain(); continue;
    }
    if (s.turn !== s.mySeat) { stuck = 'turn=' + s.turn + ' mySeat=' + s.mySeat; break; }
    // A human presses Tschau! at one card; without it, going out incurs the
    // forgot-penalty (+2) and the round never ends.
    if (v.showTschau) { c.sayTschau(); drain(); continue; }
    const hand = s.seats[s.mySeat].hand;
    const playable = hand.filter(x => c.canPlay(x));
    if (playable.length) { c.tryPlay(playable[0].id); plays++; }
    else if (!s.hasDrawn) { c.drawClick(); }
    else { c.passTurn(); }
    drain();
  }

  const s = c.state;
  check('integration: a full hotseat round reaches an end', !!s.roundEnd || s.phase === 'roundEnd',
    'phase=' + s.phase + ' plays=' + plays);
  check('integration: the turn never advances without a gate', stuck === null, stuck);
  check('integration: the gate never shows a card face', leaked === null, leaked);
  check('integration: the device changed hands at least once', gates > 0, 'gates=' + gates);
  const all = [...s.seats.flatMap(x => x.hand), ...s.pile, ...s.discard];
  check('integration: all 36 cards are still accounted for', all.length === 36, 'total=' + all.length);
}

process.exit(failed ? 1 : 0);
