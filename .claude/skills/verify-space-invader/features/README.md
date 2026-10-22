# Space Invader Roguelike verification map

This directory is the maintained source for verifying what a player can do in the game. Read this index before driving, then use the matching feature file as the recipe. Each feature maps to one `drive.mjs` journey of the same name.

## Baseline preconditions

- Start your own instance with `scripts/launch.sh <run-id>`. It prints `RUN_ID=` and `URL=` once the Title scene is usable.
- `scripts/doctor.sh <run-id>` passes and reports the build you intend to verify.
- Never drive an instance this run did not start.

## Driving conventions

- Every journey starts in a fresh browser context, so no run, money or perks carry over between journeys.
- The game is one canvas. Drive with keyboard keys and read results from `window.__game.state()`. Never click by guessed coordinates. A pointer journey such as `shop-tooltip` aims at world bounds the game reports in state and converts them to page coordinates.
- `__game.start`, `kill`, `hurt`, `hit` and `bossHp` only set preconditions. The feature itself is driven with real keys.
- Compute expected numbers with the game's own `src/core/run.ts` (via `h.core`), not hand-copied constants.

## Proof and skip reporting

- Proof is the journey's `log.json` (state before and after each action, every check) plus screenshots you have opened and looked at.
- A journey with any console error fails.
- Report an unreachable path with the command you ran and the unmet precondition.
- Do not report an entry point as verified through a different one, for example a stage reached by `__game.start` is not proof that Title → Enter works.

## Features

- [Title and run start](./title-start.md) covers booting, the title screen, and starting a fresh run.
- [Stage combat](./combat.md) covers moving, shooting, kills and coins.
- [Ship movement](./movement.md) covers flying up and down inside the bottom zone, its clamp, normalized diagonals and dashing from a raised y.
- [Perk shop](./shop.md) covers offers, refresh, buying, sold-out cards, continuing, and the owned-chip tooltips (journey `shop-tooltip`).
- [Laser and dash perks](./perk-mechanics.md) covers the Prism Lance beam and the Afterburner Dash, locked and unlocked.
- [Consumable items](./items.md) covers item offers in the shop, buying, keys Z X C V B (1-5 as a fallback), buffs, the item shield and the bottom-right item tray.
- [TRANS-AM](./trans-am.md) covers the ultimate's gauge (grazes, kills, boss damage, hits), Space activation and refusal, the release shockwave, bullet time, the active and depleted stats, the carry across stages and its tray slot.
- [TRANS-AM cut-in](./cut-in.md) covers the one-second cut-in Space plays before TRANS-AM, the stage freeze under it, input pressed during it, and the release and full active time after it.
- [Skill cooldown tray](./skill-hud.md) covers the bottom-left skill icons, the clockwise cooldown sweep and countdown, dash charges and the laser cycle.
- [Enemy HP bars](./enemy-hp.md) covers the bar over a damaged foe, its color, the white chip, the fade after the last hit and no bar on the boss.
- [Boss fights](./bosses.md) covers Crimson Seraph and Void Empress, damage, phases and reaching the second form.
- [Boss forms](./boss-forms.md) covers the transformation (immunity, shockwave, heal, new name and sprite, minions) and each second form's charged special attacks.
- [Run end](./run-end.md) covers victory, defeat and restarting.
- [Background music](./music.md) covers the normal and two boss tracks, which plays when, crossfades, the music through the TRANS-AM cut-in, the M mute and the offline WAV render.
- [Viewport and fullscreen](./viewport.md) covers filling the window, fitting the playfield, HiDPI, live resize and the F fullscreen toggle.
