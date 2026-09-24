// Tests: au en gmüetliche Bot spielt kei bluttes Ass, wo er nachhär nöd cha
// decke (#36). Zuefällig spiele isch schwach — s eigne Ass nöd decke chöne
// isch nöd schwach, das isch e Selbstschädigung.
import fs from 'node:fs';

// Usage: node scripts/sim/test-bot-ace.mjs [index.html]
const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const src = fs.readFileSync(INDEX, 'utf8').match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

let now = 0, seq = 0, timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), i: seq++, fn }); return seq; };
globalThis.setInterval = () => 0;
globalThis.clearTimeout = () => {};
function drain(limit = 400) { let n = 0; while (timers.length && n++ < limit) { timers.sort((a, b) => a.at - b.at || a.i - b.i); const t = timers.shift(); now = t.at; t.fn(); } }
globalThis.window = { innerHeight: 900, innerWidth: 1400, addEventListener() {}, removeEventListener() {} };
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

const TOP = { id: 900, suit: 'rose', rank: '6' };
const ACE = { id: 910, suit: 'rose', rank: 'A' };        // spielbar: Farb rose
const SAFE = { id: 911, suit: 'schilte', rank: '6' };    // spielbar: Rang 6, deckt s Ass aber NÖD
const COVER = { id: 912, suit: 'rose', rank: '9' };      // rose -> würd s Ass decke

function seatAt(difficulty, hand) {
  timers = [];
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty, mySeat: 0, roundNum: 1, starter: 0,
    seats: [
      { name: 'Du', kind: 'human', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'Bot', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  c.startRound(); drain(); timers = [];
  c.setState({
    phase: 'play', turn: 1, cover: null, wish: null, pending7: 0, hasDrawn: false,
    discard: [TOP], pile: [{ id: 800, suit: 'eichle', rank: '7' }],
    seats: c.state.seats.map((x, i) => i === 1 ? { ...x, hand: hand.slice() } : { ...x, hand: [{ id: 950, suit: 'eichle', rank: '9' }] }),
  });
  return c;
}

function picks(c, n) {
  const cand = c.state.seats[1].hand.filter(x => c.canPlay(x));
  const out = { cand: cand.length, ace: 0 };
  for (let i = 0; i < n; i++) if (c.botPick(cand).id === ACE.id) out.ace++;
  return out;
}

{
  // 1) Gmüetlich: s Ass isch spielbar, aber unsicher — und es git e Alternative.
  const c = seatAt('gmuetlich', [ACE, SAFE]);
  const r = picks(c, 200);
  check('both cards are legal here', r.cand === 2, 'cand=' + r.cand);
  check('gmuetlich never plays the unsafe Ass', r.ace === 0, r.ace + '/200 picks were the Ass');
}

{
  // 2) Gmüetlich: s Ass isch sicher (e rose Charte blibt i dr Hand) — denn
  //    darf er's spiele, s isch jo kei Problem.
  const c = seatAt('gmuetlich', [ACE, COVER]);
  const r = picks(c, 200);
  check('a safe Ass is still on the table for gmuetlich', r.ace > 0, r.ace + '/200');
}

{
  // 3) Gmüetlich: s Ass isch s einzig Legali — de spielt er's natürli.
  const c = seatAt('gmuetlich', [ACE, { id: 913, suit: 'schilte', rank: 'K' }]);
  const r = picks(c, 50);
  check('gmuetlich plays an Ass with no alternative', r.cand === 1 && r.ace === 50,
    'cand=' + r.cand + ' ace=' + r.ace);
}

{
  // 4) Gwieft blibt unveränderet: dä het d Sperr scho vorhär gha.
  const c = seatAt('gwieft', [ACE, SAFE]);
  const r = picks(c, 50);
  check('gwieft still refuses the unsafe Ass', r.ace === 0, r.ace + '/50');
  const c2 = seatAt('gwieft', [ACE, { id: 914, suit: 'schilte', rank: 'K' }]);
  const r2 = picks(c2, 50);
  check('gwieft still plays a forced Ass', r2.cand === 1 && r2.ace === 50, 'cand=' + r2.cand + ' ace=' + r2.ace);
}

process.exit(failed ? 1 : 0);
