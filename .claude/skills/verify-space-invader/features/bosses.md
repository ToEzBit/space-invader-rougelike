# Boss fights

Stage 5 is Crimson Seraph (2 phases) and stage 10 is Void Empress (3 phases). Each boss flies in, shows its name and an HP bar with phase ticks, cycles attack patterns, and switches to a harder pattern set when its HP falls past a threshold.

## Sub-features

- `boss-seraph` shows Crimson Seraph on stage 5 at full HP.
- `boss-damage` lowers boss HP from player fire.
- `boss-seraph-phase` enters phase 2 at or below 50% HP.
- `boss-empress` shows Void Empress on stage 10.
- `boss-empress-phase` enters phase 3 at or below 33% HP.

## How to get to it (user POV)

- Clear stages 1 to 4 for Crimson Seraph, and stages 6 to 9 for Void Empress.
- The ship shoots the boss on its own.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The journey reaches each boss with `__game.start(5)` and `__game.start(10)`, and moves HP with `bossHp(ratio)`.

- **Seraph.** Run `drive.mjs <run-id> bosses`. `boss.name` is `Crimson Seraph`, `hpRatio` 1, `form` 0, `phase` 0.
- **Damage.** Press nothing for 3s. `boss.hpRatio` drops below 1.
- **Seraph second form.** `bossHp(0.45)`. `boss.form` becomes 1 and `stance` is back to `fighting` within 10s.
- **Empress second form.** On stage 10, `bossHp(0.3)`. `boss.form` becomes 1 within 10s.
- **Proof.** `bosses/01-seraph-phase2.png` and `02-empress-phase3.png` show each boss with name, HP bar and attacks in flight.

## Gotchas

- Phases only advance after the boss finishes flying in. The Empress takes several seconds.
- Killing a boss by real play is not covered. The run-end journey uses `kill()`.
