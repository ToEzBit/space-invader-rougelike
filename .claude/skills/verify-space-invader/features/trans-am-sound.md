# TRANS-AM sound

TRANS-AM's six active seconds have their own sound. A hit lands on the release frame, a drive hum plays under the active time, every volley zips, ticks count down the last 1.5 s, and the music goes muffled. Everything is synthesized on the shared `AudioContext` with no audio files. The numbers are `TRANS_AM_SOUND` in `src/audio/transAmLayers.ts`, the curves `humAt` and `ticksCrossed` sit beside them, and `TransAmSound` in `src/audio/transAmSound.ts` owns the nodes for one stage. `TransAmLook` drives it from the phase changes `World.setTransAm` already routes.

## Sub-features

- `press` is unchanged. The `transAm` sweep plays at the press, then the cut-in and the pilot's line (see [cut-in](./cut-in.md) and [voice](./voice.md)). Nothing in this feature plays during the cut-in.
- `release` is a sub drop, a short punch and a bright noise whoosh on the release frame, the loudest TRANS-AM sound. The whoosh sweeps down from 9 kHz to 1.8 kHz under the pilot's shout, which lands on the same frame. In the render's spectrogram the shout's harmonics stay clear over it. Its noise is synth's seeded buffer, so nothing draws from `Math.random`.
- `hum` starts on the release frame. A sub saw and a detuned saw an octave up run through a resonant lowpass with a tremolo. It fades in over `fadeInMs`. Its pitch climbs a fifth (55 to 82.4 Hz) and its cutoff rises from 320 to 1900 Hz over `activeMs`. `humAt` gives those targets for the time since the release, and every frame steers the oscillators towards them on game time.
- `shot` is a 30 ms triangle zip from 2.6 kHz to 1.2 kHz, once per `Gun` volley while active, quieter than `pop`.
- `ticks` play at 1500, 1100, 750, 450 and 200 ms left, each closer and higher than the last (1320 to 2640 Hz). A tick fires on the frame whose `msLeft` reaches its time, so frame caps and pauses never move one outside the final window.
- `muffle` is a lowpass on the music bus (`lowpassMusic` in `src/audio/music.ts`). It drops from fully open (the Nyquist frequency, where it passes the music untouched) to 650 Hz over 0.3 s at the release, and opens again over 0.8 s when the active time ends. It sits after the bus gain, so `M` still mutes only the music, and the voice, sfx and TRANS-AM layers stay unfiltered.
- `endActive` fades the hum out over 0.25 s and opens the music again, on `depleted` or any other phase change out of active.
- `endStage` is the same stop for a stage that ends: a clear, a defeat, or a restart through `__game.start`. `StageScene.end` and the scene's `shutdown` call it. After it, the outro frames keep the active look but play no tick, zip or hum. Every source's nodes disconnect once it has ended.
- `mix` puts each layer on its own gain bus to the speakers at `TRANS_AM_SOUND.level`. `trans-am-sound.mjs` renders and checks it.

## How to get to it (user POV)

- Fill the TRANS-AM gauge and press `Space` while fighting.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- `state().transAmSound` is `{ live, releases, humFromMs, ticksAtMsLeft, shots }`. `live` counts the sounds still playing per layer (`release`, `hum`, `shot`, `tick`). `releases` counts release hits since load. The rest describe the latest active time: `humFromMs` is the hum's start on the audio clock, `ticksAtMsLeft` the `msLeft` of each tick played and `shots` the zips played. `state().music.cutoffHz` is the music lowpass's live cutoff.
- `gameBuses()` from `/src/audio/transAmSound.ts` returns the four layer buses, so a journey can tap each one.

Run `drive.mjs <run-id> trans-am-sound`. An init script taps the game's `AudioContext` output with an `AnalyserNode`, and the journey taps each layer bus with another. `M` mutes the music so the output carries only sfx, voice and TRANS-AM. Every frame records each tap's RMS on the audio clock, `life`, `transAm`, `cutoffHz` and `live`.

- **Open.** Before any TRANS-AM the music lowpass is at least 20 kHz.
- **Cut-in.** Stage 4 in god mode, `Space` on a full gauge with the voice lines loaded. Every layer bus reads 0 and no node is live through the whole cut-in.
- **Release.** The hum is heard on its bus within 50 ms of the release frame, and `humFromMs` is within 50 ms of it. The release hit is heard from within 50 ms of the release frame until its 0.6 s decay, and plays once.
- **Hold.** From the end of the fade-in to 50 ms before `depleted`, the hum bus and the output stay above 0.001 RMS with the music muted.
- **Muffle.** From 50 ms after the drop, the cutoff stays at or under 650 Hz while active.
- **Ticks.** Every frame with sound on the tick bus is active with `msLeft` at or under 1500. There are five ticks, each within 60 ms after its time.
- **Shots.** Zips sound only while active. There is one per volley, within 3 of `activeMs` over the active fire interval.
- **Depleted.** 900 ms after `depleted`, nothing is live, every bus reads 0 and the cutoff is back at full.
- **Endings.** For a stage clear (`kill()` in stage 1), a defeat (`hurt()` until the run is lost) and a restart (`__game.start(4)`), each started at 1700 ms or less left (200 ms before the first tick, so the outro would cross them): no tick, zip or release starts after the stage stops fighting, and the taps read 0 from 90 ms after it, once a zip already playing has died away. 1 s after it, nothing is live, every bus reads 0 and the cutoff is full. In the next scene (Shop, End, or the new Stage, paused) nothing is live and the muted output reads under 1e-4.

## Listening without speakers

```bash
.claude/skills/verify-space-invader/scripts/trans-am-sound.mjs <run-id> [--out <dir>]
```

Renders a full TRANS-AM offline in Chrome through the game's own `TransAmSound`, `blip`, `playLine`, `playStep` and `openLowpass`. The frame loop copies `World.update` by hand (the release, the tick, the gun at the active fire interval, then the look), so a change to that order needs the same change here. It runs at 60 fps from the press: the sweep, the first voice line with its shout on the release, the release hit, the hum, the zips, the ticks and `powerDown`, over `boss1` through the muffle. It writes these files to `.verify/<run-id>/evidence/trans-am-sound-render/`, and also to `--out` when given:

- `transam-sequence.wav` is the sequence at the in-game level.
- `transam-sequence-preview.wav` and `transam-before-preview.wav` are the sequence and the same span with only today's sweep, voice and `powerDown` over open music. Both share one gain, normalized to a 0.9 peak, so they compare by ear.
- `stem-<layer>-preview.wav` is each layer alone, normalized.
- `boss1-open.wav` and `boss1-muffled.wav` are the music under the active time, without and with the muffle.
- `report.json` holds every number.

It prints peak, `loud95` and `loudMax` (the 95th-percentile and loudest RMS over 50 ms windows) for each sfx, the voice line, `boss1` and each layer. A sound shorter than one window, the zip and a tick, is compared by its RMS over its own length. It also prints the music's level above 2 kHz with and without the muffle, and the worst-case sum of peaks.

It fails on a console error and when any of these holds:

- The release hit's `loudMax` is not within 0.8 to 1.3 times the loudest sfx's, or is not above every other TRANS-AM sound's.
- The hum's `loud95` is not under 0.75 times `boss1`'s and 0.5 times the voice's.
- A zip's peak or RMS is not under `pop`'s.
- The ticks are not five inside the last 1.5 s.
- The peaks of `boss2`, the hum, the release hit, the loudest sfx and the voice add up to 1 or more, or the rendered sequence peaks at 1.
- The muffle drops `boss1` above 2 kHz by less than 12 dB.

## Gotchas

- A fresh browser context has no audio context until a key or click, so the journey presses `Shift` before it taps anything.
- The analysers read audio rendered a quantum or so after the frame, so the first frame of a sound can read 0. The onset checks allow 50 ms.
- `vite.config.ts` keeps `.claude/**` out of the dev server's watcher, so a server launched from an agent worktree serves stale modules after an edit. Relaunch it before a render.
