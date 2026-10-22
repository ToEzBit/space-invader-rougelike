# Background music

Three chiptune tracks synthesized with WebAudio, no audio files. The scores are `TRACKS` in `src/audio/tracks.ts`, one bar per string and one token per 16th-note step: a note (`A4`, `C#5`, `Bb3`), a chord (`E4+G4+B4`), a drum hit `x` or accented hit `X`, a rest `.`, or `-` to hold the previous one (`TOKEN` and `parseBars` in `src/audio/score.ts`). `src/audio/synth.ts` turns a step into oscillators and noise, and `src/audio/music.ts` schedules steps on the shared `AudioContext` clock from a 25 ms timer with 200 ms of lookahead.

## Sub-features

- `normal` (Starlane Patrol, A minor, 138 bpm, 16 bars) plays on Title, Shop, End and every wave stage. It carries across those scenes without restarting.
- `boss1` (Crimson Verdict, E minor, 150 bpm, 16 bars) plays from the start of stage 5 and stage 10 while the boss is in her first form.
- `boss2` (Crimson Verdict II, F minor, 172 bpm, 16 bars) takes over the moment the boss starts transforming, before her form flips at the reveal, and plays until she dies. It has a 16th-note lead, a rolling arpeggio, nonstop octave bass and about twice the drum hits per bar of `boss1`.
- `director` is `trackFor` in `src/audio/director.ts`. A stage asks for its track every frame and only a different track crossfades over 0.8 s. A dead boss asks for no track, so the music fades out under the clear, and the shop brings `normal` back.
- `audio clock` keeps the music stepping through anything that pauses a scene, the TRANS-AM cut-in included.
- `mute` is `M`, anywhere. It ramps the music bus to 0 and back, keeps the track's place, and is stored in `localStorage` (`space-invader.musicMuted`). Title shows `M · เพลง เปิด` or `M · เพลง ปิด` top left, and a click on it toggles too.
- `mix` puts the music on its own bus at `MUSIC_VOLUME` under the sfx, which go straight to the destination.

## How to get to it (user POV)

- Press any key or click on Title. Browsers start audio only after a gesture, so Title is silent until then.
- Reach stage 5 or 10 for the boss tracks, and bring the boss down to her transformation threshold for `boss2`.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- `state().music` is `{ track, playing, muted, ctx, busGain, step, plays }`. `track` is what the game asks for, `playing` what the scheduler has started (`null` before the first gesture or after a fade out), `ctx` the context state (`null` before the first gesture), `busGain` the live music bus gain, `step` the steps scheduled so far in the playing track, and `plays` how many tracks have started since load.

Run `drive.mjs <run-id> music`.

- **Gesture.** On Title before any key `track` is `normal` and `ctx` is `null`. `Shift` starts `normal` on a `running` context at `MUSIC_VOLUME`.
- **Continuity.** `Enter` into stage 1 keeps `normal` playing with `plays` still 1 and `step` still climbing.
- **Cut-in.** With a full gauge, `Space` starts the cut-in. Across it the first foe does not move and `step` advances by at least 80% of the steps that fit in the frozen time.
- **Bosses.** Stage 5 and stage 10 each start on `boss1` with the boss in form 0. `bossHp` below `transform.atHpRatio` turns `track` to `boss2` on the first frame the stance is `transforming`. The second form fights to `boss2`. After `kill()` on the Seraph, `track` is `null`, the music goes silent, and the shop plays `normal`.
- **Mute.** `M` ramps `busGain` under 1e-4 with the track still `playing`. After a reload and a gesture it is still muted. `M` again brings `busGain` back to `MUSIC_VOLUME`, and that also survives a reload.
- **Proof.** `01-title` shows the music hint top left. `02-title-music-hint` is a close-up reading `M · เพลง เปิด`. `03-seraph-second-form` and `04-empress-second-form` show each boss in her second form with `boss2` playing. `05-title-music-muted` reads `M · เพลง ปิด`.

## Listening without speakers

```bash
.claude/skills/verify-space-invader/scripts/music.mjs <run-id>
```

Renders one loop of each track in Chrome with `OfflineAudioContext`, through the game's own `playStep` and `MUSIC_VOLUME`, and writes `.verify/<run-id>/evidence/music/<track>.wav` at the in-game level, `<track>-preview.wav` normalized to a 0.9 peak for listening, and `report.json`. It prints each track's bpm, bars, seconds, peak, RMS and `loud95` (the 95th-percentile RMS over 50 ms windows), each channel's solo peak and RMS, and the same for the `pop`, `boom`, `hurt` and `buy` sfx. It fails on a console error, a channel that renders silent, a track whose `loud95` is not under the quietest sfx's loudest window (`pop`), or a track whose peak plus the loudest sfx's peak reaches 1. `loudVsSfx` compares a track's `loud95` with the median sfx's loudest window. The tracks sit near 0.3.

## Gotchas

- A fresh browser context has no audio context until a key or click. `__game.start` from `evaluate` is not a gesture, so press a harmless key such as `Shift` first.
- `step` counts scheduled steps, 200 ms ahead of the audio clock, so it runs a couple of steps ahead of what is audible.
- `vite.config.ts` keeps `.claude/**` out of the dev server's watcher, so a server launched from an agent worktree under `.claude/worktrees/` serves stale modules after an edit. Relaunch it.
