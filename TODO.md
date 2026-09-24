# Tschau Sepp — TODO

- [x] Widmung für Eric — Text: "Das Spiel isch em Eric gwidmet."
- [x] Show version number in the UI, clickable → open changelog
- [x] Multiplayer local mode (2 players, 1 PC / hotseat) — shipped in #2
- [ ] Multiplayer P2P test: home LAN PC ↔ phone on mobile data
- [ ] Multiplayer relay/server fallback when P2P isn't possible (is this still doable on GitHub Pages?)
- [x] Verify card integrity: 36 cards, 4 colours, each unique card guaranteed to appear exactly once per game — in both single-player and multiplayer
- [ ] Refactor: extract the repeated "Sepp! bubble + endRound after 600ms" sequence — five copies across drawFor/botTurn/nextTurn/playCard (noticed while fixing #33)
- [ ] Sim tests: `test-spectator.mjs` patches `Component.prototype` for the pacing check and never restores it — harmless only while it is the last block in the file (review of #39)
- [ ] Sim tests: `test-bot-ace.mjs` has no case for gmüetlich picking while already under a cover obligation (`s.cover != null`) — the one path where an unsafe Ass chains into a second forced cover (review of #40)
