# Gunner fan

A Gunner Girl in the wave formation fires aimed needles at the ship. Through stage 4, before the first boss, each shot is one needle. From stage 6 on, after the first boss, each shot is a fan of 3 needles, the middle one aimed at the ship and the outer two `FAN_SPREAD` (0.24 rad) to either side. The count per stage is `gunnerFan` in `src/core/stages.ts`.

## Sub-features

- `fan-volley` makes a stage 6 gunner fire 3 needles on one frame from her own position.
- `fan-aim` points the middle needle at the ship and the outer two `FAN_SPREAD` either side of it.
- `fan-single` keeps stage 4 gunners on one aimed needle per shot.

## How to get to it (user POV)

- Clear stages 1 to 4, beat the Crimson Seraph in stage 5 and reach stage 6. Gunners fire only once the drones below them in their column are dead, since only the lowest live enemy in a column shoots.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The journey starts stage 6 with `__game.start` and Heavy Caliber Lv2, then stage 4 with Heavy Caliber Lv1. `god(true)` keeps the ship alive. Neither is the feature under test.
- Stage 6 gunners sit in row 3 of 5 behind two rows of drones at 1.8x HP. From a still ship only the few columns that march over it open, and in some runs the fans stopped within 20 s. So the ship first sweeps left and right twice (8 holds of 700 ms) with real fire to thin the drones across the width, then holds still.

- **Record.** Run `drive.mjs <run-id> gunner-fan`. The ship holds still while an animation-frame loop reads `__game.state()` and `__game.shots()` together and keeps each needle's first 6 positions, the ship and the foe spots on the frame it appeared. Needles already in flight when the loop starts, such as those fired during the sweep, are left out.
- **Group.** Needles first seen on the same frame within 12 px of each other are one volley. Each needle's direction comes from its first and last kept positions and is compared with the line from the volley's origin to the ship.
- **Stage 6 checks.** The sweep killed foes. At least 4 volleys, each of 3 needles starting within 16 px of a live foe's muzzle, with offsets from the aim of `-FAN_SPREAD`, `0` and `+FAN_SPREAD` within 0.03 rad.
- **Stage 4 checks.** At least 5 needles, each alone on its frame, starting at a foe's muzzle and aimed at the ship within 0.03 rad.
- **Proof.** `gunner-fan/01-stage6-fan.png` is paused about 18 frames after a fan left, with its 3 needles spread apart in flight. `02-stage6-fan-closeup.png` crops around that fan. `log.json` holds every recorded volley with its origin and offsets.

## Gotchas

- Only gunners fire needles, so the bullet kind names the shooter. Drones and divers fire pellets and tanks fire orbs.
- The aim is taken on the frame the needle appears. Moving the ship during the recording does not break it, but a still ship keeps every volley's aim easy to read in the log.
