# Boss skill motion

Each boss moves her body when she uses a pattern, and the stronger the pattern, the bigger the move. The motion is only drawn. Where she is, where she fires from and what hits her never read it. The table is `MOTIONS` in `src/game/bossMotion.ts`, one entry per pattern with its tier, keyframes in ms from the release (the frame the first shot leaves), optional wobbles, its clock, which way it mirrors, its aura and its colour. `src/game/bossBody.ts` draws the pose each frame from the boss's own update, so anything that stops that update, such as the TRANS-AM cut-in, freezes the motion.

| Tier | Pattern | Motion |
| --- | --- | --- |
| light | `fanSpread` | Squash back for 220 ms, snap tall as the fan leaves, a burst ring, settle. |
| light | `aimedBurst` | Lean away from the ship, snap toward it with a muzzle glint, recoil on every needle. |
| light | `summonMinions` | Stretch up, stomp wide as the minions appear, a burst ring. |
| heavy | `spiral` | Wind back, then a full clockwise twirl the way the arms turn, bobbing, trailing afterimages. |
| heavy | `sweepLaser` | Squash, a growing muzzle glint while the beam blinks, then a lean that follows the beam across. Runs on the enemy clock. |
| heavy | `bulletRain` | Rise, slam down with a shockwave as the rain starts, then a drumming hover. |
| ultimate | `featherStorm` | Casting pose, gold feather rays and afterimages as she rises and bobs, stretch and snap on release, a sway with each wave. |
| ultimate | `crossJudgement` | Casting pose, a still rise while a red cross of light grows behind her, held tall while the beams cross. Enemy clock. |
| ultimate | `blackHole` | Casting pose, a slow sway while violet rings implode into a dark sphere at her palm, a thrust at the ship and a recoil. |
| ultimate | `eclipseNova` | Casting pose, a trembling curl in front of a dark eclipse disc with a cyan corona, then two bursts outward with the two rings. |

Every ultimate also dims the sky behind her for the charge. Its wind-up is exactly the special's `chargeMs`, and the motion eases back to her normal art and rest pose afterwards. A light or heavy wind-up plays in the last moments of the gap before the pattern, so no shot leaves later than before.

## Sub-features

- `tiers` gives every pattern a motion, its tier set by strength. Only ultimates wear the casting pose and dim the sky, and only heavy and ultimate patterns leave afterimages.
- `rest` starts and ends every motion at rest (offset 0, scale 1, rotation 0, normal art).
- `cast-pose` swaps to the form's casting art (`<form texture>Cast` in `src/art/characters.ts`) while an ultimate charges. A form without that art keeps her normal art and the rest of the motion.
- `freeze` holds the motion through the TRANS-AM cut-in and carries it on afterwards.
- `gameplay` leaves every bullet, the boss's logical position and the damage she takes identical. Proven by `scripts/boss-shots.mjs`, not by this journey.

## How to get to it (user POV)

- Fight Crimson Seraph on stage 5 or Void Empress on stage 10 and watch her attack. The ultimates come in each second form.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- `boss.motion` is `{ moves: [{ pattern, tier, ms }], pose, art }`. `moves` lists each motion playing now, including the next pattern's wind-up once it starts. `ms` is from that pattern's release and is negative while it winds up or charges. `pose` is `{ dx, dy, sx, sy, rot, glow, flash, aura, ghosts, darken, glint, cast }`. `art` is the casting-pose texture while it shows, otherwise `null`.
- `bossPattern(pattern)` plays a pattern after a short gap and then holds her cycle, so each move is seen on its own. `bossPattern(null)` holds the cycle.
- Expected tiers, wind-ups and tails come from `MOTIONS`, `leadMs` and `tailMs` in `/src/game/bossMotion.ts`.

Run `drive.mjs <run-id> boss-moves`. For each boss form it holds her cycle, forces each pattern that form uses (all ten are covered across the four forms), and pauses on the first animation frame past each beat that is clear of the camera flash and of her white hit flash.

- **Light and heavy.** `windup` at -40 ms, `peak` at +55 ms, `release` at +170 ms (light) or 45% of the tail (heavy). Each frame is posed, never at rest.
- **Ultimates.** `charge` at -20% of the charge, `release` at +230 ms (past the release flash), `follow` at 55% of the tail. On `charge` she is `casting`, `pose.cast` is 1 and `art` is the form's casting art when it exists, otherwise `null`.
- **Rest.** After each motion's tail `moves` is empty, `pose` equals `REST` and `art` is `null`.
- **Freeze.** On the Eclipse form, mid-charge of `eclipseNova`, a full gauge and `Space` start the cut-in. At `cutInMs` 200 and 600 `boss.motion` and `castMsLeft` are identical and posed, and after the cut-in the motion carries on.

Proof screenshots, per boss id: `<id>-form<n>-<tier>-<pattern>-<beat>` for every beat above, and `cut-in-frozen-eclipseNova`.

## Proving gameplay is unchanged

`scripts/boss-shots.mjs <run-id> --against <record>` replays both fights deterministically and diffs every bullet, the boss's logical path, foes and the tally with a record saved from the build before the change. It reports how many frames she was posed, so a `SAME` with zero posed frames would mean the motion never ran.

## Gotchas

- Auto-fire flashes her white for 70 ms every 180 ms while she sits over the ship, so a screenshot that ignores `hitFlash` often shows a white silhouette.
- Motion must never call `Math.random`, add camera shakes or emit particles. Any of these shifts later random draws, and the replay then reports a gameplay diff.
