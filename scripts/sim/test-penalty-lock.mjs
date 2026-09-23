// Regression test (#32): während ere lauffende Strof-Animation darf en Iigab
// vom Spiler nöd wirke — en Klick uf de Zugstapel derf kei extra Charte zieh,
// dr Zug nöd wiitergäh und kei Ass-Deckig ufhebe.
//
// D Position isch komplett festgnaglet (Hand, Ablage, Stapel), wil `startRound()`
// jedes Mal neu mischlet: ohni das verglichti mer zwei verschiedeni Spiel.
import fs from 'node:fs';

// Usage: node scripts/sim/test-penalty-lock.mjs [index.html]
const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

// Virtuelli Uhr: d Timer wärded gsammlet statt usgfüehrt, so chame en Klick
// ganz gnau is Animations-Fenschter inne lege.
let now = 0;
let seq = 0;
const timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), fn, id: ++seq }); return seq; };
globalThis.setInterval = () => 0;
globalThis.clearTimeout = (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
globalThis.window = { innerHeight: 900, innerWidth: 1400, addEventListener() {}, removeEventListener() {} };
globalThis.document = { addEventListener() {}, removeEventListener() {} };

function advance(ms) {
  const target = now + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at || a.id - b.id);
    if (!timers.length || timers[0].at > target) break;
    const t = timers.shift();
    now = t.at;
    t.fn();
  }
  now = target;
}

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

const TOP = { id: 900, suit: 'rose', rank: '6' };
// Zugstapel: es wird vo hinte zoge (pop). Erschti zwei sind absichtlich
// NÖD deckend (kei Ass, kei Under, nöd rose), di dritt deckt.
const PILE = [
  { id: 806, suit: 'schaelle', rank: 'B' }, { id: 805, suit: 'schaelle', rank: 'K' },
  { id: 804, suit: 'rose', rank: '9' },
  { id: 803, suit: 'eichle', rank: 'K' }, { id: 802, suit: 'schilte', rank: '6' },
];
const OPP = [{ id: 850, suit: 'eichle', rank: '9' }, { id: 851, suit: 'schilte', rank: 'K' }];

// 2-Spiler-Position, dr Mänsch (Sitz 0) am Zug mit genau einere Charte.
function seat0With(rank, said) {
  now = 0;
  timers.length = 0;
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 0, roundNum: 1, starter: 0,
    seats: [
      { name: 'Mänsch', kind: 'human', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'Bot', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  c.startRound();
  advance(5000);
  timers.length = 0;
  now = 0;
  const card = { id: 'T1', rank, suit: 'rose' };
  c.setState({
    phase: 'play', turn: 0, cover: null, wish: null, wisher: null,
    pending7: 0, sevenChain: 0, pendingWinner: null, hasDrawn: false, roundEnd: null,
    discard: [TOP], pile: PILE.slice(),
    seats: [
      { ...c.state.seats[0], hand: [card], said },
      { ...c.state.seats[1], hand: OPP.slice() },
    ],
  });
  return { c, card };
}

function snapshot(c) {
  const s = c.state;
  return { hand: s.seats[0].hand.length, turn: s.turn, cover: s.cover, hasDrawn: s.hasDrawn, phase: s.phase };
}

// Ei Mal mit eme Klick mittendrin, ei Mal ohni — beidi Läuf müend im gliche
// Zuestand ände.
function compare(label, rank, said) {
  const clicked = seat0With(rank, said);
  clicked.c.playCard(0, clicked.card);
  advance(300);
  clicked.c.drawClick();
  advance(4000);
  const got = snapshot(clicked.c);

  const baseline = seat0With(rank, said);
  baseline.c.playCard(0, baseline.card);
  advance(4000);
  const want = snapshot(baseline.c);

  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: klickt=${JSON.stringify(got)} ohni=${JSON.stringify(want)}`);
  return ok;
}

// E Rundä wo mittendrin ändet derf d Sperri nöd i di nöchschti mitnäh —
// susch isch dr Tisch für immer gsperrt.
function roundClearsTheLock() {
  const { c } = seat0With('8', true);
  c.setState({ busy: true });
  c.startRound();
  const ok = c.state.busy === false;
  console.log(`${ok ? 'PASS' : 'FAIL'} nöii Rundä löst d Sperri: busy=${c.state.busy} (erwartet false)`);
  return ok;
}

let failed = false;
if (!compare('Achti als letschti Charte', '8', true)) failed = true;
if (!compare('«Tschau» vergässe', 'K', false)) failed = true;
if (!compare('blutts Ass', 'A', true)) failed = true;
if (!roundClearsTheLock()) failed = true;

// Während em Sperr-Fenschter söll dr Tisch gar nöd zum Klicke iilade.
function renderLocked() {
  const { c, card } = seat0With('8', true);
  c.playCard(0, card);
  advance(300);
  const cursor = c.renderVals().drawCursor;
  const ok = cursor === 'default';
  console.log(`${ok ? 'PASS' : 'FAIL'} Zugstapel gsperrt: drawCursor=${cursor} (erwartet default)`);
  return ok;
}

// E Hand us einere Charte ohni «Tschau» isch im Ass-Fenschter erreichbar —
// dr Knopf söll det verschwinde, nöd bloss nüt tue.
function tschauHiddenWhileBusy() {
  const { c } = seat0With('8', true);
  const seats = c.state.seats.map((x, i) => i === 0 ? { ...x, hand: [{ id: 'T2', rank: '6', suit: 'rose' }], said: false } : x);
  c.setState({ seats, phase: 'play', turn: 0, busy: true });
  const shown = c.renderVals().showTschau;
  const ok = shown === false;
  console.log(`${ok ? 'PASS' : 'FAIL'} Tschau-Knopf gsperrt: showTschau=${shown} (erwartet false)`);
  return ok;
}

if (!renderLocked()) failed = true;
if (!tschauHiddenWhileBusy()) failed = true;

process.exit(failed ? 1 : 0);
