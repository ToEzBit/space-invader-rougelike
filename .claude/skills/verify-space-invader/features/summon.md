# Spirit Call summon perks

The summon branch, `Spirit Call · สาย Summoner`, gives the ship familiars: small cornflower spirits that hover above its nose and act on their own. It is passive, with no key and no tray slot. Spirit Familiar, the branch's unlock and only starter, brings one familiar that fires a homing cornflower wisp at the nearest foe on its own timer. Option Drones from Bullet Storm only copy the gun. Familiars pick their own targets, block bullets, take hits and dive. Every other summon perk requires Spirit Familiar, so a player without it never sees them in the shop. None of them touches coins.

The perks and their numbers live in `src/core/perks.ts` (`docs/PERKS.md` lists them, `SUMMON` holds the shared constants). The live rules are the `Summons` subsystem in `src/game/summons.ts`. `World` owns it and calls it each frame, once per wisp hit, before enemy bullets meet the ship, and when a hit would land. Each familiar is in one state: `ready`, `resting` after a Guardian block, `gone` after a Sacrifice, or `diving` during Great Spirit.

## Sub-features

- `summon-familiars` brings one familiar with Spirit Familiar and one more per Pack Call level, up to 3. Without Guardian they circle a point 50 px above the ship, clear of the hull and of the Option Drones' slots at x plus or minus 36.
- `summon-wisps` fires a wisp from each `ready` or `resting` familiar every interval, staggered across the pack, at the nearest live foe. Wisps home with the missile steer and deal `tally.dealt.wisp`.
- `summon-guardian` lets a `ready` familiar destroy an enemy bullet it touches. It then rests, drawn dimmed, back in the circle above the ship, and cannot block until the rest runs out, but it keeps firing. While Guardian is owned, each `ready` familiar stands on the line from the ship to the nearest foe, 38 px out and 20 px further per familiar ahead of it, turned at most 60 degrees from straight up. That foe's aimed shots fly down that line. From 38 px out a familiar's box clears the hull at every angle, and within 60 degrees it clears the drone slots.
- `summon-sacrifice` makes a hit that would land take a `ready` familiar instead. The ship keeps its HP. The hit is not counted in `tally.hits`, costs no TRANS-AM gauge and keeps the graze streak, like a shield block. The ship still gets the full 1.3 s of hit i-frames. The familiar is `gone` for 10 s (7 s at level 2), then returns. `hurt()` is forced past it, as it is past shields.
- `summon-haunt` marks a foe a wisp hits, after that hit's own damage, for 2 s. Every hit on a marked foe from any source deals `1 + hauntBonus` times its damage, and the foe is tinted lavender.
- `summon-great-spirit` sends every familiar that is not `gone` diving at the live foe with the most HP every 12 s (9 s at level 2) of fighting. Each one deals 30 as `tally.dealt.spirit` when it reaches her, then flies back and is `ready` again.
- `summon-kinship`, `summon-swift-wings`, `summon-piercing-soul` and `summon-soul-burst` have no journey yet. Soul Burst's wisps burst like Flashpoint's sparks, for half the wisp's damage as `blast`, under a cornflower ring.

## How to get to it (user POV)

- Buy Spirit Familiar in the hangar or a shop, then other summon perks as the shop offers them.
- Fly as usual. The familiars follow the ship and act on their own.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The journey sets loadouts with `__game.start`. Under the stage 5 boss it holds her above her transformation with `bossHp(1)` whenever she drops below 70%, and turns on `god(true)` everywhere except the Sacrifice step, so a real hit would show in `run.hp`.
- A requestAnimationFrame recorder reads `state()` (and `shots()` for Guardian) in the same frame for each step.

Steps. Run `drive.mjs <run-id> summon`:

- **Shop.** Stage 2 without perks has no familiars. Stage 4 with Spirit Familiar and 99999 coins has one. It is cleared with `kill()`. `R` is pressed until Pack Call shows, its number key buys it, and `Enter` flies stage 5 with two familiars.
- **Pack.** Under the boss with Spirit Familiar, Pack Call 2 and Option Drones 2, the ship holds still. There are three familiars. No familiar's 12x15 box overlaps the ship's 42x35 box or either 11x12 drone slot on any frame after the first 300 ms. Wisps spawn and `tally.dealt.wisp` rises.
- **Guardian.** Spirit Familiar and Guardian 1. The ship holds still where it starts, under the boss, for 30 s of fight time from the frame she starts to fight. The first block lands within 8 s of that frame and at least 3 land in the 30 s. Each block's bullet was in `shots()` the frame before, near a familiar that was `ready` (or whose rest ran out inside that frame step), and is gone from that frame on. The familiar is then `resting` with 3000 ms left. Every rest lasts 3000 ms, whether it ends on a `ready` frame or the familiar comes ready and blocks again inside one step (its rest jumps back up). It fires wisps while resting and blocks nothing while resting. No familiar box overlaps the ship or a drone slot. A second window parks the ship still at x 60, off to the boss's side, and holds it to the same target.
- **Sacrifice.** Spirit Familiar and Sacrifice 2, with god mode off. The ship tracks the boss until a real boss bullet reaches it. The ship flew at full HP with no counted hit until then. On the frame the familiar turns `gone`, `tally.contacts` rises while `run.hp` and `tally.hits` hold, `invulnMs` is 1300, and the TRANS-AM gauge and graze streak do not drop. God mode then goes on while the familiar is away. It fires no wisps and returns 7000 ms later.
- **Haunt.** Under the boss, per-frame `tally.dealt.bullet` reads 2 per gun hit with Spirit Familiar alone. With Haunt 3 it reads 3 on every frame the boss was haunted at both ends. Each wisp hit sets the boss's `haunted` time to 2000 ms.
- **Great Spirit.** Spirit Familiar, Pack Call 2 and Great Spirit 2. All three familiars turn `diving` together 9000 ms into the fight, each reaches the boss over 200 px from the ship, `tally.dealt.spirit` rises by 90, and all three are back `ready` above the ship.

Proof. These screenshots are taken paused, with no camera flash running:

- `01-shop-pack-call-card.png` shows the cornflower Pack Call card with the branch label `Spirit Call · สาย Summoner` and the `Spirit Familiar 1` chip.
- `02-familiars-and-wisps.png` and `03-familiars-closeup.png` show three familiars above the ship, the drones beside it, and cornflower wisps in flight.
- `04-guardian-on-guard.png` and its close-up show the ready familiar just above the nose, leaning toward the boss.
- `06-guardian-resting.png` and its close-up show the dimmed familiar back in the circle after a block.
- `08-sacrifice.png` shows the cornflower `SACRIFICE` float with no familiar left above the ship. `10-sacrifice-returned.png` shows it back.
- `12-haunted-boss.png` shows the lavender-tinted boss.
- `14-great-spirit-dive.png` shows the three familiars on their way to the boss.

## Gotchas

- Before the guard line, a familiar only blocked what came down through its circle above the nose. Under Crimson Seraph's first form, with the ship held still, that circle blocked 9 bullets in 30 s at the centre (x 240), 5 at x 120 with the first at 9.4 s, 4 at x 400 and none at x 60. A fixed spot 38 px straight up blocked 7, 7, 4 and 3. The guard line blocked 8 to 9 at all four, the first at 3.6 to 4.5 s. Those probes are not part of the journey.
- A diving familiar comes home `ready`, even if it was resting when the dive began.
- Haunt rides `World.damage`, so it also raises burn ticks, collisions and `kill()`.
- Vite reloads the page when the tree changes. Do not edit files while the journey runs.
