# Run end

The run ends in victory after clearing stage 10, or in defeat when HP reaches 0. The End screen shows the result, the stage reached and the perks owned, and Enter returns to the title.

## Sub-features

- `end-victory` shows VICTORY after stage 10 is cleared.
- `end-defeat` shows GAME OVER when HP reaches 0.
- `end-restart` returns to the title on Enter or click.

## How to get to it (user POV)

- Beat the Void Empress, or lose all hearts.
- Press `Enter` or click on the End screen.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The journey reaches the ends with `__game.start(10)` plus `kill()`, and `__game.start(1)` plus one `hurt()` per heart.

- **Victory.** Run `drive.mjs <run-id> run-end`. `scenes` contains `End` and `run.phase.kind` is `victory`.
- **Restart.** Press `Enter`. `scenes` contains `Title`.
- **Defeat.** Take hits until HP is 0. `scenes` contains `End`, `run.phase.kind` is `defeat`, `run.hp` is 0.
- **Proof.** `run-end/01-victory.png` and `02-defeat.png`.

## Gotchas

- Defeat by real enemy fire and by formation breach are not covered. Both are real paths a player hits.
