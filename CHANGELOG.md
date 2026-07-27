# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com) and
[Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- Debug mode (solo games): a "Debug" button opens a modal showing this round's play journal and a full 36-card grid of where every card currently is — lets players verify deck integrity themselves.

### Fixed

- The stackable-seven message now shows how many sevens were chained separately from how many cards must be drawn, so the draw count (2→4→6→8) can't be misread as a count of seven cards.

## [0.1.1] - 2026-07-24

### Fixed

- P2P: two players could end up with the same auto-picked nickname when
  joining a session (e.g. playing zu dritt). The host now assigns a unique
  pool name on collision; manually typed names are left untouched. (#4)

## [0.1.0] - 2026-07-18

### Added

- Initial versioned release of game-tschau-sepp.
- In-game version badge sourced from `version.js`.
