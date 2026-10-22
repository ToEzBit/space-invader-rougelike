# Boss forms, transformation and special attacks

Each boss has two forms. At half HP she transforms: she stops, turns immune, a shockwave wipes the enemy bullets on screen, a white flash crossfades her sprite into the second-form art, a banner and the HUD show the new name, the HP bar climbs in green as she heals (the Crimson Seraph has `healRatio` 0, so her bar stays red), and minions arrive. Her second form casts special attacks: she holds still, pulses in her form's glow while light gathers into her, a callout pops above her and a telegraph shows where the attack lands, then it releases with a flash.

| Boss | Second form | Specials (callout) |
| --- | --- | --- |
| Crimson Seraph (stage 5) | Crimson Seraph · Ascended | `featherStorm` ("Feather Storm!"), `crossJudgement` ("Cross Judgement") |
| Void Empress (stage 10) | Void Empress · Eclipse | `blackHole` ("Black Hole"), `eclipseNova` ("Eclipse Nova") |

## Sub-features

- `transform-trigger` starts the transformation when player fire pushes HP across `transform.atHpRatio`.
- `transform-immune` absorbs every hit while transforming: HP only climbs and `boss.deflected` grows.
- `transform-heal` leaves her `healRatio` of full HP higher than where she started.
- `transform-name` switches `boss.name` and the HUD to the second form mid-transformation.
- `transform-minions` summons the second form's minion kind, never past `MAX_MINIONS`.
- `special-casting` puts each second-form special in `stance: 'casting'` with its `callout` before it fires.

## How to get to it (user POV)

- Fight Crimson Seraph on stage 5 or Void Empress on stage 10 and bring her to half HP.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The journey reaches each boss with `__game.start(stage, loadout)`, turns on `god(true)` so the ship survives the measurement, and moves HP with `bossHp`. Expected values (thresholds, heal, names, specials, callouts, charge times, the minion cap) come from `src/core/stages.ts`, `src/game/patterns.ts` and `src/game/boss.ts` in the page.

Run `drive.mjs <run-id> boss-forms`. Per boss:

- **Armed.** `bossHp(atHpRatio + 0.03)`. `boss.form` is 0.
- **Trigger.** The ship flies under the boss with the arrow keys (`h.track`) until auto-fire crosses the threshold and `boss.stance` is `transforming`.
- **Immune.** While transforming, every sample's `hpRatio` is at least the last one and `deflected` grows.
- **Done.** `stance` is `fighting`, `form` 1, `name` the second form's, `hpRatio` up by `healRatio` (less 0.03 for fire after resuming), `0 < minions <= MAX_MINIONS`, about `durationMs` after it began.
- **Specials.** Within two cycles of the second form's first phase, each special shows `stance: 'casting'`, `pattern` and its `callout`, then returns to `fighting`. The journey resets HP with `bossHp(0.7)` so she never falls into her last phase or dies.
- **1920x1080.** A separate 1920x1080 context shows the Eclipse casting.

Debug fields: `boss { name, form, hpRatio, phase, stance, minions, deflected, pattern?, castMsLeft?, callout?, x, y, maxHp }`, and `god`, `tally { fired, dealt, hits, contacts }`, `clock { fightMs, frames, capped }`.

Proof screenshots (deviceScaleFactor 2), per boss id:

- `<id>-transform-shockwave` shows the ring sweeping bullets off the screen.
- `<id>-transform-crossfade` shows the second-form sprite fading in, the banner and the green HP bar.
- `<id>-form2` shows the second form in play with her minions.
- `<id>-casting-<pattern>` shows each special's callout and telegraph mid-charge, paused.
- `<id>-release-<pattern>` shows the attack half a second after release.
- `1920x1080-eclipse-casting` shows a cast at a desktop window size.

## Gotchas

- `kill()` cannot kill a boss mid-transformation, because the ward absorbs it. Use it before or after.
- Bosses keep the fixed 42 hit radius in both forms (`src/game/hitbox.ts`), so the larger second-form sprites never change collisions.
- The pattern cycle continues while the boss is shot, so a special may be cast before the journey's first poll after the transformation. The journey waits up to two cycles for each.
