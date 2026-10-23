# Stage combat

In a wave stage the player moves the ship around the bottom of the playfield while the gun fires on its own at a marching invader formation. Killed invaders drop coins that count toward the stage reward.

## Sub-features

- `combat-move` moves the ship left and right with arrow keys and A/D. Vertical movement is in [movement](./movement.md).
- `combat-fire` auto-fires once the intro banner ends and kills invaders with no key pressed.
- `combat-coins` counts coins from kills.
- `combat-clear` ends the stage and opens the shop when the formation is gone.
- `combat-breach` ends the run if the formation reaches the breach line just above the ship's spawn row. The line stays put when the ship flies up.

## How to get to it (user POV)

- Start a run from the title, launch from the hangar, and wait for the `STAGE 1` banner to fade.
- Use the arrow keys or WASD to move. Firing is automatic.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.

- **Move.** Hold `ArrowLeft`, then hold `d`. Run `drive.mjs <run-id> combat`. `player.x` decreases, then increases.
- **Fire.** Press nothing for 4 seconds after the moves. `foes` drops below its value when the keys were released and `coins` is above 0.
- **Proof.** `combat/01-firing.png` shows player shots in flight and gaps in the formation.

## Gotchas

- `combat-clear` by real play and `combat-breach` have no journey. The shop journey reaches the shop through `kill()`, which is a shortcut, not proof of a real clear.
- Enemy fire can hit the ship during the journey. That is expected and does not fail it.
