// Tests für de Iiladigs-Link (#41): dr Host teilt e URL mit em Offer-Code im
// Fragment, dr Gascht macht si uf und findet de Code scho iigfüegt vor.
//
// Was hier NÖD prüefbar isch: d Markup-Chnöpf sälber und de echti WebRTC-
// Handshake. S Erschte deckt check-dc-sync.sh ab, s Zweite blibt e Handprob.
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const src = fs.readFileSync(INDEX, 'utf8').match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

let now = 0, seq = 0, timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), i: seq++, fn }); return seq; };
globalThis.setInterval = () => 0;
globalThis.clearTimeout = () => {};
globalThis.clearInterval = () => {};

let replaced = [];
function stubWindow(hash) {
  replaced = [];
  globalThis.window = {
    innerHeight: 900, innerWidth: 1400,
    addEventListener() {}, removeEventListener() {},
    location: { origin: 'https://github.freaxnx01.ch', pathname: '/game-tschau-sepp/', search: '', hash },
    history: { replaceState: (a, b, url) => { replaced.push(url); globalThis.window.location.hash = ''; } },
  };
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
}

class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(update, cb) { const p = typeof update === 'function' ? update(this.state) : update; this.state = { ...this.state, ...p }; cb && cb(); }
  forceUpdate() {}
}
stubWindow('');
const Component = new Function('DCLogic', 'StreamableLogic', 'React', src + '\n;return Component;')(DCLogic, DCLogic, {});

let failed = false;
function check(name, cond, detail) { if (cond) { console.log('PASS ' + name); return; } failed = true; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); }
// E fählendi Methode isch e Fehlschlag, kei Absturz — susch verliert dr
// RED-Schritt sini Läsbarkeit.
function attempt(name, fn) {
  try { return fn(); }
  catch (e) { failed = true; console.log('FAIL ' + name + ': threw ' + e.message); return null; }
}

// E echte Code-Form: TS1. + Base64, wo absichtlich es '+' und es '=' din het.
const CODE = 'TS1.abc+def/ghi=';

function boot(hash) {
  stubWindow(hash);
  timers = [];
  const c = new Component({ startcharte: '5' });
  c.componentDidMount();
  return c;
}

{
  // 1) Dr Link zeigt uf die glich Sitte, mit em Code im Fragment.
  const c = boot('');
  const link = attempt('joinLinkFor', () => c.joinLinkFor(CODE));
  check('the link points at this page with a #join fragment',
    link === 'https://github.freaxnx01.ch/game-tschau-sepp/#join=' + encodeURIComponent(CODE), link);
}

{
  // 2) S '+' im Base64 darf unterwegs nöd zunere Leerschlag werde.
  const c = boot('');
  const link = attempt('joinLinkFor', () => c.joinLinkFor(CODE)) || '';
  const payload = link.split('#join=')[1] || '';
  check('the payload round-trips, + and = included', decodeURIComponent(payload) === CODE, payload);
  check('the raw + is escaped in the link', payload !== '' && !payload.includes('+'), payload);
}

{
  // 3) Mit eme Link chunt me direkt uf «Spiel biitrette», Code scho drin.
  const c = boot('#join=' + encodeURIComponent(CODE));
  const mp = c.state.mp || {};
  check('an invite link opens the join stage', mp.stage === 'join-paste', 'stage=' + mp.stage);
  check('the code is prefilled', c.peerCode === CODE, 'peerCode=' + c.peerCode);
  check('and it is marked as coming from a link', mp.fromLink === true, JSON.stringify(mp));
  check('nothing was negotiated yet', !c.pc, 'pc=' + !!c.pc);
}

{
  // 4) E kaputti Fragment fällt uf de bestehend Fehlerwäg zrugg — nöd uf en neue.
  const c = boot('#join=nonsense');
  const mp = c.state.mp || {};
  check('a malformed fragment still opens the join stage', mp.stage === 'join-paste', 'stage=' + mp.stage);
  check('and reports no error at boot', !mp.error, 'error=' + mp.error);
}

{
  // 5) S Fragment wird sofort putzt: es Neulade sott nöd nomol biitrette.
  const c = boot('#join=' + encodeURIComponent(CODE));
  check('the fragment is cleared from the address bar', replaced.length === 1,
    JSON.stringify(replaced));
  check('and the cleaned url keeps path and search', replaced[0] === '/game-tschau-sepp/',
    replaced[0]);
}

{
  // 6) Ohni Fragment blibt alles wie bisher.
  const c = boot('');
  check('no fragment means the normal menu', !c.state.mp, JSON.stringify(c.state.mp));
  check('and nothing was rewritten', replaced.length === 0, JSON.stringify(replaced));
}

process.exit(failed ? 1 : 0);
