// Umami analytics helper (self-hosted, stats.freaxnx01.ch).
// Never breaks the game: if g.js is blocked, offline or down, every call is a
// silent no-op. No personal data — callers pass only coarse game facts.
(function () {
  var sent = {};
  var input = null;

  function track(name, data) {
    try {
      if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, data);
    } catch (e) { }
  }

  function trackOnce(name, data) {
    if (sent[name]) return;
    sent[name] = true;
    track(name, data);
  }

  // Input type from the first real input, not from the user agent.
  function onPointer(e) { if (!input) input = e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse'; }
  function onKey() { if (!input) input = 'keyboard'; }
  try {
    window.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
    window.addEventListener('keydown', onKey, { capture: true, passive: true });
  } catch (e) { }

  window.gameAnalytics = {
    track: track,
    trackOnce: trackOnce,
    input: function () { return input || 'unknown'; },
  };
})();
