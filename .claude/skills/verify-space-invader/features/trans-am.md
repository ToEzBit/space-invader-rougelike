# TRANS-AM

The player's ultimate. A gauge from 0 to 100 fills while charging: +1.5 per enemy bullet grazed (one that passes inside the ship's core radius plus `grazePadPx` and leaves without touching the core, shown by a spark between bullet and ship), +2 per kill, and +3 per 1% of the boss's full HP removed. A landed hit costs 20. `Space` on a full gauge while fighting starts six seconds of TRANS-AM: a pink shockwave clears enemy bullets near the ship, a `TRANS-AM` callout shows, and the ship glows red-pink with afterimages and a red vignette. Enemy bullets, boss beams and the Black Hole's pull on bullets run at half speed and turn pale blue. The ship fires twice as fast, pierces one more foe and moves x1.25. Four depleted seconds follow, with a grey ship firing at 60% rate and moving x0.8, before the gauge charges again from 0. The gauge carries to the next stage, and a stage that ends while active or depleted carries 0. Every number lives in `TRANS_AM` in `src/core/transAm.ts`.

## Sub-features

- `refused` keeps the gauge charging when `Space` is pressed before it is full, shakes the slot red and floats `เกจยังไม่เต็ม`.
- `gauge-income` adds grazes, kills and boss damage and takes `hitLoss` per landed hit, never for one the i-frames absorb.
- `activate` turns `Space` on a full gauge into `active` with the active stats.
- `release` clears enemy bullets within `clearRadiusPx` of the ship over the first `releaseMs`.
- `bullet-time` halves enemy bullet speed while active.
- `depleted` follows after `activeMs` with the depleted stats, then `charging` at 0 after `depletedMs`.
- `carry` keeps the gauge through the real shop.
- `hud-slot` is the always-shown first tray slot (`SPACE`): a filling arc and percent while charging, a pulsing ring when ready, a draining white arc while active, a seconds countdown while depleted.

## How to get to it (user POV)

- Fight. Grazing bullets, killing and hurting a boss fill the red `SPACE` slot at the bottom left.
- Press `Space` when the slot pulses.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- `state().transAm` is `{ kind: 'charging', gauge }`, `{ kind: 'active', msLeft }` or `{ kind: 'depleted', msLeft }`. `tally` counts `grazes`, `kills` and `bossDealt` (boss HP removed). `stats.pierce` is the effective pierce. `run.transAmGauge` is what the next stage starts from.
- `__game.transAmGauge(value)` sets the gauge and puts it back to charging. `__game.shots()` lists live enemy bullets as `{ id, kind, x, y }` with ids stable for the stage.
- Expected numbers come from `TRANS_AM` imported from `/src/core/transAm.ts` and base stats from `deriveStats`.

Run `drive.mjs <run-id> trans-am`. It runs at device scale 2.

- **Refused.** Stage 4 from a fresh run starts charging near 0. `Space` leaves it charging.
- **Hit.** Paused, with the gauge set to 50, `hit()` costs 1 HP and `hitLoss` gauge. A second `hit()` inside the i-frames costs neither.
- **Graze.** Stage 5 in god mode, weaving under the Crimson Seraph from a gauge of 15 until 4 grazes land (at most 20s), grazes at least 3 bullets. On every sample step that is not clamped at 0 or the cap, the gauge moves by exactly grazes + kills + boss HP% removed, each times its gain, minus hits times `hitLoss`.
- **Activate.** Stage 4 in god mode with a full gauge shows the slot `ready`. The journey waits for at least 2 enemy bullets within `clearRadiusPx` of the ship, then presses `Space`. State turns `active` with fire interval x0.5, move speed x1.25, pierce +1 and unchanged damage. Once the release ends no bullet is within `clearRadiusPx - 20`.
- **Bullet time.** Enemy bullets are timed over game time before and during TRANS-AM. Each one timed during TRANS-AM flies at `enemyTimeScale` of its own earlier speed when it was also timed before, or otherwise of the `ENEMY_SHOT` speed (`src/game/formation.ts`) of the stage 4 enemy that fires its kind, within 0.08.
- **Depleted.** About `activeMs` of game time later the state is `depleted` with fire interval / 0.6, move speed x0.8 and base pierce, and the slot counts down. About `depletedMs` later it is `charging` near 0 with base stats.
- **Carry.** Stage 1 with the gauge set to 30, then `kill()`, reaches the shop with `run.transAmGauge` = 30 + 2 per foe killed. `Enter` starts stage 2 charging from it. The same with TRANS-AM active at the kill carries 0.
- **Boss.** `Space` with a full gauge in the stage 5 boss fight activates.
- **Tray.** With dash, laser, orbital and all five items the tray reads `transAm, dash, laser, orbital` and nine slots fit across the bottom.
- **Proof.** Each `*-tray.png` is the bottom-left tray. `01`/`02` show the refusal shake, red flash and `เกจยังไม่เต็ม`. `03`/`04` show the pulsing ready ring. `05` to `07` show the active ship glowing pink with red afterimages trailing it, the red vignette at the screen edges and the draining white arc. `08` to `10` show the grey depleted ship and the countdown. `11`/`12` show the percent and arc charging again. `13` shows a boss fight in TRANS-AM with pale blue bullets. `14` shows the full tray.

## Gotchas

- `kill()` goes through the normal damage path, so it adds 2 per foe to a charging gauge.
- `hit()` and `transAmGauge()` call the stage directly, so they work while paused. The hit check runs paused so no graze or kill lands between the reads.
- The weaving journey ship grazes differently from a human, who skims bullets on purpose. Graze counts prove the mechanic, not its balance.
