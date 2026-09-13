// Tests that React is served from the repo, not from a CDN (#8).
// See docs/superpowers/specs/2026-09-13-vendor-react-design.md
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));

let failed = false;
function check(name, cond, detail) {
  if (cond) { console.log('PASS ' + name); return; }
  failed = true;
  console.log('FAIL ' + name + (detail ? ': ' + detail : ''));
}

const VENDOR = {
  'vendor/react.production.min.js': 'REACT_SRI',
  'vendor/react-dom.production.min.js': 'REACT_DOM_SRI',
};

const support = read('support.js');

// The vendored bytes must be exactly what the runtime already pins.
Object.entries(VENDOR).forEach(([file, sriConst]) => {
  check(file + ' is committed', exists(file));
  if (!exists(file)) return;
  const digest = 'sha384-' + crypto.createHash('sha384')
    .update(fs.readFileSync(path.join(ROOT, file))).digest('base64');
  const pinned = (support.match(new RegExp(sriConst + ' = "([^"]+)"')) || [])[1];
  check(file + ' matches the SRI ' + sriConst + ' pinned in support.js',
    pinned != null && digest === pinned, 'computed=' + digest + ' pinned=' + pinned);
});

// The pages must load them locally, before support.js boots the runtime.
const pages = {
  'index.html': './vendor/',
  'source/Tschau Sepp Online.dc.html': '../vendor/',
};
Object.entries(pages).forEach(([page, prefix]) => {
  const html = read(page);
  ['react.production.min.js', 'react-dom.production.min.js'].forEach(f => {
    check(page + ' loads ' + f + ' from ' + prefix,
      html.includes(prefix + f), 'missing ' + prefix + f);
  });
  const reactAt = html.indexOf(prefix + 'react.production.min.js');
  // Match the actual tag, not the word: the surrounding comment mentions support.js too.
  const supportAt = html.indexOf('<script src="./support.js">');
  check(page + ' loads React before support.js',
    reactAt !== -1 && supportAt !== -1 && reactAt < supportAt,
    'react@' + reactAt + ' support@' + supportAt);
  check(page + ' keeps integrity on the vendored tags',
    (html.match(/integrity="sha384-/g) || []).length >= 2,
    'found ' + (html.match(/integrity="sha384-/g) || []).length);
});

// No page may reach for React over the network any more.
['index.html', 'source/Tschau Sepp Online.dc.html'].forEach(page => {
  check(page + ' makes no unpkg reference', !read(page).includes('unpkg.com'));
});

// support.js stays generated output — untouched.
check('support.js still declares its CDN constants as a fallback',
  support.includes('REACT_URL') && support.includes('unpkg.com'));

process.exit(failed ? 1 : 0);
