# Laser and dash perks

Two perk branches add new mechanics instead of stat bumps. Prism Lance unlocks a beam that fires automatically while Space is held and the cooldown is ready. Afterburner Dash unlocks Shift, which launches the ship straight up through the formation, invulnerable, and brings it back to its row.

## Sub-features

- `laser-fire` fires the beam while Space is held with Prism Lance owned and kills invaders in its column.
- `laser-meter` shows the LASER cooldown meter in the HUD.
- `dash-locked` ignores Shift without Afterburner Dash.
- `dash-fly` launches the ship up and returns it to its row without HP loss.
- `dash-meter` shows the DASH meter and charge pips.

## How to get to it (user POV)

- Buy Prism Lance or Afterburner Dash in the shop, then continue to the next stage.
- Hold `Space` for the laser. Press `Shift` to dash.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The journey sets the loadout with `__game.start(stage, { prismLance: 1 })` or `{ afterburnerDash: 1 }`.

- **Laser.** Hold `Space` on stage 1 with Prism Lance. Run `drive.mjs <run-id> perk-mechanics`. `laserFiring` becomes true within 3s and `foes` drops.
- **Dash locked.** Press `Shift` on stage 1 with no perks. `dashing` stays false and `player.y` is unchanged.
- **Dash.** Press `Shift` on stage 3 with Afterburner Dash. `dashing` becomes true with `player.y` above the start row, then returns false with `player.y` back on the row and `run.hp` unchanged.
- **Proof.** `perk-mechanics/01-laser.png` shows the beam and the LASER meter. `02-dash.png` shows the ship lifting off with its afterimage and the DASH meter.

## Gotchas

- The other 26 perk effects (spread, drones, burn, shockwave, shields, lifesteal and so on) have no journey. Kinetic Barrier, Vampiric Hull, Chain Charge and Reflector Field coins were never verified at runtime.
- `hurt()` forces past shields, so it cannot prove Kinetic Barrier.
