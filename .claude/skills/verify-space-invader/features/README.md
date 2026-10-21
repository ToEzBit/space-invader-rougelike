# Space Invader Roguelike verification map

This directory is the maintained source for verifying what a player can do in the game. Read this index before driving, then use the matching feature file as the recipe. Each feature maps to one `drive.mjs` journey of the same name.

## Baseline preconditions

- Start your own instance with `scripts/launch.sh <run-id>`. It prints `RUN_ID=` and `URL=` once the Title scene is usable.
- `scripts/doctor.sh <run-id>` passes and reports the build you intend to verify.
- Never drive an instance this run did not start.

## Driving conventions

- Every journey starts in a fresh browser context, so no run, money or perks carry over between journeys.
- The game is one canvas. Drive with keyboard keys and read results from `window.__game.state()`. Never click by coordinates.
- `__game.start`, `kill`, `hurt` and `bossHp` only set preconditions. The feature itself is driven with real keys.
- Compute expected numbers with the game's own `src/core/run.ts` (via `h.core`), not hand-copied constants.

## Proof and skip reporting

- Proof is the journey's `log.json` (state before and after each action, every check) plus screenshots you have opened and looked at.
- A journey with any console error fails.
- Report an unreachable path with the command you ran and the unmet precondition.
- Do not report an entry point as verified through a different one, for example a stage reached by `__game.start` is not proof that Title → Enter works.

## Features

- [Title and run start](./title-start.md) covers booting, the title screen, and starting a fresh run.
- [Stage combat](./combat.md) covers moving, shooting, kills and coins.
- [Perk shop](./shop.md) covers offers, refresh, buying, sold-out cards and continuing.
- [Laser and dash perks](./perk-mechanics.md) covers the Prism Lance beam and the Afterburner Dash, locked and unlocked.
- [Skill cooldown tray](./skill-hud.md) covers the bottom-left skill icons, the clockwise cooldown sweep and countdown, dash charges and the laser cycle.
- [Boss fights](./bosses.md) covers Crimson Seraph and Void Empress, damage and phases.
- [Run end](./run-end.md) covers victory, defeat and restarting.
- [Viewport and fullscreen](./viewport.md) covers filling the window, fitting the playfield, HiDPI, live resize and the F fullscreen toggle.
