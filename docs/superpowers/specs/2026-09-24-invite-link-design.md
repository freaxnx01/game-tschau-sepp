# Design: invite link carrying the offer code

Issue: [#41](https://github.com/freaxnx01/game-tschau-sepp/issues/41)
Date: 2026-09-24

## Background

Starting a P2P game today means the host copies a `TS1.…` offer code out of the
lobby and sends it by hand; the guest opens the game, picks *Spiel biitrette*,
pastes it, and sends the answer code back. The paste step is where people lose
the thread — the code is long, and chat clients wrap it.

This replaces the host's half of that with a link. The guest's half is unchanged:
they still send the answer code back, because a link cannot carry a reply.

## The link

```text
https://github.freaxnx01.ch/game-tschau-sepp/#join=TS1.<payload>
```

**A fragment, not a query parameter.** A fragment is never sent to the server, so
the offer stays out of GitHub Pages' access logs and out of `Referer` headers on
anything the page later loads. A `?join=` would put a live SDP offer into request
logs it has no business being in.

**The payload is the existing code, percent-encoded.** `enc()` produces
`TS1.` + standard base64, whose alphabet includes `+`, `/` and `=`. Those are
legal in a fragment, but `+` is the one character that silently becomes a space
if anything ever re-parses the value as a query string. Building the link with
`encodeURIComponent()` and reading it with `decodeURIComponent()` removes that
class of bug without touching the code format: no `TS2.` version, and `dec()` is
not modified.

## Flow

**Host.** The lobby's primary action becomes **Link kopiere**. The raw code stays
available behind a **Code zeige** toggle — needed when a messenger mangles the
URL, and for a guest still on an older deployed build that ignores the fragment.
The link is built from the already-generated `myCode`; nothing about offer
creation changes.

**Guest.** Opening the link boots the game, which reads the fragment in
`componentDidMount()` and goes straight to the *Spiel biitrette* stage with the
code already in the field, read-only. The person then taps **Biitrette**, which
runs the existing `mpJoin()` unchanged.

**The tap is deliberate.** The alternative — negotiating as soon as the page
loads — would mean a link from anywhere starts a WebRTC session with whatever SDP
it carried, before the person agreed to anything. One tap keeps joining an
explicit act, and costs a guest who wanted to join nothing.

**The fragment is cleared immediately**, with
`history.replaceState(null, '', location.pathname + location.search)`, before the
join is attempted. A reload then returns to the normal menu instead of silently
re-joining a dead offer, and the code stops riding along in the address bar.

## Failure cases

- **Malformed or truncated fragment.** Prefill it anyway and let `mpJoin()`'s
  existing validation speak — `dec()` already throws on anything that is not
  `TS[01].<base64>`, and the lobby already has the message for it
  (*«Dä Code isch nöd gültig — bitte dr ganz Code iifüege.»*). One error path, not
  two.
- **Expired offer.** Offer codes live 10 minutes, tracked by the *host's*
  `expiresAt`; the code itself carries no timestamp. A link opened later fails at
  connection time exactly as a pasted stale code does today. No new handling.
- **Fragment present but the game is mid-round.** `componentDidMount()` runs once
  at boot, before any round exists, so this cannot arise.

## Security

No new trust is introduced — the link makes an existing path reachable in one
tap rather than two.

- The fragment never reaches a server.
- `dec()` validates shape before anything is parsed, `JSON.parse` is inside the
  existing `try`, and nothing is `eval`'d — the stack guardrail holds.
- What a hostile link can do is what a hostile pasted code can do: get you into a
  game with someone you did not intend. The guest's client already renders what
  the host sends it; that trust boundary is unchanged by this feature, and
  tightening it is a separate concern.

## Non-goals

- No signalling server, no shortener, no PeerJS — the link carries the offer
  itself, exactly as the clipboard does today.
- The answer code stays copy-paste. A reply link would need the host's page to be
  reachable at a URL, which is what having no server rules out.
- No QR code. Same payload, different surface; worth its own issue if wanted.
- No change to `enc()`, `dec()`, the `TS1.` format, or offer expiry.

## Implementation note

This touches the `<x-dc>` markup — a new button and a toggle — and
**`scripts/bundle.sh` does not sync markup**. Per `AGENT-NOTES.md`, template
changes must be hand-edited identically into both
`source/Tschau Sepp Online.dc.html` and `index.html`, or `check-dc-sync.sh` fails
with a `{{ placeholder }}` mismatch. That guard working is not a broken bundler.

## Testing

New `scripts/sim/test-invite-link.mjs`, using the existing scaffold with a
stubbed `window.location` and `window.history`:

1. `joinLinkFor(code)` returns `<origin><path>#join=<encoded>`, and the encoded
   payload round-trips back to the original code through `decodeURIComponent()`.
2. A `+` in the payload survives the round trip — the regression the encoding
   exists to prevent.
3. Boot with `#join=<valid code>`: the join stage is active, the field carries
   the code, and no connection has been attempted.
4. Boot with `#join=` + garbage: the same stage is reached, and the existing
   invalid-code error appears once a join is attempted rather than at boot.
5. Boot clears the fragment: `history.replaceState` was called and
   `location.hash` no longer carries the code.
6. Boot with no fragment: the normal menu, unchanged.

Then the existing suites, `harness.mjs '' 500 20`, and `check-dc-sync.sh` —
which is the one that catches a markup edit applied to only one of the two files.

The real WebRTC handshake stays a manual check: two devices, host copies the
link, guest opens it and sends the answer back. That is this stack's documented
gate and no sim can stand in for it.

## Acceptance criteria

1. The host lobby shows **Link kopiere** as the primary action, with the raw code
   behind a **Code zeige** toggle.
2. The copied link is `<origin><path>#join=<percent-encoded offer code>`.
3. Opening that link lands on *Spiel biitrette* with the code prefilled and
   read-only, and does **not** start negotiating until the person taps
   **Biitrette**.
4. Tapping **Biitrette** produces the answer code exactly as pasting the code
   does today.
5. The fragment is removed from the address bar at boot, so a reload returns to
   the menu rather than re-joining.
6. A malformed fragment surfaces the existing invalid-code message, not a new one.
7. `scripts/sim/test-invite-link.mjs` covers criteria 2–6 and fails against the
   pre-change build.
8. All existing sim suites, `harness.mjs` (0 violations, 0 stalls) and
   `check-dc-sync.sh` pass — the last of these proves the markup edit landed in
   both files.
