# Sound effects

Every one-shot sound effect is a recipe in `SOUNDS` in `src/audio/sfxRecipes.ts`. A recipe is a list of layers plus a `minGapMs` that rate-limits the sound by name. A layer is a `tone` (an oscillator swept from one frequency to another) or a `noise` (synth's seeded noise through a swept biquad filter). Each layer has its own length, gain, optional attack and optional delay. A layer with no attack starts at full gain and decays exponentially, the way every sound did before layers existed. `sfx(name, pitch?)` in `src/audio/sfx.ts` plays one on the shared `AudioContext`, straight to the speakers under the music bus, and `blip(ctx, out, name, at, pitch?)` schedules one on any context for offline renders. `pitch` scales every frequency in the recipe. Nothing here draws from `Math.random`.

## Sub-features

- `legacy` covers `pop`, `boom`, `hurt`, `buy`, `deny`, `dash`, `phase`, `transAm` and `powerDown`. They are single tone layers with their old numbers and render sample-identical to the build before layers. The music is levelled against `pop`, so do not retune them.
- `shot` sounds once per `Gun` volley, never per bullet, drone shot or missile. It is a 55 ms triangle pew from 1.5 kHz down to 560 Hz with a 20 ms highpassed noise tick, at about 0.4 times `pop`'s loudness and under its peak. `shotPitch` steps consecutive volleys through four pitches less than a semitone apart, by volley count. It is silent while TRANS-AM is active, because `TransAmSound` zips every volley then. Its 35 ms gap sits under the fastest volley interval outside TRANS-AM (Hair Trigger III, Overdrive II and Overclock, about 52 ms).
- `laser` is the zap as the beam fires. It layers a saw from 1.9 kHz down to 240 Hz, a bandpassed noise crack from 7 kHz down to 1.6 kHz and a sine thump, over 200 ms.
- `beam` is the buzz under the rest of the beam, `LaserSound` in `src/audio/laserSound.ts`. Two detuned saws at 110 and 220 Hz and a bandpassed hiss run through a resonant lowpass with a 32 Hz tremolo (`LASER_BUZZ`). `Laser` calls `hold()` on every frame the beam burns, which starts the buzz if it is not playing, and `stop()` when the beam ends, which fades it out over 80 ms. The TRANS-AM cut-in freezes the beam, so `World.activateTransAm` stops the buzz, and a beam still burning after the cut-in buzzes again without a second zap. `World.silenceTransAm` (every stage end, from `StageScene.end`) and the scene's `shutdown` call `endStage()`, after which the buzz never starts again. The beam itself keeps burning through the outro.
- `orbital` is the orbital cannon's strike, on the frame its damage lands. It layers a square crack, a sine drop from 200 Hz to 38 Hz and lowpassed noise closing from 4.2 kHz to 180 Hz, over 520 ms.
- `cast` is one sound per boss move, keyed by the move's tier in `MOTIONS` (`src/game/bossMotion.ts`) through `CAST_SOUND`. `castLight` is a 300 ms rising bandpass whoosh over a falling triangle. `castHeavy` is a lower 520 ms whoosh with a saw and triangle drop an octave down. `castUltimate` swells under the whole charge for 980 ms, a bandpass sweep from 180 Hz to 3.2 kHz over two rising tones, so it peaks into the release `boom`. Light and heavy moves sound on the frame they release. An ultimate sounds as its charge starts, in place of the old `phase` sweep there. `CAST_PITCH` plays the Crimson Seraph's casts 1.3 times higher and the Void Empress's 0.72 times lower. `sweepLaser` is a heavy move in `MOTIONS`, so it plays `castHeavy`.

## How to get to it (user POV)

- Fight any stage for the gun. Buy Prism Lance for the laser and Orbital Cannon for the strike.
- Fight Crimson Seraph on stage 5 or Void Empress on stage 10 for the casts. The ultimates come in each second form.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- `state().sfx` is `{ played, beam }`. `played` counts each sound name that has played since load, after its rate limit. `beam` is `{ starts, stops, live }`: buzzes started and stopped since load, and buzzes whose nodes are still sounding.

Run `drive.mjs <run-id> sfx`. `Shift` starts the audio. A recorder in the page samples state every animation frame.

- **Gun.** Stage 4 in god mode, over 3 s of fighting: the shots played are within 1.5 of the fighting time over `stats.fireIntervalMs`, with the base gun (320 ms) and with Hair Trigger III under Overclock (115 ms).
- **TRANS-AM.** A full gauge and `Space`: across 400+ active frames no shot plays while the TRANS-AM zips count up, and shots play again while depleted.
- **Laser.** Stage 1 with Prism Lance III, two beams: on the frame each fires the zap plays once and one buzz starts, the buzz is live while it burns, it stops on the frame the beam ends, and 250 ms later no node is live.
- **Cut-in.** Prism Lance with Long Discharge III, `Space` mid-beam: the buzz stops and stays silent through the cut-in while the beam is frozen on, after it the buzz starts once more with no second zap, and stops when that beam ends.
- **Endings.** A stage clear (`kill()`) and a defeat (`hurt()` until the run is lost), each mid-beam: the buzz stops once, nothing is live 250 ms into the outro while the beam still burns, and no buzz starts again.
- **Orbital.** Stage 3 with Orbital Cannon: `orbital` plays once, on the frame the cannon's slot goes from aiming to cooling.
- **Newtype flash.** After `Shift`, `state().newtypeFlash` turns `ready` with a gain. Stage 4, before the TRANS-AM check: `Space` on an empty gauge leaves `newtypeFlash.played` and the `transAm` count unchanged and the gauge charging, and `Space` on a full gauge raises `newtypeFlash.played` by one, on one frame, and plays `transAm` once, across the whole TRANS-AM. The flash is a sample, not a recipe (see [voice](./voice.md)).
- **Casts.** For each boss form, every pattern it uses is forced with `bossPattern` (all ten across the four forms): the cast sound of its tier plays exactly once and the other two not at all. An ultimate's has already played on the first frame she is casting, with `castMsLeft` within 120 ms of the full charge.

## Listening without speakers

```bash
.claude/skills/verify-space-invader/scripts/sfx.mjs <run-id>
```

Renders every sound offline in Chrome through the game's own `blip` and `LaserSound` to `.verify/<run-id>/evidence/sfx-render/`. Each `<name>.wav` is at the in-game level and `<name>-preview.wav` is normalized to a 0.9 peak. It also writes these:

- `castLight-crimsonSeraph`, `castUltimate-voidEmpress` and the rest are each cast at each boss's pitch.
- `beam-default` and `beam-longest` are the zap plus the buzz held at 60 fps for the base `laserDurationMs` and with Long Discharge III, then stopped.
- `gun-fastest` and `gun-overclock` are 3 s of volleys on 60 fps frames at the fastest interval outside TRANS-AM and at base fire rate under Overclock, with the in-game pitch steps, for judging fatigue.

It prints each one's length, peak, RMS over its own length, `loud95` (from `src/audio/loudness.ts`), `loudMax` (the loudest 50 ms anywhere, sliding over the sound padded with silence, so a sound shorter than a window still gets one) and that against `pop`'s. It also prints its peak plus the loudest boss score's peak at the in-game music level. It fails on a console error and when any of these holds:

- A render's peak is under 0.001.
- A peak plus the loudest boss score's peak reaches 1.
- A sound rings on more than 20 ms past its recipe.
- A beam sounds for a length more than 120 ms off its beam.
- `shot`'s `loudMax` or peak is not under `pop`'s.
- A cast sound, at either boss's pitch, has a `loudMax` under 1.5 times the loudest boss score's `loud95`. Casts only ever play over boss music, and the voice line clears the same bar.

## Gotchas

- Counters count only sounds that played. Before the first key or click there is no `AudioContext`, so nothing plays or counts.
- A source started between two samples emits one sample before its start time. Every envelope starts at gain 0, so that sample is silent. The game always starts sounds on the audio clock's own time, so only offline renders at fractional times hit it.
- `boss-shots.mjs` proves the sounds leave gameplay alone. Nothing here may call `Math.random`.
