# Feedback triage — 2026-08-28 — "2x Achti vom Computer"

status: done

Source: Telegram/LocalSend message + 1 screenshot (mobile, github.freaxnx01.ch, live v0.2.0).

## Triage table

| # | Note (normalized, short EN) | Att. | Topic | Kind | Disposition | Rationale / link | Status |
|---|---|---|---|---|---|---|---|
| 01 | Computer played the same card (8 Schilte) twice in one run (8♠ → A♠ → 8♠ → 8♦) — suspected duplicate card | `assets/2026-08-28-doppelte-achti/entry-01-zwei-achti-schilte.jpg` | game logic / deck integrity (TODO "Verify card integrity") | Improvement (bug claim) | **No action** (TODO item ticked) | Not a duplicate. Ass → "muess decke" → bot had no cover → `drawUntilCover` → draw pile empty → discard pile (incl. the 8♠ just played) reshuffled into the pile → bot drew the 8♠ back and covered with it. Instrumented sim (10 000 rounds): 0 invariant violations; 24 same-card-twice-in-one-run cases, 24/24 immediately after a reshuffle, 0 without. Bot still holding 7 cards after ≥5 plays in the run = it drew a lot, matching this path. | done |
| 02 | The reshuffle is invisible to the player and the debug journal logs neither draws nor reshuffles → a legit reshuffle looks like a duplicate card | (same screenshot) | debug journal / UI messages (cf. closed #6, #9) | Improvement | **Issue** → #13 | User-visible behaviour + needs a small spec (message text, journal entries). Proposal: toast/message "Ablagestapel neu gmischt" when the discard pile is recycled; journal entries for draws (who, n) and for reshuffles, so a "proof" can be checked in-game. | done |

## Raw notes

- [#01][#02] "Jetz hani de bewiis. 2x 8i gspilt vom compi. Nachenand. Ich spile jede abig."
- [#01] photo_2026-08-28_20-06-50.jpg → `assets/2026-08-28-doppelte-achti/entry-01-zwei-achti-schilte.jpg`
