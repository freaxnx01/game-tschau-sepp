# Reshuffle Visibility — Design

## Background

Issue #13. When the draw pile runs out, the discard pile (minus its top card)
is shuffled and becomes the new draw pile. This is the correct Tschau-Sepp
rule — without it a long Siebni chain could not be paid — but the game says
nothing when it happens, and the debug journal records neither draws nor the
reshuffle itself.

The consequence is a false bug report. A card that was played, went to the
discard pile, was recycled into the draw pile and drawn again shows up
**twice** in the "Sit dim letschte Zug" history strip. To a player that reads
as a duplicate card in a 36-card deck.

This was reported by a tester with a screenshot (computer plays 8 Schilte →
Ass Schilte → 8 Schilte → 8 Schelle in one run) and investigated in
`docs/ai-notes/feedback/2026-08-28-doppelte-achti.md`. An instrumented run of
the CPU-vs-CPU harness over 10 000 rounds found **zero** deck-invariant
violations and 24 same-card-twice-in-one-run cases, **all 24** immediately
following a reshuffle. The deck is correct; the feedback is a visibility gap.

## Scope

Make the reshuffle observable, in three places:

1. A transient toast for the local player when the discard pile is recycled.
2. Debug-journal entries for draws and for reshuffles.
3. Parity for the P2P guest, who never runs the reshuffle themselves.

and one behavioural change to the reshuffle itself (§ 1b): recently played
cards are pushed to the bottom of the new draw pile instead of landing anywhere
in it. The visibility work explains a recycled card; the ordering rule stops
the most jarring case from happening in the first place.

**Out of scope** (deliberately, recorded so it is not re-litigated):

- Changing *whether* the discard pile is recycled. Recycling stays; only the
  **order** the recycled cards come back in changes (§ 1b).
- Syncing `debugLog` across P2P. The journal stays local to each peer.
- i18n. The game is Swiss German throughout; this adds strings in the same
  voice and nothing else.

## 1 — One reshuffle site instead of two

The recycling logic is currently duplicated verbatim in `drawUntilCover`
(`source/Tschau Sepp Online.dc.html:841`) and `drawCards` (`:860`):

```js
if (discard.length > 1) { const top = discard.pop(); pile = this.shuffleArr(discard); discard = [top]; }
else break;
```

Both call sites are replaced by one helper:

```js
recycleDiscard(pile, discard)
  → { pile, discard, reshuffled: boolean, n: number }
```

`reshuffled` is `true` only when recycling actually happened (`discard.length > 1`);
`n` is the number of cards moved into the new draw pile. When there is nothing
to recycle the helper returns the inputs untouched with `reshuffled: false`,
and the callers keep their existing `break`.

This is a prerequisite, not a cleanup: toast, journal entry and P2P counter all
need a single trigger. Three copies of the trigger is how the next one drifts.
The cooldown ordering (§ 1b) is a fourth reason: an ordering rule split across
two call sites is an ordering rule that will only hold on one of them.

The helper does **not** call `setState` and does **not** emit the toast or the
journal entry itself — it is a pure function over the two piles, so the sim
harness can call it directly. The callers decide what to surface.

## 1b — Cooldown: recently played cards go to the bottom

Even with the toast, the reported case stays unpleasant: the 8 Schilte is
played, the pile runs dry a moment later, and the same 8 Schilte is dealt
straight back into a hand. Uniform shuffling makes that as likely as any other
position. The recycled cards are already in chronological order — `discard` is
push-appended as cards are played — so the ordering is free information the
shuffle currently throws away.

`recycleDiscard` therefore splits the cards it recycles in two before shuffling:

```text
discard (oldest → newest):  [ ...... rest ...... ][ cooldown ][ top ]
                                        │              │         └ stays on the discard pile
                                        ↓              ↓
new pile:                   [ shuffle(cooldown) ][ shuffle(rest) ]
                              ↑ index 0 = bottom      ↑ end = top, where pop() draws
```

`pile.pop()` draws from the end of the array, so the cooldown block sits at the
bottom and is drawn last. **`COOLDOWN_MAX = 8`** — roughly one full turn around
a four-seat table, which covers the reported run without constraining much of
the deck.

Both halves are still shuffled internally. Nothing becomes predictable: a
player learns only that the handful of cards they just watched being played are
unlikely to reappear immediately, which is the intuition a physical deck
already gives them.

**Small piles degrade to today's behaviour.** A recycle of five cards cannot
hold eight back, and holding back *everything* would make the new pile a
reversed replay of the old one. The cooldown size is therefore

```js
Math.min(COOLDOWN_MAX, Math.floor(recycled.length / 2))
```

It never exceeds half the pile, and is `0` when a single card is recycled — an
ordinary uniform shuffle, no special-casing at the call sites. A three-card
recycle holds back one card; that is small but correct, and the half-cap is
what keeps the new pile from being a reversed replay of the old one.

This is the only behavioural change in the feature. It changes which card comes
back when, never *whether* the discard pile is recycled, and never the card
count: the split is a partition, so the 36-card invariant is untouched.

## 2 — Toast

A new state field `reshuffleToast` follows the existing `drawToast` pattern
(`:824-829`): set on reshuffle, cleared by a `setTimeout` guarded by a
generation counter so overlapping reshuffles cannot clear a newer toast.

Text: **`♻ Ablagestapel neu gmischt`**

The reshuffle happens *during* a draw, so the existing `+N Charte` draw toast
fires at nearly the same moment. The two must not overlap: the reshuffle toast
renders at a higher `bottom` offset than `drawToastBottom`, as its own template
block with its own `sc-if`.

Duration matches the draw toast (1.6 s). It is purely informational — no
pointer events, no interaction.

## 3 — Journal entries

`state.debugLog` entries are today always card plays, shaped
`{ seat, suit, rank, effect }`, and `journalRows` (`:1714`) renders them
unconditionally as `<who>: <Rank> <Suit> — <effect>`.

Two new entry kinds are added, discriminated by a `kind` field:

| Entry | Shape | Renders as |
|---|---|---|
| draw | `{ kind: 'draw', seat, n }` | `Computer: zieht 4 Charte` |
| reshuffle | `{ kind: 'reshuffle', n }` | `♻ Ablagestapel neu gmischt (28 Charte)` |

`journalRows` branches on `e.kind`. Entries with **no** `kind` keep the
existing card rendering, so nothing about the current journal changes and no
migration of in-flight state is needed.

Singular/plural: `zieht e Charte` for `n === 1`, `zieht <n> Charte` otherwise —
matching the existing `drewN` message, which already makes that distinction.

Draw entries are appended by both `drawUntilCover` and `drawCards`, once per
call with the total drawn, not once per card. A cover draw that pulls four
cards is one journal line, which is what a reader wants to see.

## 4 — P2P parity

The reshuffle only ever executes on the host. The guest applies host state and
must therefore be *told*.

**Mechanism: a monotonic `reshuffleCount`** in component state, incremented on
every recycle and added to the host's sync payload (`:1568`, alongside the
existing `discard`/`pileN`). The guest keeps the last count it saw and fires its
own toast whenever the received count is greater. This mirrors how the guest
already derives its draw toast from a hand-size delta (`:1588`) rather than from
an event.

**Rejected: routing the notice through `lastM`.** The obvious-looking
alternative is a new `msgText` key set via `this.M()`, which the host already
syncs (`:1572`) and the guest already renders into its banner (`:1599`). It is
rejected for two reasons:

1. `this.M()` writes the **host's own banner** as a side effect. The reshuffle
   happens mid-draw, so the host would get a reshuffle text flashing over its
   turn banner and being overwritten a few hundred milliseconds later by the
   caller's own message — exactly the behaviour that was considered and rejected
   for the local display. The code path is shared; the host cannot opt out.
2. Delivery is timing-dependent. `pushState` is debounced 30 ms by `queuePush`
   (`:455`), so whether the guest ever observes that `lastM` value depends on
   the gap between the reshuffle and the caller's next message. The counter has
   no such dependency: it is state, so any later snapshot still carries it.

The counter is therefore the only P2P channel, and no `msgText` key is added.

The journal stays local: `debugLog` is not in the sync payload and is not being
added to it.

## Testing

The stack is buildless, but `scripts/sim/` runs the real dc logic under Node.
Tests go there, TDD-first, in a new `scripts/sim/test-reshuffle.mjs`:

- `recycleDiscard` with an empty draw pile and a multi-card discard pile
  reports `reshuffled: true`, the correct `n`, leaves the discard top card in
  place, and conserves the total card count.
- `recycleDiscard` with a single-card discard pile reports `reshuffled: false`
  and returns the piles untouched.
- A forced-empty draw pile during a cover draw produces exactly **one**
  `kind: 'reshuffle'` journal entry with the correct count.
- Both draw paths append one `kind: 'draw'` entry carrying the total drawn.
- `journalRows` renders each of the three entry kinds correctly, including the
  `n === 1` singular form and the card entries that carry no `kind`.
- The 36-card invariant holds across a reshuffle.
- Cooldown: after recycling a pile of known cards, none of the last
  `COOLDOWN_MAX` played cards appears in the top half of the new draw pile.
- Cooldown: both halves are genuinely shuffled — a fixed input must not always
  produce the same output order (run the split repeatedly and assert more than
  one distinct ordering), so the rule cannot silently degrade into
  "append in reverse".
- Cooldown: a three-card recycle degrades to a plain uniform shuffle without
  throwing, and still conserves the card count.

`scripts/sim/test-guard.mjs` and `scripts/sim/harness.mjs` must stay green —
the harness is the regression net for the deck invariant this issue was
originally suspected of breaking.

## Bundle

Only `source/Tschau Sepp Online.dc.html` is edited. `scripts/bundle.sh`
regenerates the dc block in `index.html`; `scripts/check-dc-sync.sh` verifies
parity and runs both in the repo-local pre-commit hook and in CI
(`.github/workflows/dc-sync.yml`). `index.html` is never hand-edited.

## Acceptance criteria

- Recycling the discard pile shows a `♻ Ablagestapel neu gmischt` toast to the
  local player, without overlapping the `+N Charte` draw toast.
- The debug journal logs every draw (who, how many) and every reshuffle (how
  many cards were recycled).
- Existing card entries in the journal render exactly as before.
- In P2P, the guest shows its own reshuffle toast, driven by `reshuffleCount`.
- No code path writes the banner message on reshuffle — the host's turn banner
  is unaffected.
- `recycleDiscard` is the only place the discard pile is recycled.
- The last `COOLDOWN_MAX` (8) played cards land in the bottom half of the new
  draw pile, so neither the player nor a CPU can draw them immediately after a
  reshuffle; on piles too small to split, behaviour is the previous uniform
  shuffle.
- New and existing sim tests pass; `index.html` is in sync with the source.
