# Stage combat

In a wave stage the player moves the ship left and right along the bottom row and holds Space to shoot a marching invader formation. Killed invaders drop coins that count toward the stage reward.

## Sub-features

- `combat-move` moves the ship with arrow keys and A/D.
- `combat-fire` shoots while Space is held and kills invaders.
- `combat-coins` counts coins from kills.
- `combat-clear` ends the stage and opens the shop when the formation is gone.
- `combat-breach` ends the run if the formation reaches the player's row.

## How to get to it (user POV)

- Start a run from the title and wait for the `STAGE 1` banner to fade.
- Use `ArrowLeft`/`ArrowRight` or `a`/`d` to move and hold `Space` to fire.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.

- **Move.** Hold `ArrowLeft`, then hold `d`. Run `drive.mjs <run-id> combat`. `player.x` decreases, then increases.
- **Fire.** Hold `Space` for 4 seconds. `foes` drops below its starting value and `coins` is above 0.
- **Proof.** `combat/01-firing.png` shows player shots in flight and gaps in the formation.

## Gotchas

- `combat-clear` by real play and `combat-breach` have no journey. The shop journey reaches the shop through `kill()`, which is a shortcut, not proof of a real clear.
- Enemy fire can hit the ship during the journey. That is expected and does not fail it.
