// Tests for the Umami round-end payload: online (host) rounds carry the player
// count plus each seat's nickname and score; names typed in by players go out
// only as 'custom'. Local rounds carry no player data, and a missing
// window.gameAnalytics (blocked g.js) is a silent no-op.
import fs from 'node:fs';

const INDEX = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const html = fs.readFileSync(INDEX, 'utf8');
const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

globalThis.setTimeout = () => 0;
globalThis.setInterval = () => 0;
globalThis.clearTimeout = () => {};
const events = [];
globalThis.window = {
  innerHeight: 900, innerWidth: 1400,
  addEventListener() {}, removeEventListener() {},
  localStorage: { getItem: () => null, setItem() {} },
  gameAnalytics: { track: (n, d) => events.push([n, d]), trackOnce: (n, d) => events.push([n, d]), input: () => 'mouse' },
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
  console.log('FAIL ' + name + (detail ? ' — ' + detail : ''));
}

const seat = (name, score, hand) => ({ name, kind: 'remote', hand, said: false, status: 'ok', score, rounds: 0 });
const card = (id, suit, rank) => ({ id, suit, rank });

function endRoundIn(mode, seats) {
  const g = new Component({});
  g.setState({ mode, seats, mySeat: 0, roundNum: 3, history: [], discard: [card(1, 'rose', '9')], sendAll() {} });
  g.sendAll = () => {}; g.pushState = () => {};
  events.length = 0;
  g.endRound(0);
  return events.find(e => e[0] === 'round-end');
}

// Online round: pool name, numbered pool name, typed-in name.
const ev = endRoundIn('host', [
  seat('Turbo-Sepp', 10, []),
  seat('Jass-Vreni 2', 5, [card(2, 'eichle', 'A')]),
  seat('Hans Muster', 0, [card(3, 'rose', 'K')]),
]);
check('host round-end fires', !!ev);
const d = ev ? ev[1] : {};
check('players count', d.players === 3, JSON.stringify(d));
check('pool name sent as-is', d.p1Name === 'Turbo-Sepp', d.p1Name);
check('numbered pool name sent as-is', d.p2Name === 'Jass-Vreni 2', d.p2Name);
check('typed-in name masked as custom', d.p3Name === 'custom', d.p3Name);
check('winner score includes round points (11 + 4)', d.p1Score === 25, String(d.p1Score));
check('loser scores unchanged', d.p2Score === 5 && d.p3Score === 0, `${d.p2Score} ${d.p3Score}`);
check('no typed-in name anywhere in payload', !JSON.stringify(d).includes('Hans'));
check('game slug present', d.game === 'tschau-sepp');

// Local bot round: no player data.
const evBot = endRoundIn('bot', [seat('Du', 0, []), seat('Computer', 0, [card(4, 'rose', '6')])]);
check('bot round-end has no player data', evBot && !('players' in evBot[1]) && !('p1Name' in evBot[1]), JSON.stringify(evBot && evBot[1]));

// Blocked tracker: no throw.
delete globalThis.window.gameAnalytics;
let threw = false;
try { endRoundIn('host', [seat('Turbo-Sepp', 0, []), seat('custom me', 0, [])]); } catch (e) { threw = true; }
check('missing gameAnalytics is a no-op', !threw);

process.exit(failed ? 1 : 0);
