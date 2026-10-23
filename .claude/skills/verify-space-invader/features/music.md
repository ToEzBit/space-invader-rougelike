# Background music

Eight looping chiptune tracks and three jingles synthesized with WebAudio, plus one song file the user supplies for the Void Empress. The scores are `TRACKS` in `src/audio/tracks.ts`, one bar per string and one token per step: a note (`A4`, `C#5`, `Bb3`), a chord (`E4+G4+B4`), a drum hit `x` or accented hit `X`, a rest `.`, or `-` to hold the previous one (`TOKEN` and `parseBars` in `src/audio/score.ts`). A step is a 16th note, or a triplet eighth where a track sets `stepsPerBeat` to 3. Each score also declares its key (`tonic`, `mode` and the `borrowed` chords it may use), one chord per bar, and whether it loops. `src/audio/synth.ts` turns a step into oscillators and noise on the voices `pulse50`, `pulse25`, `pulse12`, `vibrato` (a square whose held notes waver after 0.12 s), `triangle` and the three drums. `src/audio/music.ts` schedules steps on the shared `AudioContext` clock from a 25 ms timer with 200 ms of lookahead.

## Sub-features

- `normal` (Starlane Patrol, A minor, 138 bpm, 16 bars) is the main theme. It plays on Title and End, and carries between them without restarting.
- `act1` (Azure Horizon, D major, 128 bpm, 32 bars, 60 s) plays on stages 1 and 2. A high `pulse12` lead runs over a four-on-the-floor kick and open offbeat hats.
- `act2` (Amber Shuffle, G dorian with a borrowed Eb, 108 bpm, 32 bars, 71 s) plays on stages 3 and 4. A `pulse50` lead swings on three steps a beat over a boogie bass.
- `act3` (Hollow Signal, F# minor with a borrowed G and C#, 120 bpm, 32 bars, 64 s) plays on stages 6 and 7. It is a sparse half-time beat, two bars a chord, with a `vibrato` lead and its dotted-eighth echo on `pulse12`.
- `act4` (Umbral Drive, C minor with a borrowed G, 146 bpm, 32 bars, 53 s) plays on stages 8 and 9. A galloping bass and a 3-3-2 kick drive it, and a `pulse50` doubles the `pulse25` lead an octave down from the B section on.
- Each act runs A, A', B, a four-bar breakdown and a four-bar turnaround back into bar 1.
- `shop` (Hangar Lounge, F major, 96 bpm, 32 bars, 80 s) plays in the shop, the hangar before stage 1 included. It has a `triangle` lead, offbeat `pulse12` chords, and a soft kick, snare and hat.
- `clear` (Stage Clear, F major, 1.5 s), `victory` (Victory Fanfare, C major with a borrowed Ab and Bb, 3.6 s) and `defeat` (Ship Down, A minor, 2 s, on the `vibrato` voice) are jingles. Each plays once, from the frame a stage ends. `clear` ends every stage that leads to the shop, the Seraph's included, and resolves into the shop's F major. `victory` ends stage 10, and `defeat` any stage the ship goes down on. Both lead into the A minor main theme on End.
- `boss1` (Crimson Verdict, E minor, 150 bpm, 16 bars) plays from the start of stage 5 while the Crimson Seraph is in her first form.
- `boss2` (Crimson Verdict II, F minor, 172 bpm, 16 bars) takes over the moment the Seraph starts transforming, before her form flips at the reveal, and plays until she dies. It has a 16th-note lead, a rolling arpeggio, nonstop octave bass and about twice the drum hits per bar of `boss1`.
- `empress` is the song in `public/music/void-empress.ogg`, or `void-empress.mp3` when there is no `.ogg` (`FILE_TRACKS` in `src/audio/tracks.ts`). The user drops it there; `.gitignore` keeps audio in that folder out of git. It loops on one `AudioBufferSourceNode` for the Empress's whole fight, both forms, with no restart at her transformation. It is fetched and decoded the first time stage 10 wants it, then cached for the session. Until it has loaded the stage holds whatever was already playing.
- `fallback` is for a song that is missing or does not decode. The Empress then fights to `boss1` and, from her transformation, `boss2`, and the console gets one `music:` warning naming both paths tried and why each failed, such as `HTTP 404` or `EncodingError`.
- `loudness` sets the song's own gain so its `loud95` (the 95th-percentile RMS over 50 ms windows) matches `boss1` on the bus. `gainToMatch` in `src/audio/loudness.ts` computes it once per decoded buffer against `BOSS1_PRE_BUS_LOUD95`, boss1's level before the bus.
- `director` is `cueFor` in `src/audio/director.ts`. It reads a stage moment: the stage, the boss, and the phase the run is heading to. A stage still being fought is heading to `playing`. It gets its wave track from `WAVE_MUSIC`, or its boss's cue by `BossId` and form: a score id, or a song file with the score that stands in for it. A stage that has ended is heading to `shop`, `victory` or `defeat`, and asks for that phase's jingle through the outro and the camera fade. `sourceFor` turns the cue and the song's load status into what plays. A stage asks for its cue every frame and only a different source crossfades over 0.8 s. A dead boss asks for no track, but her stage ends in the frame she dies, so it asks for the clear jingle instead.
- `jingle` is the play-once path in `music.ts`. A jingle ducks the track it replaces, and any still fading, to silence over 0.12 s. It opens the TRANS-AM lowpass as fast, so a stage that ends during TRANS-AM is not muffled. It starts at full level, stops scheduling after its last step, and never restarts while it stays the cue. It is never cut either. A track wanted while a jingle rings starts, and fades in, once the jingle has rung out. That is how the 3.6 s fanfare outlasts the 1.9 s outro into End before Starlane Patrol comes in.
- `audio clock` keeps the music stepping through anything that pauses a scene, the TRANS-AM cut-in included.
- `mute` is `M`, anywhere. It ramps the music bus to 0 and back, jingles included, keeps the track's place, and is stored in `localStorage` (`space-invader.musicMuted`). Title shows `M · เพลง เปิด` or `M · เพลง ปิด` top left, and a click on it toggles too.
- `mix` puts the music on its own bus at `MUSIC_VOLUME` under the sfx, which go straight to the destination. `TRACK_LEVEL` plays the boss tracks and the Empress's song at twice the level of every other track, so boss fights sound bigger. The acts, the shop and the jingles all sit at level 1.

## How to get to it (user POV)

- Press any key or click on Title. Browsers start audio only after a gesture, so Title is silent until then.
- Start a run for `shop` in the hangar, launch stage 1 for `act1`, and clear it for `clear` and then `shop`. Each later wave stage plays its act. Lose the ship for `defeat`, and beat the Empress for `victory`.
- Reach stage 5 for the boss tracks, and bring the Seraph down to her transformation threshold for `boss2`.
- Drop a song into `public/music/` as `void-empress.ogg` or `void-empress.mp3` and reach stage 10 for `empress`. Without one, stage 10 plays `boss1` and `boss2`.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- `state().music` is `{ track, source, fellBack, playing, url, trackGain, files, muted, ctx, busGain, cutoffHz, step, plays, jingles, ringing, fadingGain }`. `track` is what the game asks for (`empress` through the Empress's whole fight), `source` what that resolves to right now (`holdWhileLoading` while her song loads, `null` for silence), `fellBack` whether the song failed and a score stands in, `playing` what the scheduler has started (`null` before the first gesture or after a fade out), `ctx` the context state (`null` before the first gesture), `url` the song file playing (`null` for a score), `trackGain` the playing track's own live gain, `files.empress` the song's `status` (`idle`, `loading`, `ready` with its `url` and matched `gain`, or `failed` with each path `tried` and why), `busGain` the live music bus gain, `cutoffHz` the live cutoff of the lowpass after the bus (fully open except under TRANS-AM, see [TRANS-AM sound](./trans-am-sound.md)), `step` the steps scheduled so far in a playing score (`null` for a song file), `plays` how many tracks and jingles have started since load, `jingles` how many times each jingle has started, `ringing` the jingle still sounding (`null` once it has rung out), and `fadingGain` the summed live gain of the tracks fading out, which is what sounds under a jingle.

Run `drive.mjs <run-id> music`.

- **Gesture.** On Title before any key `track` is `normal` and `ctx` is `null`. `Shift` starts `normal` on a `running` context at `MUSIC_VOLUME`.
- **Acts.** `Enter` on Title opens the hangar, which swaps `normal` for `shop` with `plays` 2. `Enter` there starts stage 1, which swaps `shop` for `act1` with `plays` 3.
- **Cut-in.** With a full gauge, `Space` starts the cut-in. Across it the first foe does not move and `step` advances by at least 80% of the steps that fit in the frozen time.
- **Clear.** `kill()` on stage 1. Every frame from the end of the stage through the camera fade asks for `clear`. `jingles.clear` rises by exactly 1, and from 200 ms after the jingle starts ringing `fadingGain` is under 1e-3. The shop plays `shop`, at a gain under 1e-3 while the jingle still rings. `Enter` from the shop plays `act1` on stage 2, and stages 3, 6 and 8 play `act2`, `act3` and `act4`.
- **Defeat.** `hurt()` on stage 8 until the ship goes down. The same checks hold for `defeat`, and End's `normal` holds a gain of 0 until `defeat` has rung out.

The journey reads every frame of an ending in the page with `requestAnimationFrame`, so no frame between two `evaluate` calls is missed.

The journey serves `/music/void-empress.*` itself with `page.route`, so a song the user has dropped into `public/music/` does not change the result. It first answers with what the dev server sends for a file that does not exist.

- **Seraph.** Stage 5 starts on `boss1` with the boss in form 0. `bossHp` below `transform.atHpRatio` turns `source` to `boss2` on the first frame the stance is `transforming`. The second form fights to `boss2`. After `kill()` she asks for `clear`, never `null`, the same clear checks hold, and the shop plays `shop`. Nothing has fetched the song yet.
- **Empress, no song.** Stage 10 asks for `empress` and plays `boss1` with `fellBack` set, then `boss2` from the transformation. Both paths were fetched once, `.ogg` then `.mp3`, and one `music:` warning names them. After `kill()` the same jingle checks hold for `victory`. It still rings once End is up, and End's `normal` holds a gain of 0 until it has rung out.
- **Empress, own song.** After a reload the route serves a 4 s loud looping WAV (built in Node, sent as `audio/wav`) for the `.ogg`. Stage 5 still plays `boss1` then `boss2`. Stage 10 plays `empress` from `/music/void-empress.ogg` from her entrance through the transformation into her second form with `plays` unchanged, and the song was fetched once with no warning. The tone's own `loud95` times `trackGain` times `MUSIC_VOLUME` lands within 20% of an offline `boss1` render's `loud95`, with `trackGain` under 0.6. An init script taps every realtime `AudioContext` destination with an `AnalyserNode`, and with the stage paused (no sfx) the output RMS is within 20% of the tone's RMS times `trackGain` times `MUSIC_VOLUME`. `M` mutes it with `empress` still playing, and the tapped output reads 0. Then, unmuted, stage 1 is cleared with `kill()` and paused while `clear` rings, and the output carries the jingle. Muted, the same clear reads 0 on the output with `clear` ringing.
- **Mute.** On End after the Empress, `M` ramps `busGain` under 1e-4 with `normal` still `playing`. After a reload and a gesture it is still muted. `M` again brings `busGain` back to `MUSIC_VOLUME`, and that also survives a reload.
- **Proof.** `01-title` shows the music hint top left. `02-title-music-hint` is a close-up reading `M · เพลง เปิด`. `03-seraph-second-form` and `04-empress-second-form` show each boss in her second form with `boss2` playing (the Empress's fallback). `05-title-music-muted` reads `M · เพลง ปิด`.

## Listening without speakers

```bash
.claude/skills/verify-space-invader/scripts/music.mjs <run-id>
```

Renders one loop of each track, and each jingle once with a 0.3 s tail, in Chrome with `OfflineAudioContext`, through the game's own `playStep`, `MUSIC_VOLUME` and `TRACK_LEVEL`, and writes `.verify/<run-id>/evidence/music/<track>.wav` at the in-game level, `<track>-preview.wav` normalized to a 0.9 peak for listening, and `report.json`. It prints each track's bpm, bars, seconds, strong-beat chord-tone share (see the score lint below), peak, RMS and `loud95` (the 95th-percentile RMS over 50 ms windows), each channel's solo peak and RMS, and the same for the `pop`, `boom`, `hurt` and `buy` sfx. It fails on a console error, a channel that renders silent, a level-1 track (every score but the boss tracks, jingles included) whose `loud95` is not under the quietest sfx's loudest window (`pop`), or a track whose peak plus the loudest sfx's peak reaches 1. `loudVsSfx` compares a track's `loud95` with the median sfx's loudest window. The level-1 tracks sit near 0.3 to 0.4 and the boss tracks near 0.6 to 0.7. It also fails when boss1's pre-bus `loud95` drifts more than 2% from `BOSS1_PRE_BUS_LOUD95`, the target song files are matched to. The TRANS-AM voice lines are checked here too, see [voice](./voice.md).

## Score lint

`src/audio/scoreLint.test.ts` runs `lint` from `src/audio/scoreLint.ts` over every score, jingles included. It fails on:

- a pitched note outside the declared key, unless it belongs to a declared borrowed chord in a bar that chord harmonizes.
- a lead whose notes struck on beats 1 and 3 are under 75% tones of the bar's chord. Starlane Patrol scores 0.93, Crimson Verdict 0.78 and Crimson Verdict II 0.84, so the threshold sits under all three.
- a note outside its channel role's range in `RANGE`, such as the bass outside E2 to E4 or the lead outside G3 to G6.
- a loop with nothing sounding in its last beat, and a jingle whose lead does not end on the tonic.

The same file proves the lint catches each of these on a small bad score.

## Gotchas

- A fresh browser context has no audio context until a key or click. `__game.start` from `evaluate` is not a gesture, so press a harmless key such as `Shift` first.
- `step` counts scheduled steps, 200 ms ahead of the audio clock, so it runs a couple of steps ahead of what is audible.
- `vite.config.ts` keeps `.claude/**` out of the dev server's watcher, so a server launched from an agent worktree under `.claude/worktrees/` serves stale modules after an edit. Relaunch it.
