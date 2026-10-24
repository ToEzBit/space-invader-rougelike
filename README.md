# Space Invader Roguelike

A Space Invaders-style shooter with roguelike upgrades, pixel art, and chiptune music. It runs in the browser on desktop and mobile. You fight through 10 stages and 2 bosses, and between stages you upgrade your ship in a shop, so no two runs play out the same way. The in-game text is in Thai.

**Play it at https://space-invader-rougelike.netlify.app/**

<p align="center">
  <img src="docs/screenshots/title.png" width="400" alt="Title screen with the controls table">
  <img src="docs/screenshots/fight.png" width="400" alt="Stage 3, the ship firing a Prism Lance laser split into three beams at the enemy formation">
</p>
<p align="center">
  <img src="docs/screenshots/shop.png" width="400" alt="Upgrade shop after stage 3, offering three perk cards">
  <img src="docs/screenshots/boss.png" width="400" alt="Stage 5, fighting the Crimson Seraph boss">
</p>

## How to play

Your ship fires on its own. Your job is to dodge bullets, collect coins, and pick upgrades.

| Key | Action |
| --- | --- |
| `←` `→` `↑` `↓` or `W` `A` `S` `D` | Move |
| `Space` | Start TRANS-AM when the gauge is full |
| `Shift` | Dash through the enemy formation, once you unlock Afterburner Dash |
| `Z` `X` `C` `V` `B` | Use a held item during a stage |
| `1` `2` `3` | Buy a card in the shop |
| `R` | Refresh the shop's cards |
| `Enter` | Start the game, go to the next stage, or play again |
| `M` | Turn the music on or off |
| `F` | Toggle fullscreen |

On a phone, drag anywhere on the screen to steer. Tap the icons under the playfield to use TRANS-AM, the dash, and items.

## Game systems

- **Stages.** There are 10 stages. Stage 5 is the Crimson Seraph boss and stage 10 is the Void Empress. Both bosses have a second form with charged special attacks.
- **Shop.** Before launch and after every stage, you spend the coins you collected on perk cards or items. Prices go up 20% for each stage you clear.
- **50 perks.** They come in 5 branches:
  - Bullet Storm (rapid fire)
  - Prism Lance (laser)
  - Comet Strike (ramming)
  - Close Call (grazing bullets)
  - Spirit Call (summoner)

  Perks from branches you already hold levels in show up in the shop more often, so your build sharpens as the run goes on. The full tables of perks, items, and stages are in [docs/PERKS.md](docs/PERKS.md) (in Thai).
- **Items.** You can buy them and save them for later. They are the Repair Kit, Nitro, Power Cell, Overclock, and Barrier Capsule.
- **TRANS-AM.** The gauge fills when you graze bullets, kill enemies, or damage a boss, and drops each time you get hit. For 6 seconds after you start it, your ship fires twice as fast, moves faster, and its shots pierce one more enemy, while enemy bullets slow to half speed. Your ship is then weakened for 4 seconds.

## Development

You need Node.js and npm.

```bash
npm ci          # install dependencies
npm run dev     # start the Vite dev server
npm test        # run the tests with Vitest
npm run build   # type-check, then build to dist/
npm run docs    # regenerate docs/PERKS.md from the code
```

The game is written in TypeScript on [Phaser 4](https://phaser.io/) and built with Vite. Web Audio synthesizes all the music and sound effects live, except the Void Empress's song, the TRANS-AM voice lines, and the Newtype flash, which are audio files.

| Folder | Contents |
| --- | --- |
| `src/core/` | Game rules with no Phaser dependency: stages, perks, items, ship stats, and TRANS-AM |
| `src/game/` | What happens inside a stage: the ship, gun, laser, enemies, bosses, and bullet patterns |
| `src/scenes/` | The Phaser scenes: Title, Stage, Shop, and End |
| `src/audio/` | The music synthesizer, each stage's score, and the sound effects |
| `src/art/`, `src/assets/` | Sprites, the palette, and UI images |
| `.claude/skills/verify-space-invader/` | Playwright scripts that open the game in real Chrome and play through scenarios to check that each feature works |
