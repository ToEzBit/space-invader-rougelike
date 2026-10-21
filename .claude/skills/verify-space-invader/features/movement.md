# Ship movement

The ship flies in two dimensions inside a band at the bottom of the playfield. It spawns on the bottom edge of the band (`PLAYER_Y`, 572) and can climb to its top (`PLAYER_ZONE.top`, 384), both in `src/game/layout.ts`. A diagonal is normalized, so it is no faster than a straight move, and every `moveSpeed` bonus (Nitro, Thruster Tuning) applies to both axes. The exhaust stretches while flying up and shrinks while backing down. The formation's breach line (`BREACH_Y`) stays fixed and does not follow the ship. The Afterburner Dash launches from wherever the ship is and lands back on the y it launched from.

## Sub-features

- `move-vertical` moves the ship up with `ArrowUp`/`w` and down with `ArrowDown`/`s`, clamped to the zone.
- `move-diagonal` moves both axes at once at `moveSpeed`, not `moveSpeed` x 1.41.
- `dash-from-raised` dashes from a raised y and returns to that y, not to `PLAYER_Y`.

## How to get to it (user POV)

- Start a run and hold the arrow keys or WASD once the `STAGE 1` banner fades. The title's controls panel lists `← → ↑ ↓ / W A S D`.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The journey reads `PLAYER_ZONE` and `PLAYER_Y` from `/src/game/layout.ts` in the page, and starts stages with `__game.start(1)` and `__game.start(1, { afterburnerDash: 1 })`.

- **Up and clamp.** Run `drive.mjs <run-id> movement`. Stage 1 starts with `player.y === PLAYER_Y`. Holding `ArrowUp` lowers `player.y` within 300ms, reaches exactly 384 by 1.2s and stays there 300ms later. `player.x` is unchanged.
- **Down.** Holding `s` 1.2s brings `player.y` back to exactly `PLAYER_Y`.
- **Diagonal.** `ArrowUp` and `ArrowRight` held together for about 300ms move x and y by the same amount (within 8px, since the two keydowns can land a frame apart). The distance over `stats.moveSpeed` x the hold time, measured in Node around the key events, is between 0.85 and 1.15. Unnormalized input would give about 1.41.
- **Dash from raised.** With Afterburner Dash, `w` held 1.2s raises the ship to 384. `Shift` makes `dashing` true with `player.y` above 344, and the first state with `dashing` false has `player.y` within 1px of 384.
- **Proof.** The journey runs at device scale 2. `01-moving-up-closeup.png` shows the exhaust mid-climb, about 1.4x as long as the idle one in `05` (taken live, see Gotchas). `02-raised.png` shows the ship parked high in the zone. `03-dash-from-raised.png` shows the ship climbing from there with its afterimage. `04` and `05` show it back at the raised y.

## Gotchas

- `__game.pause()` releases held keys, so a pause in the middle of a hold stops the ship. Shots taken during a hold are taken live.
- Enemy fire can hit the ship during the journey. It does not move the ship and does not fail the journey.
- On the frame the dash lands, and on each frame of the down leg, the exhaust is drawn where the hull was one frame earlier, so it hides behind the hull. The journey waits 100ms before its post-dash shots.
