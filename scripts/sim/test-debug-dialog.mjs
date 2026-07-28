// Regression tests for the Debug-dialog fixes (issue #9):
//  - discarded cards are tagged with the seat that played them
//  - the Cards-tab tooltip names that seat
//  - the ESC-priority helper picks the innermost open dialog
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

function newGame() {
  const c = new Component({ startcharte: '5' });
  c.state = {
    ...c.state, sound: false, mode: 'bot', difficulty: 'gwieft', mySeat: 0, roundNum: 1, starter: 0,
    seats: [
      { name: 'Du', kind: 'local', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
      { name: 'Computer', kind: 'bot', hand: [], said: false, status: 'ok', score: 0, rounds: 0 },
    ],
  };
  c.startRound();
  return c;
}

let failed = false;
function check(label, cond) {
  if (!cond) { failed = true; console.log('FAIL ' + label); }
  else console.log('PASS ' + label);
}

// --- playedBy tagging + tooltip label ---
{
  const c = newGame();
  const who = c.state.turn;
  const own = c.state.seats[who].hand.filter(x => c.canPlay(x));
  if (!own.length) {
    console.log('SKIP playedBy tagging: no playable card in this deal');
  } else {
    const played = own[0];
    c.playCard(who, played);
    const entry = c.state.discard.find(x => x.id === played.id);
    check('discard entry carries playedBy', !!entry && entry.playedBy === who);

    const vm = c.renderVals();
    const cell = vm.debugCards.find(dc => dc.label.startsWith(c.rankName(played.rank) + ' ' + c.suitName(played.suit)));
    const expectedName = who === c.state.mySeat ? 'Du' : 'Computer';
    check('tooltip label names the player', !!cell && cell.label.endsWith('abgleit (' + expectedName + ')'));
  }
}

// --- ESC-priority helper ---
{
  const c = newGame();
  c.state = { ...c.state, confirmLeave: false, debugOpen: false, rules: false };
  check('no dialog open -> null', c.topDialogToClose() === null);
  c.state = { ...c.state, rules: true };
  check('rules only -> rules', c.topDialogToClose() === 'rules');
  c.state = { ...c.state, debugOpen: true };
  check('debug + rules -> debug', c.topDialogToClose() === 'debug');
  c.state = { ...c.state, confirmLeave: true };
  check('confirmLeave + debug + rules -> confirmLeave', c.topDialogToClose() === 'confirmLeave');
}

process.exit(failed ? 1 : 0);
