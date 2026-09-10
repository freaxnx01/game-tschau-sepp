# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com) and
[Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- CI runs the `scripts/sim` test suites and the 36-card invariant harness on every pull request (#22)

## [0.3.0] - 2026-09-10

### Added

- Debug dialog: Ctrl+Click the "Debug" button to pop it into its own window, live-updating alongside the main game (#9)
- Reshuffling the discard pile now shows a "♻ Ablagestapel neu gmischt" toast, including for the P2P guest (#13)
- Debug journal records draws (who, how many) and reshuffles (#13)

### Changed

- Reshuffling the discard pile now sends the most recently played cards to the bottom of the new draw pile, so they are no longer dealt straight back out (#13)

### Fixed

- The "Nöd optimal" tip no longer recommends a move that strands an unplayable card, such as playing an 8 and keeping a bare Ass (#17)
- Debug dialog closes on ESC, along with the Rules and confirm-leave dialogs (#9)
- Debug "Cards" tab tooltip now names who discarded a card (#9)
- Covering an Ass now draws one card per click instead of force-drawing until a cover appears, so you can look at each card and decide whether to spend a cover you already hold (e.g. the Under)
- An unservable 7-penalty (exhausted draw pile) no longer leaves the pending winner holding an empty hand with the round unresolved (#16)

## [0.2.0] - 2026-07-28

### Added

- Track per-round play journal and debug modal state

- Add debug modal shell with journal/cards tabs

- Render play journal in debug modal

- Render full-deck card-location grid in debug modal

- Add dedication line to Eric on start menu


### Documentation

- Add debug-mode design spec; capture dedication text in TODO

- Fix dedication text grammar in TODO

- Add debug-mode implementation plan

- Add debug mode and seven-chain message fix

- Add notes.md with Swiss Jass deck composition


### Fixed

- Add missing per-release version header to changelog template

- Show seven-chain count alongside draw-penalty count

- Reset debugOpen on menu return, add rank headers to card grid

- Enlarge card grid for readability

- Scale card grid modal with viewport width

- Guard playCard against cards not in the player's hand

## [0.1.1] - 2026-07-24

### Added

- Track whether player's name was manually typed


### Changed

- Extract NAME_POOL, add uniqueFunnyName() helper


### Documentation

- Add 'Widmung für Eric'; check off version-in-UI (done)

- P2P unique nicknames design (issue #4)

- P2P unique nicknames implementation plan (issue #4)


### Fixed

- Dedup auto-picked P2P nicknames on join (#4)

- Reset myNameCustom on openMp auto-fill; cap uniqueFunnyName suffix length

## [0.1.0] - 2026-07-18

### Added

- Add More Games / Source footer nav

- Link version badge to CHANGELOG on GitHub


### Fixed

- Hint no longer flags Ace-then-cover combos, defer win on finishing 7

- Center the draw/discard pair instead of stranding discard on the right

- Show draw pile card back when reshuffle keeps it drawable

