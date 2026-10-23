# Close Call graze perks

The graze branch, `Close Call · สายเฉียดกระสุน`, rewards flying close to enemy bullets. It is passive, with no key and no tray slot. A graze is counted once per bullet when it leaves the ring around the ship's core without touching it, never during a dash (see [trans-am](./trans-am.md)). Close Call, the branch's unlock and only starter, launches a homing lime spark at the nearest foe on each counted graze. Every other graze perk requires Close Call, so a player without it never sees them in the shop. None of them touches coins.

The perks and their numbers live in `src/core/perks.ts` (`docs/PERKS.md` lists them). The live rules are the `Graze` subsystem in `src/game/graze.ts`, which `World` calls once per counted graze and once per landed hit.

## Sub-features

- `graze-shop` offers graze perks once Close Call is owned.
- `graze-spark` launches Close Call's spark, plus Spark Split's fan, from between the ship and the grazed bullet, and the sparks home in and damage a foe (`tally.dealt.spark`).
- `graze-static-skin` erases the grazed bullet every N grazes (every graze at level 3).
- `graze-wide-halo` counts grazes outside the base ring.
- `graze-phase-skin` raises the ship's one-hit shield for 4 s on every Nth graze in a row without a landed hit; a landed hit resets the streak.
- `graze-adrenaline` shortens the fire interval for 1.2 s after each graze.
- `graze-bullet-time` slows enemy bullets to 50% for a moment after each graze, on the same enemy clock as TRANS-AM's slow, so the two multiply.
- `graze-flashpoint`, `graze-last-stand` and `graze-overflow` have no journey yet.

## How to get to it (user POV)

- Buy Close Call in the hangar or a shop, then other graze perks as the shop offers them.
- Fly so enemy bullets pass close to the ship without hitting its core.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The journey sets loadouts with `__game.start`, holds the boss above her transformation with `bossHp(1)` whenever she drops below 70%, and turns on `god(true)` so the weave survives. God mode still counts landed hits, and they still reset the streak.

- **Shop.** Run `drive.mjs <run-id> graze`. Stage 4 with Close Call and 2000 coins is cleared with `kill()`. `R` is pressed until a card from the graze branch shows (`perks.PERKS[id].branch`).
- **Weave.** Stage 5 with Close Call 3, Wide Halo 3, Adrenaline 3, Spark Split 3, Static Skin 3, Phase Skin 2 and Bullet Time 2. Real arrow keys weave left and right under the boss. At first the weave sidesteps any bullet whose straight course passes within 10 px of the core, so grazes build a streak. Once the Phase Skin shield has shown, the sidestep stops until a bullet lands. A requestAnimationFrame recorder reads `state()` and `shots()` in the same frame for the whole weave. The weave lasts until the spark and shield shots are taken, a hit has broken a streak and 15 grazes have counted, for up to 60 s.
- **Checks.** These run over the recorded frames:
  - TRANS-AM stays `charging`, so every slow and fire rate change is the graze branch.
  - On a frame where `tally.grazes` rises, `graze.sparks` grows by 4.
  - `tally.dealt.spark` rises after the first graze.
  - `graze.lastErasedId` names a bullet that was in `shots()` the frame before, on screen and within the ring. It is gone from that frame on.
  - Most erased bullets sat beyond the base ring (core + `TRANS_AM.grazePadPx`) plus a bullet radius and a frame of travel.
  - `shieldMs` rises to 4000 only on the frame where `graze.streak` reaches a multiple of 8.
  - Every frame where `tally.hits` rises leaves `graze.streak` no higher than the grazes counted in that same frame.
  - `stats.fireIntervalMs` is the base times 0.65 exactly while `graze.rushMs` is above 0, and the base otherwise.
  - Each bullet's speed between frames is compared across frames where Bullet Time ran through the whole step and frames where it ran at neither end. The median ratio over bullets is 0.5.
- **Proof.** `01-shop-graze-card.png` shows a graze card in lime with the branch label `Close Call · สายเฉียดกระสุน` and the `Close Call 1` chip. `02-sparks-in-flight.png` and its close-up are paused once a full fan of sparks has flown 60 px clear of the ship, and show the lime sparks. `04-phase-shield.png` and its close-up show the cyan shield ring around the ship and the lime `PHASE` float.

## Gotchas

- The graze art is still placeholder. The branch uses the orbital icon, the plain perk card frame and the gold chip until the graze set lands.
- Sparks spawn under the ship and are drawn beneath it, so a screenshot right after a graze shows none.
- Bullet Time's slow rides the enemy clock, so it also slows boss beams and the Void Empress's well, as TRANS-AM's does.
- A plain weave without the sidestep is not enough for Phase Skin. In four probes of 20 to 60 s it landed 4 to 22 hits and its longest streak was 3 to 9 grazes.
- Vite reloads the page when the tree changes. Do not edit files while the journey runs.
