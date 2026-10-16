// Tests für s Zückerli: gwinnt öpper e Rundä und d Gägner händ 0 Pünkt i dr
// Hand, git dr Sieg trotzdem 2 Pünkt. Iistellbar im Menü, Standard: ii.
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

globalThis.setTimeout = () => 0;
globalThis.setInterval = () => 0;

// E localStorage-Ersatz, wo au cha ufwärfe wie imne privaten Fänschter.
function fakeStorage({ throws = false, seed = {} } = {}) {
  const store = { ...seed };
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
function attempt(name, fn) {
  try { return fn(); }
  catch (e) { failed = true; console.log('FAIL ' + name + ': threw ' + e.message); return null; }
}

const card = (rank, id) => ({ id, suit: 'rose', rank });

function fresh(storage = fakeStorage()) {
  globalThis.window.localStorage = storage;
  const c = new Component({ startcharte: '5' });
  c.state = { ...c.state, sound: false, mode: 'bot', mySeat: 0, roundNum: 1 };
  return c;
}

// Sitz 0 gwinnt, Sitz 1 bhaltet `oppHand`.
function finish(c, oppHand) {
  c.state = {
    ...c.state, phase: 'play', history: [], discard: [card('9', 99)],
    seats: [
      { name: 'Du', kind: 'local', hand: [], said: true, status: 'ok', score: 0, rounds: 0 },
      { name: 'Bot', kind: 'bot', hand: oppHand, said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  attempt('endRound', () => c.endRound(0));
  return c.state;
}

{
  // 1) Standard isch ii.
  const c = fresh();
  check('the Zückerli is on by default', c.state.zueckerli === true, 'zueckerli=' + c.state.zueckerli);
}

{
  // 2) 0 Pünkt bim Gägner, Zückerli ii → 2 Pünkt.
  const s = finish(fresh(), [card('6', 1), card('7', 2), card('9', 3)]);
  check('a win over a 0-point hand scores 2', s.seats[0].score === 2, 'score=' + s.seats[0].score);
  check('the round end records the Zückerli', s.roundEnd && s.roundEnd.pts === 2 && s.roundEnd.zueckerli === true,
    JSON.stringify(s.roundEnd && { pts: s.roundEnd.pts, z: s.roundEnd.zueckerli }));
}

{
  // 3) 0 Pünkt, Zückerli us → 0 Pünkt wie bisher.
  const c = fresh();
  attempt('setZueckerli', () => c.setZueckerli(false));
  const s = finish(c, [card('6', 1)]);
  check('with the Zückerli off a 0-point win stays 0', s.seats[0].score === 0, 'score=' + s.seats[0].score);
  check('and no Zückerli is recorded', s.roundEnd && !s.roundEnd.zueckerli);
}

{
  // 4) Meh als 0 Pünkt → unveränderet, au mit Zückerli.
  const s = finish(fresh(), [card('A', 1), card('6', 2)]);
  check('a normal win keeps its points', s.seats[0].score === 11, 'score=' + s.seats[0].score);
  check('and is no Zückerli', s.roundEnd && !s.roundEnd.zueckerli);
}

{
  // 5) D Wahl wird gspeicheret und überläbt es Neulade.
  const storage = fakeStorage();
  const c = fresh(storage);
  attempt('setZueckerli', () => c.setZueckerli(false));
  check('the choice is stored', storage._dump().tschauSeppZueckerli === 'off', JSON.stringify(storage._dump()));
  const again = fresh(storage);
  again.componentDidMount();
  check('and restored after a reload', again.state.zueckerli === false, 'zueckerli=' + again.state.zueckerli);
}

{
  // 6) En kaputte oder blockierte Speicher fallt uf dr Standard zrugg.
  const junk = fresh(fakeStorage({ seed: { tschauSeppZueckerli: 'banane' } }));
  junk.componentDidMount();
  check('a junk stored value means the default', junk.state.zueckerli === true);
  const blocked = fresh(fakeStorage({ throws: true }));
  blocked.componentDidMount();
  attempt('setZueckerli (blocked storage)', () => blocked.setZueckerli(false));
  check('blocked storage still applies the choice for the session', blocked.state.zueckerli === false);
}

{
  // 7) Nume im Menü änderbar — e laufigi Partie bhaltet iri Regle.
  const c = fresh();
  c.state = { ...c.state, phase: 'play' };
  attempt('setZueckerli', () => c.setZueckerli(false));
  check('the toggle is locked outside the menu', c.state.zueckerli === true);
}

{
  // 8) D Aazeig im Menü und am Rundänänd.
  const c = fresh();
  c.state = { ...c.state, seats: [], phase: 'menu' };
  const opts = attempt('renderVals', () => c.renderVals().zueckerliOptions) || [];
  check('the menu offers Ii and Us', opts.map(o => o.label).join('/') === 'Ii/Us', JSON.stringify(opts.map(o => o.label)));
  check('with Ii pressed by default', opts[0] && opts[0].pressed === 'true' && opts[1].pressed === 'false');
  const s = finish(fresh(), [card('6', 1)]);
  const c2 = fresh(); c2.state = { ...c2.state, ...s };
  const pts = attempt('renderVals', () => c2.renderVals().roundEndPts) || '';
  check('the round end names the Zückerli', /\+2 Pünkt/.test(pts) && /Zückerli/.test(pts), pts);
}

process.exit(failed ? 1 : 0);
