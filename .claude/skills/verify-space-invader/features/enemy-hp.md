# Enemy HP bars

A foe that takes damage and survives shows a small HP bar just above its sprite: as wide as the sprite, 3px tall on a dark backing, filled green above 60% HP, yellow above 30% and red below. The HP a hit took off shows as a white chip that holds for 120ms and then shrinks to the new value, about 250ms in all, so each hit reads. The bar stays while damage keeps landing and fades out over its last 300ms, `HP_BAR_MS` (1200ms) after the last hit. Laser and burn damage keeps the bar up without holding the chip again on every tick. A foe never hit shows no bar. The boss never gets one, since its HP is on the HUD bar, but its minions do. State lives on each foe (`Foe.hpBar` in `src/game/world.ts`, rules in `src/game/hpBar.ts`), and the HUD redraws every visible bar into one shared Graphics each frame.

## Sub-features

- `hp-bar-hidden` shows no bar on a foe that was never hit.
- `hp-bar-show` shows the bar with the ratio left after a hit that does not kill.
- `hp-bar-chip` shows the white lost slice right after a hit.
- `hp-bar-fade` hides the bar about 1.2s after the last hit while the foe lives.
- `hp-bar-boss` never puts a bar on the boss sprite.

## How to get to it (user POV)

- Reach stage 3 and let the gun chip at the Bulwark tanks in the top row. Stage 5 is the Crimson Seraph.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- `state()` in `Stage` adds `hpBars`, one entry per live damaged foe: `{ id, x, y, maxHp, hpRatio, bar, chipRatio?, msLeft? }`. `bar` is `shown`, `hidden` (faded out) or `hud` (the boss). `chipRatio` and `msLeft` exist only while `shown`. `id` is stable for the stage, so a journey can follow one foe.
- The journey reads the tank's HP (`ceil(ENEMIES.tank.hp * stageDef(3).hpMultiplier)`, 11) and `HP_BAR_MS` from the game's modules in the page.

- **Hidden.** Run `drive.mjs <run-id> enemy-hp`. Stage 3 with no perks. `hpBars` is empty during the intro and on the first `fighting` state.
- **Chip.** Polling every 30ms, the first `shown` entry with `chipRatio - hpRatio > 0.1` is caught, re-read after `pause()`, and shot.
- **Show.** It waits up to 40s for a `shown` entry with `maxHp` 11 and `hpRatio < 1`, a tank hit but alive.
- **Fade.** The ship flies 1.3s toward the wall farther from that tank, so its shots stop reaching it. The journey follows the tank's `id`. The time from its last hit (`now - (HP_BAR_MS - msLeft)` on each sample) to the first `hidden` sample is between `HP_BAR_MS - 250` and 2000ms. The bar then stays `hidden` for 1s, and the entry is still there with `hpRatio < 1`, so a kill cannot pass as a fade.
- **Boss.** Stage 5, after 3s of fire, sampled 12 times over 1.4s. The boss's `hpRatio` drops below 1 and every sample has its entry as `bar: 'hud'` with the same ratio.
- **Proof.** The journey runs at device scale 2. `02-chip-closeup.png` shows a white chip next to the fill. `04-tank-hit-closeup.png` shows the tank's bar (green fill, white chip, the hit flash). `06-tank-bar-gone-closeup.png` shows the same tanks with no bar. `07` and `08` show the boss with only the HUD bar.

## Gotchas

- Shots fired before the ship leaves are still in flight for up to a second. Following one tank by `id` and timing from its own last hit keeps those late hits from failing the fade check.
- At x 240 the ship's shots pass between the narrower gunner and drone hitboxes and reach the wide tank. In four runs the first tank hit came 2.1s into the fight (`tankAfterMs`), and the measured fade was 1172 to 1203ms against `HP_BAR_MS` 1200, off by about one poll.
- The formation drops a row as it marches, so the close-up regions use the positions in the same state read.
