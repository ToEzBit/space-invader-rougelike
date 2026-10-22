# Background music

Three chiptune tracks synthesized with WebAudio, plus one song file the user supplies for the Void Empress. The scores are `TRACKS` in `src/audio/tracks.ts`, one bar per string and one token per 16th-note step: a note (`A4`, `C#5`, `Bb3`), a chord (`E4+G4+B4`), a drum hit `x` or accented hit `X`, a rest `.`, or `-` to hold the previous one (`TOKEN` and `parseBars` in `src/audio/score.ts`). `src/audio/synth.ts` turns a step into oscillators and noise, and `src/audio/music.ts` schedules steps on the shared `AudioContext` clock from a 25 ms timer with 200 ms of lookahead.

## Sub-features

- `normal` (Starlane Patrol, A minor, 138 bpm, 16 bars) plays on Title, Shop, End and every wave stage. It carries across those scenes without restarting.
- `boss1` (Crimson Verdict, E minor, 150 bpm, 16 bars) plays from the start of stage 5 while the Crimson Seraph is in her first form.
- `boss2` (Crimson Verdict II, F minor, 172 bpm, 16 bars) takes over the moment the Seraph starts transforming, before her form flips at the reveal, and plays until she dies. It has a 16th-note lead, a rolling arpeggio, nonstop octave bass and about twice the drum hits per bar of `boss1`.
- `empress` is the song in `public/music/void-empress.ogg`, or `void-empress.mp3` when there is no `.ogg` (`FILE_TRACKS` in `src/audio/tracks.ts`). The user drops it there; `.gitignore` keeps audio in that folder out of git. It loops on one `AudioBufferSourceNode` for the Empress's whole fight, both forms, with no restart at her transformation. It is fetched and decoded the first time stage 10 wants it, then cached for the session. Until it has loaded the stage holds whatever was already playing.
- `fallback` is for a song that is missing or does not decode. The Empress then fights to `boss1` and, from her transformation, `boss2`, and the console gets one `music:` warning naming both paths tried and why each failed, such as `HTTP 404` or `EncodingError`.
- `loudness` sets the song's own gain so its `loud95` (the 95th-percentile RMS over 50 ms windows) matches `boss1` on the bus. `gainToMatch` in `src/audio/loudness.ts` computes it once per decoded buffer against `BOSS1_PRE_BUS_LOUD95`, boss1's level before the bus.
- `director` is `cueFor` in `src/audio/director.ts`, a table from `BossId` and form to a cue: a score id, or a song file with the score that stands in for it. `sourceFor` turns the cue and the song's load status into what plays. A stage asks for its cue every frame and only a different source crossfades over 0.8 s. A dead boss asks for no track, so the music fades out under the clear, and the shop brings `normal` back.
- `audio clock` keeps the music stepping through anything that pauses a scene, the TRANS-AM cut-in included.
- `mute` is `M`, anywhere. It ramps the music bus to 0 and back, keeps the track's place, and is stored in `localStorage` (`space-invader.musicMuted`). Title shows `M · เพลง เปิด` or `M · เพลง ปิด` top left, and a click on it toggles too.
- `mix` puts the music on its own bus at `MUSIC_VOLUME` under the sfx, which go straight to the destination. `TRACK_LEVEL` plays the boss tracks and the Empress's song at twice the normal track's level, so boss fights sound bigger.

## How to get to it (user POV)

- Press any key or click on Title. Browsers start audio only after a gesture, so Title is silent until then.
- Reach stage 5 for the boss tracks, and bring the Seraph down to her transformation threshold for `boss2`.
- Drop a song into `public/music/` as `void-empress.ogg` or `void-empress.mp3` and reach stage 10 for `empress`. Without one, stage 10 plays `boss1` and `boss2`.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- `state().music` is `{ track, source, fellBack, playing, url, trackGain, files, muted, ctx, busGain, cutoffHz, step, plays }`. `track` is what the game asks for (`empress` through the Empress's whole fight), `source` what that resolves to right now (`holdWhileLoading` while her song loads, `null` for silence), `fellBack` whether the song failed and a score stands in, `playing` what the scheduler has started (`null` before the first gesture or after a fade out), `ctx` the context state (`null` before the first gesture), `url` the song file playing (`null` for a score), `trackGain` the playing track's own live gain, `files.empress` the song's `status` (`idle`, `loading`, `ready` with its `url` and matched `gain`, or `failed` with each path `tried` and why), `busGain` the live music bus gain, `cutoffHz` the live cutoff of the lowpass after the bus (fully open except under TRANS-AM, see [TRANS-AM sound](./trans-am-sound.md)), `step` the steps scheduled so far in a playing score (`null` for a song file), and `plays` how many tracks have started since load.

Run `drive.mjs <run-id> music`.

- **Gesture.** On Title before any key `track` is `normal` and `ctx` is `null`. `Shift` starts `normal` on a `running` context at `MUSIC_VOLUME`.
- **Continuity.** `Enter` into stage 1 keeps `normal` playing with `plays` still 1 and `step` still climbing.
- **Cut-in.** With a full gauge, `Space` starts the cut-in. Across it the first foe does not move and `step` advances by at least 80% of the steps that fit in the frozen time.
The journey serves `/music/void-empress.*` itself with `page.route`, so a song the user has dropped into `public/music/` does not change the result. It first answers with what the dev server sends for a file that does not exist.

- **Seraph.** Stage 5 starts on `boss1` with the boss in form 0. `bossHp` below `transform.atHpRatio` turns `source` to `boss2` on the first frame the stance is `transforming`. The second form fights to `boss2`. After `kill()`, `track` is `null`, the music goes silent, and the shop plays `normal`. Nothing has fetched the song yet.
- **Empress, no song.** Stage 10 asks for `empress` and plays `boss1` with `fellBack` set, then `boss2` from the transformation. Both paths were fetched once, `.ogg` then `.mp3`, and one `music:` warning names them.
- **Empress, own song.** After a reload the route serves a 4 s loud looping WAV (built in Node, sent as `audio/wav`) for the `.ogg`. Stage 5 still plays `boss1` then `boss2`. Stage 10 plays `empress` from `/music/void-empress.ogg` from her entrance through the transformation into her second form with `plays` unchanged, and the song was fetched once with no warning. The tone's own `loud95` times `trackGain` times `MUSIC_VOLUME` lands within 20% of an offline `boss1` render's `loud95`, with `trackGain` under 0.6. An init script taps every realtime `AudioContext` destination with an `AnalyserNode`, and with the stage paused (no sfx) the output RMS is within 20% of the tone's RMS times `trackGain` times `MUSIC_VOLUME`. `M` mutes it with `empress` still playing, and the tapped output reads 0.
- **Mute.** Between the two Empress fights, `M` ramps `busGain` under 1e-4 with the track still `playing`. After a reload and a gesture it is still muted. `M` again brings `busGain` back to `MUSIC_VOLUME`, and that also survives a reload.
- **Proof.** `01-title` shows the music hint top left. `02-title-music-hint` is a close-up reading `M · เพลง เปิด`. `03-seraph-second-form` and `04-empress-second-form` show each boss in her second form with `boss2` playing (the Empress's fallback). `05-title-music-muted` reads `M · เพลง ปิด`.

## Listening without speakers

```bash
.claude/skills/verify-space-invader/scripts/music.mjs <run-id>
```

Renders one loop of each track in Chrome with `OfflineAudioContext`, through the game's own `playStep`, `MUSIC_VOLUME` and `TRACK_LEVEL`, and writes `.verify/<run-id>/evidence/music/<track>.wav` at the in-game level, `<track>-preview.wav` normalized to a 0.9 peak for listening, and `report.json`. It prints each track's bpm, bars, seconds, peak, RMS and `loud95` (the 95th-percentile RMS over 50 ms windows), each channel's solo peak and RMS, and the same for the `pop`, `boom`, `hurt` and `buy` sfx. It fails on a console error, a channel that renders silent, a level-1 track (`normal`) whose `loud95` is not under the quietest sfx's loudest window (`pop`), or a track whose peak plus the loudest sfx's peak reaches 1. `loudVsSfx` compares a track's `loud95` with the median sfx's loudest window. `normal` sits near 0.3 and the boss tracks near 0.6 to 0.7. It also fails when boss1's pre-bus `loud95` drifts more than 2% from `BOSS1_PRE_BUS_LOUD95`, the target song files are matched to. The TRANS-AM voice lines are checked here too, see [voice](./voice.md).

## Gotchas

- A fresh browser context has no audio context until a key or click. `__game.start` from `evaluate` is not a gesture, so press a harmless key such as `Shift` first.
- `step` counts scheduled steps, 200 ms ahead of the audio clock, so it runs a couple of steps ahead of what is audible.
- `vite.config.ts` keeps `.claude/**` out of the dev server's watcher, so a server launched from an agent worktree under `.claude/worktrees/` serves stale modules after an edit. Relaunch it.
