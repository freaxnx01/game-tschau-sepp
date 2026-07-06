/*
 * support.js — minimal runtime for the ".dc.html" design-component format.
 *
 * The game file (index.html) was authored as a design component: its markup lives
 * inside <x-dc>…</x-dc> using a small template DSL, and its logic is
 * `class Component extends DCLogic` in a <script type="text/x-dc"> tag. Both the
 * DSL engine and the DCLogic base class are provided by this file — they were not
 * shipped in the original handoff bundle, so this recreates them faithfully.
 *
 * Template DSL supported:
 *   {{ expr }}                     interpolation in text and attribute values
 *   <sc-if value="{{ cond }}">     conditional block (transparent wrapper)
 *   <sc-for list="{{ arr }}" as="x">  repeat block, binds `x` per item
 *   onClick="{{ handler }}"        click handler (handler resolves to a function)
 *   style-hover="…{{ }}…"          extra inline styles applied while hovered
 *   <helmet>…</helmet>             hoisted into <head> (fonts, <style>, <title>)
 *   hint-placeholder-* attributes  design-tool hints — ignored at runtime
 *
 * DCLogic base provides: state, setState(patch, cb), forceUpdate(), props,
 * mounted, and calls componentDidMount() after the first render.
 *
 * Rendering uses in-place positional reconciliation: nodes are reused and patched
 * rather than rebuilt, so CSS keyframe animations (dealDown/slap/popIn) only fire
 * on genuinely new nodes instead of restarting on every setState.
 */
(function () {
  'use strict';

  // Hide the raw <x-dc> source immediately so the literal template never flashes.
  try {
    var early = document.createElement('style');
    early.textContent = 'x-dc{display:none!important}';
    (document.head || document.documentElement).appendChild(early);
  } catch (e) {}

  // ---------- expression evaluation ----------
  var exprCache = Object.create(null);
  function getFn(expr) {
    var f = exprCache[expr];
    if (!f) {
      try {
        // non-strict Function body → `with` is permitted
        f = new Function('$s', 'with($s){ return (' + expr + '); }');
      } catch (e) {
        f = function () { return undefined; };
      }
      exprCache[expr] = f;
    }
    return f;
  }
  function evalExpr(expr, scope) {
    try { return getFn(expr)(scope); } catch (e) { return undefined; }
  }

  function stripBraces(s) {
    return s.replace(/^\s*\{\{/, '').replace(/\}\}\s*$/, '').trim();
  }

  // Compile a string that may contain {{ }} into a fast resolver.
  function compileText(str) {
    if (str.indexOf('{{') < 0) return { s: true, v: str };
    var parts = [], re = /\{\{([\s\S]*?)\}\}/g, last = 0, m;
    while ((m = re.exec(str))) {
      if (m.index > last) parts.push({ lit: str.slice(last, m.index) });
      parts.push({ expr: m[1].trim() });
      last = m.index + m[0].length;
    }
    if (last < str.length) parts.push({ lit: str.slice(last) });
    return { s: false, parts: parts };
  }
  function resolveText(ct, scope) {
    if (ct.s) return ct.v;
    var out = '';
    for (var i = 0; i < ct.parts.length; i++) {
      var p = ct.parts[i];
      if (p.lit != null) out += p.lit;
      else { var v = evalExpr(p.expr, scope); out += (v == null ? '' : v); }
    }
    return out;
  }

  // ---------- template compilation (source DOM → render thunks) ----------
  function compileNodes(nodes) {
    var thunks = [];
    for (var i = 0; i < nodes.length; i++) {
      var t = compileNode(nodes[i]);
      if (t) thunks.push(t);
    }
    return function (scope, out) {
      for (var i = 0; i < thunks.length; i++) thunks[i](scope, out);
    };
  }

  function compileNode(node) {
    // text
    if (node.nodeType === 3) {
      var ct = compileText(node.nodeValue);
      return function (scope, out) { out.push({ t: 'tx', text: resolveText(ct, scope) }); };
    }
    // comments / other → skip
    if (node.nodeType !== 1) return null;

    var tag = node.tagName.toLowerCase();
    if (tag === 'helmet') return null; // handled during mount

    if (tag === 'sc-if') {
      var condExpr = stripBraces(node.getAttribute('value') || 'false');
      var ifRender = compileNodes(toArray(node.childNodes));
      return function (scope, out) { if (evalExpr(condExpr, scope)) ifRender(scope, out); };
    }

    if (tag === 'sc-for') {
      var listExpr = stripBraces(node.getAttribute('list') || '[]');
      var asName = node.getAttribute('as') || 'item';
      var forRender = compileNodes(toArray(node.childNodes));
      return function (scope, out) {
        var arr = evalExpr(listExpr, scope);
        if (!arr || !arr.length) return;
        for (var i = 0; i < arr.length; i++) {
          var sub = Object.create(scope);
          sub[asName] = arr[i];
          sub.$i = i;
          forRender(sub, out);
        }
      };
    }

    // normal element — precompile attributes
    var dyn = [], stat = [], clickExpr = null, hoverCt = null;
    var attrs = node.attributes;
    for (var a = 0; a < attrs.length; a++) {
      var name = attrs[a].name, val = attrs[a].value;
      var lname = name.toLowerCase();
      if (lname === 'onclick') { clickExpr = stripBraces(val); continue; }
      if (lname === 'style-hover') { hoverCt = compileText(val); continue; }
      if (lname.indexOf('hint-placeholder') === 0) continue;      // design-tool hint
      if (lname === 'data-dc-script') continue;
      var ct2 = compileText(val);
      if (ct2.s) stat.push({ name: name, val: ct2.v });
      else dyn.push({ name: name, ct: ct2 });
    }
    var childRender = compileNodes(toArray(node.childNodes));

    return function (scope, out) {
      var attrObj = {};
      for (var i = 0; i < stat.length; i++) attrObj[stat[i].name] = stat[i].val;
      for (var j = 0; j < dyn.length; j++) attrObj[dyn[j].name] = resolveText(dyn[j].ct, scope);
      var kids = [];
      childRender(scope, kids);
      out.push({
        t: 'el', tag: tag, attrs: attrObj, children: kids,
        onclick: clickExpr ? evalExpr(clickExpr, scope) : null,
        hover: hoverCt ? resolveText(hoverCt, scope) : null,
      });
    };
  }

  function toArray(nl) { var r = []; for (var i = 0; i < nl.length; i++) r.push(nl[i]); return r; }

  // ---------- DOM creation & reconciliation ----------
  function applyAttrs(el, oldA, newA) {
    for (var k in newA) if (oldA[k] !== newA[k]) el.setAttribute(k, newA[k]);
    for (var o in oldA) if (!(o in newA)) el.removeAttribute(o);
  }

  function bind(el, vn) {
    el.__click = vn.onclick || null;
    if (vn.onclick && !el.__clickBound) {
      el.addEventListener('click', function (ev) { if (el.__click) el.__click(ev); });
      el.__clickBound = true;
    }
    el.__hover = vn.hover || null;
    if (vn.hover && !el.__hoverBound) {
      el.addEventListener('mouseenter', function () {
        if (el.__hover) el.style.cssText = (el.getAttribute('style') || '') + ';' + el.__hover;
      });
      el.addEventListener('mouseleave', function () {
        el.style.cssText = el.getAttribute('style') || '';
      });
      el.__hoverBound = true;
    }
  }

  function patch(el, vn) {
    if (vn.t === 'tx') {
      if (el.nodeType !== 3) return document.createTextNode(vn.text);
      if (el.data !== vn.text) el.data = vn.text;
      return el;
    }
    if (el.nodeType !== 1 || el.tagName.toLowerCase() !== vn.tag) return createEl(vn);
    applyAttrs(el, el.__attrs || {}, vn.attrs);
    el.__attrs = vn.attrs;
    bind(el, vn);
    diffChildren(el, vn.children);
    return el;
  }

  function createEl(vn) {
    if (vn.t === 'tx') return document.createTextNode(vn.text);
    var el = document.createElement(vn.tag);
    el.__attrs = {};
    return patch(el, vn);
  }

  function diffChildren(parent, vns) {
    var kids = parent.childNodes, i;
    for (i = 0; i < vns.length; i++) {
      var ex = kids[i];
      if (!ex) parent.appendChild(createEl(vns[i]));
      else { var np = patch(ex, vns[i]); if (np !== ex) parent.replaceChild(np, ex); }
    }
    while (kids.length > vns.length) parent.removeChild(kids[kids.length - 1]);
  }

  // ---------- DCLogic base class ----------
  function DCLogic() { this.mounted = true; }
  DCLogic.prototype.setState = function (patchObj, cb) {
    if (patchObj) { if (!this.state) this.state = {}; for (var k in patchObj) this.state[k] = patchObj[k]; }
    if (this._render) this._render();
    if (cb) cb();
  };
  DCLogic.prototype.forceUpdate = function () { if (this._render) this._render(); };
  window.DCLogic = DCLogic;

  // ---------- mount ----------
  function parseProps(scriptEl) {
    var props = {};
    try {
      var raw = scriptEl.getAttribute('data-props');
      if (raw) {
        var spec = JSON.parse(raw);
        for (var k in spec) props[k] = spec[k] && 'default' in spec[k] ? spec[k].default : undefined;
      }
    } catch (e) {}
    return props;
  }

  function mount() {
    var xdc = document.querySelector('x-dc');
    var scriptEl = document.querySelector('script[type="text/x-dc"]');
    if (!xdc || !scriptEl) return;

    // hoist <helmet> and any stray metadata into <head>
    var helmet = xdc.querySelector('helmet');
    if (helmet) { while (helmet.firstChild) document.head.appendChild(helmet.firstChild); }
    var strays = xdc.querySelectorAll('style, title, link[rel="stylesheet"], link[rel="preconnect"], meta');
    for (var s = 0; s < strays.length; s++) document.head.appendChild(strays[s]);

    var templateNodes = toArray(xdc.childNodes).filter(function (n) {
      return !(n.nodeType === 1 && n.tagName.toLowerCase() === 'helmet');
    });
    var render = compileNodes(templateNodes);

    var Component = new Function('DCLogic', scriptEl.textContent + '\nreturn Component;')(DCLogic);
    var inst = new Component();
    inst.props = parseProps(scriptEl);

    var root = document.createElement('div');
    root.id = 'dc-root';
    document.body.appendChild(root);

    inst._render = function () {
      var out = [];
      render(inst.renderVals(), out);
      diffChildren(root, out);
    };

    xdc.parentNode && xdc.parentNode.removeChild(xdc);
    window.dcApp = inst; // handy for debugging in the console
    inst.mounted = true;
    inst._render();
    if (typeof inst.componentDidMount === 'function') inst.componentDidMount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
