# Laser and dash perks

Two perk branches add new mechanics instead of stat bumps. Prism Lance unlocks a beam that fires automatically whenever its cooldown is ready during a fight. Afterburner Dash unlocks Shift, which launches the ship straight up through the formation, invulnerable, and brings it back to its row.

## Sub-features

- `laser-intro` keeps the beam and the gun silent while the intro banner is up.
- `laser-fire` fires the beam on its own with Prism Lance owned and kills invaders in its column.
- `dash-locked` ignores Shift without Afterburner Dash.
- `dash-fly` launches the ship up and returns it to its row without HP loss.

## How to get to it (user POV)

- Buy Prism Lance or Afterburner Dash in the shop, then continue to the next stage.
- The laser fires itself. Press `Shift` to dash.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The journey sets the loadout with `__game.start(stage, { prismLance: 1 })` or `{ afterburnerDash: 1 }`.

- **Intro.** Run `drive.mjs <run-id> perk-mechanics`. Stage 1 with Prism Lance is sampled every 40ms while `life` is `intro`. `laserFiring` stays false and `foes` stays unchanged. A ready Lance would fire on the first live frame, so this catches any shooting under the banner.
- **Laser.** Press nothing once `life` is `fighting`. `laserFiring` becomes true within 3s and `foes` drops.
- **Dash locked.** Press `Shift` on stage 1 with no perks. `dashing` stays false and `player.y` is unchanged.
- **Dash.** Press `Shift` on stage 3 with Afterburner Dash. `dashing` becomes true with `player.y` above the start row, then returns false with `player.y` back on the row and `run.hp` unchanged.
- **Proof.** `perk-mechanics/01-laser.png` shows the beam. `02-dash.png` shows the ship lifting off with its afterimage. The HUD skill slots for both are covered by [skill-hud](./skill-hud.md).

## Gotchas

- The other 26 perk effects (spread, drones, burn, shockwave, shields, lifesteal and so on) have no journey. Kinetic Barrier, Vampiric Hull, Chain Charge and Reflector Field coins were never verified at runtime.
- `hurt()` forces past shields, so it cannot prove Kinetic Barrier.
