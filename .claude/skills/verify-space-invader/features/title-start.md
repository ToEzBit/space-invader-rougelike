# Title and run start

The game boots to a title screen with the pixel logo, the chibi cast key art over scrolling stars, the controls panel in Thai, and a prompt. Starting a run opens the shop once as a hangar before stage 1: the player holds 20 coins (`OPENING_COINS` in `src/core/run.ts`) and sees three tier 1 perks with no prerequisite, one per branch in the order rapid, laser, ram, each costing 20. They buy one or keep the coins for the first real shop, then launch stage 1. The laser branch has one such perk, so its card is always Prism Lance.

## Sub-features

- `title-boot` shows the Title scene after textures are built, with no console errors.
- `title-start-enter` opens the hangar on Enter.
- `title-start-space` opens the hangar on Space.
- `title-start-click` opens the hangar on a click anywhere.
- `hangar-offers` shows one tier 1 starter perk per branch, each priced 20, under the subtitle `โรงเก็บยาน · เลือกอัปเกรดแรกก่อนออกบิน`.
- `hangar-no-refresh` shows Refresh disabled, and `r` or a tap on it is denied with the shake and changes nothing.
- `hangar-launch` starts stage 1 with whatever was bought and the coins left.

## How to get to it (user POV)

- Open the game URL. The Title scene appears after a brief boot.
- Press `Enter`, press `Space`, or click the page. The hangar opens.
- Press `1`, `2` or `3` (or click a card) to buy a starter perk, then `Enter` (or `ไปต่อ`) to launch stage 1.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.

Every journey that starts a run from Title goes through the harness's `throughHangar({ title, go, atHangar })`. It presses Enter on Title (or calls `title`), waits for `Shop` at `run.stage` 0, runs `atHangar(hangar)`, presses Enter (or calls `go(hangar)`, which `mobile` uses to tap the `go` target), and returns the state once stage 1 is fighting.

- **Boot.** Run `drive.mjs <run-id> doctor`. `log.json` shows `scenes` contains `Title`, and `01-title.png` shows the logo and controls panel.
- **Hangar.** Run `drive.mjs <run-id> title-start`. Enter on Title reaches `scenes: ["Shop"]` with `run.stage: 0`, `run.money: 20`, and three perk `cards` whose branches read rapid, laser, ram, each tier 1 and priced 20 by the game's own `run.offerCost`.
- **No refresh.** `r` raises `sfx.played.deny` by 1 and leaves `run.money` at 20 and `cards` unchanged.
- **Buy.** `2` buys the laser card: `run.money` 0, the perk at level 1, card 2 sold out.
- **Launch.** Enter reaches stage 1 `playing` with `run.money: 0`, the bought perk in `run.perks`, `run.hp: 3` and `foes: 24`.
- **Proof.** `02-hangar.png` shows the hangar subtitle on one line, three T1 cards in the branch colors priced 20, and a grey Refresh button. `03-hangar-bought.png` shows card 2 sold out, the other prices in red, money 0 and the bought perk's chip. `04-stage1.png` shows stage 1 with the 3x8 formation and the HUD reading `STAGE 1/10`.

## Gotchas

- `title-start-space` and `title-start-click` have no journey yet. Report them as not verified. `mobile` covers a tap on Title and on the hangar's go button.
- The title listens for its start key once. A second Enter during the fade does nothing, and the shop ignores a held Enter's key repeat so it cannot skip the hangar.
- `__game.start` builds a run directly at a stage and never shows the hangar, so it is no proof of a run start.
