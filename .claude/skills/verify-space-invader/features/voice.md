# TRANS-AM voice

When TRANS-AM starts, the pilot says a short lead-in and then shouts "TRANS-AM!". The lines are MiniMax TTS files in `src/assets/voice/` (`VOICE_URLS` in `src/audio/voice.ts`). Every line ends on the shout. They decode once, when the first key or click starts the audio, and play on the sfx path straight to the speakers, so `M` does not mute them.

## Sub-features

- `analysis` is `speechSegments` and `voiceTimeline` in `src/audio/voiceLine.ts`. Speech is every run of 10 ms windows louder than 40 dB under the clip's loudest window, with pauses of up to 200 ms kept inside a run and runs under 60 ms dropped. The line plays as slices of the one decoded buffer, each padded by 30 ms and faded over 5 ms. The silence before and after the speech is dropped and every pause is cut to 200 ms. `shoutAtMs` is where the last segment's speech starts in that timeline.
- `timing` starts the line 100 ms after the press, once the dim is over, and makes the cut-in last until its shout: `CUT_IN.dimMs + shoutAtMs`, never under 1000 ms. The stage stays frozen until then. A voiced cut-in reads the audio clock its line plays on, so dropped frames never let the shout land before the release. The release comes on the frame after the cut-in ends.
- `pick` chooses at random among the loaded lines and never repeats the last one when two or more loaded (`pickLine`). It draws from `crypto`, because the boss replay owns `Math.random`.
- `fallback` is the silent one-second cut-in. It plays when the audio has not started yet (the first key was this `Space`), while the lines are still decoding, or when none loaded. A line that fails to load gets one `voice:` console warning naming the path and why.
- `level` sets each line's gain so its `loud95` as played is `VOICE_LOUD95`, level with the loudest sfx and about twice the boss music on the bus. `music.mjs` renders and checks it.
- `sweep` keeps the `transAm` sfx at the press. The line starts 100 ms later, when the sweep's loudest window has dropped from 0.039 to 0.014, about 9 dB under the line's 0.042.
- `flash` is the Newtype flash, a 1.42 s sample in `src/assets/sfx/newtype-flash.mp3` (`src/audio/newtypeFlash.ts`). It decodes when the audio starts, like the lines, and `TransAmLook.enter('active')` plays it whole beside the sweep, so a refused press plays neither. It plays on the sfx path straight to the speakers, at a gain that makes its `loud95` `FLASH_LOUD95` (0.042, level with the line), with a 5 ms fade at each end. It is loudest 700 to 900 ms in. Over the line, from 100 ms to 1420 ms, its `loud95` matches the line's to within 0.3 dB. The shorter line's shout comes at 1360 ms, so the flash's tail, about 13 dB under the shout, fills the pause before it. Before the audio starts, while decoding or when the file failed to load, the press plays no flash, and a failed load gets one `newtypeFlash:` console warning.

## How to get to it (user POV)

- Press any key on Title, fill the TRANS-AM gauge and press `Space` while fighting.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- `state().newtypeFlash` is `{ status, played }` with `why` when `failed` and `gain` when `ready`. `played` counts flashes started.
- `state().voice` is `{ lines, last, spoken }`. `lines` has one entry per file: `{ url, status: 'loading' }`, `{ url, status: 'failed', why }`, or `{ url, status: 'ready', segments, slices, shoutAtMs, gain }`. A segment is `{ fromSec, toSec }` in the file, and a slice adds `lineAtSec`, where it starts in the line. `last` is the index of the line spoken last, `null` before any, and `spoken` counts lines started. In `Stage`, `cutInTotalMs` is the running cut-in's length.

Run `drive.mjs <run-id> voice`. It runs at device scale 2. The flash file is served as 404 until the last step, so the tap hears only the sweep and the line. An init script taps the game's `AudioContext` output with a 512-sample `AnalyserNode` (Phaser opens a context of its own, so the journey names the game's). Every frame from the press to 40 frames after the release records the tap's RMS on the audio clock, `life`, `cutInMs`, `cutInTotalMs`, the release (TRANS-AM's `msLeft` dropping under `activeMs`), and the bullets, foes, ship, `tally.fired` and `clock.fightMs`.

- **Decode.** `Shift` on Title starts the audio, and both lines become `ready`, each with two or more segments, and the flash `failed`. `M` mutes the music, so the tap hears only sfx and voice.
- **Timing.** Stage 4 in god mode, four presses of `Space` on a full gauge. For each, `cutInTotalMs` is `CUT_IN.dimMs` plus that line's `shoutAtMs` and over 1000. Everything in the stage holds from the first cut-in frame to the last. The last cut-in frame is within one frame of the end. The release fires on the frame after the one that ends the cut-in, with the camera flash running. The tapped output goes quiet in the pause before the shout and turns loud again within 50 ms of the release frame, and stays loud.
- **Pick.** The four lines alternate and both play.
- **Missing flash.** One `newtypeFlash:` warning names the file, its `why` is `HTTP 404`, and the four presses played no flash.
- **Proof.** A fifth press pauses mid band for `stretched-band`, then on the release frame for `release`, then 100 ms into it for `release-ring`.
- **Fallback.** The voice files are served as 404 too and the page reloads. After `Shift` both lines are `failed` and one `voice:` warning names both paths. The cut-in is 1000 ms, nothing was spoken, and the tapped output stays under 0.001 RMS from 600 ms into the cut-in, after the sweep has faded.
- **Flash.** The flash file is served again and the page reloads, with the voice files still missing. After `Shift` the flash is `ready`. One press plays one flash, and the tapped output stays above 0.005 RMS from 600 ms to the end of the silent cut-in, where only the flash still sounds.
- **Proof.** `01-stretched-band` shows the band and title held mid cut-in, with the eyes partway from blue to red. `02-release` is the release's full-screen pink flash. `03-release-ring` shows the shockwave ring around the active ship.

## Listening without speakers

`music.mjs <run-id>` renders each line as played to `.verify/<run-id>/evidence/music/voice-<file>.wav` and prints its gain, `shoutAtMs`, freeze length, peak and `loud95`, its `loud95` against `boss1`, `boss2` and the loudest sfx, and its peak plus the loudest track's and sfx's. It fails unless `loud95` is within 15% of `VOICE_LOUD95`, at least 1.5 times the loudest boss track, and within 30% of the loudest sfx's loudest window, the sweep after 100 ms is 6 dB under the line, and the summed peaks stay under 1.

## Gotchas

- A voiced cut-in follows the audio clock, which `pause()` does not stop. A pause during it does not hold the cut-in, which jumps ahead on resume. Time it unpaused.
- Chrome logs a console error for each 404. `h.serve404(glob)` serves files as missing and lets those errors off.
- A line about 2 s long has about 40 `loud95` windows, so its `loud95` is its second or third loudest window, and a measurement with extra silence reads lower. `music.mjs` renders exactly the line's length.
