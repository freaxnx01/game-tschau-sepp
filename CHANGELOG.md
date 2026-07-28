# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com) and
[Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- Debug dialog: Ctrl+Click the "Debug" button to pop it into its own window, live-updating alongside the main game (#9)

### Fixed

- Debug dialog closes on ESC, along with the Rules and confirm-leave dialogs (#9)
- Debug "Cards" tab tooltip now names who discarded a card (#9)

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

