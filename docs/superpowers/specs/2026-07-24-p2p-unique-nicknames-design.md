# P2P unique nicknames — design

Issue: [#4](https://github.com/freaxnx01/game-tschau-sepp/issues/4) — playing zu dritt
(3 players) via P2P, two seats ended up with the same nickname.

## Problem

`funnyName()` (index.html:425) picks a random name from a fixed 12-name pool. Each
client (host and every guest) calls it independently with no visibility into names
already taken by other seats in the session, so collisions can happen — especially
with 3+ players drawing from the same small pool.

## Root cause

The host is authoritative over `seats` and already receives each guest's chosen name
in the `hello` message before assigning a seat (`onGuestMsg`, index.html:1267), but it
currently accepts that name as-is with no collision check.

## Design

Dedup happens host-side, at the single point where seats are assigned — no protocol
round-trip or client-side coordination needed.

### State: track custom vs. auto-picked names

Add a `myNameCustom` boolean to state:
- `true` when the player edits the name text input directly.
- `false` when the name is left blank (auto-filled via `funnyName()`) or explicitly
  re-rolled via the "random name" button — both cases are still pool-sourced and fair
  game to rename on collision.

### Protocol: send the flag along with the name

The `hello` payload gains a `custom` field: `{t: 'hello', name, custom}`.

### New helper: `uniqueFunnyName(existingNames)`

Filters the 12-name pool down to names not already present in `existingNames`
(case-insensitive, trimmed), then picks randomly among the remainder. If the pool is
exhausted — not currently reachable, since the seat cap is 4 and the pool has 12
names, but kept as a safety fallback — falls back to appending a numeric suffix:
`"<name> 2"`, `"<name> 3"`, etc., incrementing until unique.

### Dedup point: `onGuestMsg`

Before building the new seat for an incoming `hello`:
- If `d.name` collides (case-insensitive, trimmed) with an existing seat name **and**
  `!d.custom` → replace it via `uniqueFunnyName(seats.map(s => s.name))`.
- If `d.custom` is `true` → keep the name as typed even if it collides. A player who
  deliberately typed a name gets to keep it; only auto-picked names are silently
  renamed.

The host's own seat (always seat 0, created first in `mpHostStart`) never needs
dedup — there are no other seats yet when it's created.

## Error handling

No new failure modes. The numeric-suffix fallback guarantees a name is always
produced even in the (currently unreachable) exhausted-pool case.

## Testing

Manual, using 3 P2P clients (1 host + 2 guests):
- All three leave their name blank or use the "random name" button (small pool makes
  collisions easy to trigger) → confirm no two seats ever end up with the same name
  across repeated joins.
- One guest deliberately types a name matching an existing seat's name → confirm it
  is kept unchanged (not silently renamed).
