# TRANS-AM cut-in

`Space` on a full gauge spends it, turns TRANS-AM `active` with `msLeft` at `activeMs`, and plays a cut-in in the style of Persona 3 Reload before the active time starts. It lasts one second when silent, or as long as the pilot's voice line takes to reach its shout (see [voice](./voice.md)). The stage is frozen the whole time: foes, enemy bullets, boss drift and pattern timers, the ship, player shots, buffs, item timers and the active countdown all hold, and `clock.fightMs` does not advance. The timeline is `CUT_IN` in `src/core/cutIn.ts` and the view is `src/game/cutIn.ts`.

## Sub-features

- `dim` darkens the whole viewport, letterbox included, over `dimMs`.
- `band` slides a band tilted -8 degrees in from the left, with black bars and red edges around the pilot's eye strip, red speed lines, and a slanted white-and-red `TRANS-AM` title. The eyes crossfade from blue to red over `bandMs`. Only the irises change. A voiced cut-in holds the band longer: the slide and title keep their timing and the eyes crossfade over the longer hold, red 120 ms before the slash.
- `slash` cuts a white blade of light across the band, flashes the screen white and slides the band out over `slashMs`.
- `freeze` holds the stage. Boss patterns run on the scene clock, so the cut-in pauses it and the tween manager too.
- `input` keeps dash and item presses made during the cut-in queued, so each fires once on the first frame after. A `Space` press during it does nothing, not even a refusal afterwards. Held movement keys move the ship again once it ends.
- `release` starts on the first frame after the cut-in: the pink shockwave clears bullets within `clearRadiusPx`, with the flash and shake. The active time then runs its full `activeMs` of fighting time.

## How to get to it (user POV)

- Fill the TRANS-AM gauge and press `Space` while fighting.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- `state().life` is `cutIn` during the cut-in and `cutInMs` is how far into it the stage is. `foeSpots` lists every live foe's position. `__game.shots()` lists enemy bullets with stable ids.
- Expected times come from `CUT_IN` and `CUT_IN_MS` in `/src/core/cutIn.ts` and `TRANS_AM` in `/src/core/transAm.ts`.

Run `drive.mjs <run-id> cut-in`. It runs at device scale 2. It serves the voice files as 404, so every cut-in in it is the silent one-second one on frame time and its pauses hold it. Each screenshot pauses on the first animation frame past a `cutInMs` threshold, polled inside the page so a 100ms beat cannot slip between reads.

- **Start.** Stage 4 in god mode with a Nitro and a full gauge waits for enemy bullets near the ship, then presses `Space`. Mid dim, `life` is `cutIn` and TRANS-AM is `active` with `msLeft` exactly `activeMs`.
- **Input.** `x` and `Space` pressed mid band leave Nitro held and no buff running while the cut-in plays, and the cut-in keeps going instead of restarting.
- **Freeze.** From the dim frame to the slash frame every enemy bullet (ids and positions), every foe, the ship, `tally.fired`, `clock.fightMs`, the buffs and `transAm` are unchanged, and the bullets near the ship are still there.
- **After.** The first fighting frame has `msLeft` above `activeMs - 60`. Nitro then fires once (held 0, one `nitro` buff). Once the release ends no bullet is within `clearRadiusPx - 20` of the ship. `depleted` comes `activeMs` of fighting time after the press, within 250ms.
- **Boss.** In the stage 5 fight with `ArrowLeft` held, the boss, its bullets and the ship hold still from the band to mid slash. After the cut-in the held key moves the ship left.
- **Proof.** `01-dim` shows the stage darkened with no band. `02-band-crossfade` shows the band with the eyes halfway from blue to red (purple irises) and the title. `03-eyes-red` shows them fully red. `04-slash` shows the white blade across the eyes. `05-flash` shows the white flash over the band. `06-release` shows the pink flash and the shockwave ring around the ship. `07-after-release` shows the active ship with no bullets near it.

## Gotchas

- `pause()` releases held keys, so the held-key freeze check in the boss fight reads frames without pausing.
- `kill()`, `hit()`, `hurt()` and `transAmGauge()` call the stage directly and bypass the freeze. Keep them out of the cut-in window.
- `measure.mjs` counts `cutIn` as still fighting, since the cut-in freezes the fight without ending it.
