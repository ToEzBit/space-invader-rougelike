---
name: verify-space-invader
description: Launch and drive the Space Invader Roguelike Phaser web game in a real browser (system Google Chrome via Playwright) to prove gameplay, shop, perk, boss and run-end behavior with screenshots and state logs. Use after any change under src/ before claiming it works, or when asked to run, screenshot, or verify the game.
---

# Verify Space Invader Roguelike

The game is a single-page Phaser 4 canvas app served by Vite. There is no DOM UI to select: everything renders into one `<canvas>`. Input is the keyboard on a desktop, and touch on a phone (drag to steer, tap the tray, cards and buttons). State is read through a dev-only hook, `window.__game`, which exists only under `vite` dev (never in `vite build` output).

All helpers live in `.claude/skills/verify-space-invader/scripts/` and are run from the repo root. Every run gets a run id. Instance state goes to `.verify/<run-id>/instance/`, proof goes to `.verify/<run-id>/evidence/` (gitignored, survives cleanup).

## Launch

```bash
.claude/skills/verify-space-invader/scripts/launch.sh <run-id>
```

- Installs deps with `npm ci` only if `node_modules/phaser` or `node_modules/playwright` is missing.
- Starts `vite --host 127.0.0.1 --port <free port> --strictPort` in the background. pid, port and `vite.log` go to `.verify/<run-id>/instance/`.
- Ready means usable. The script waits for Vite's `ready in` log line and an HTTP 200, then runs the doctor, which loads the page in Chrome and waits for the `Title` scene. It prints `RUN_ID=` and `URL=` only after that passes.
- No database, seed data, env vars or auth. A run always starts from a fresh browser context, so there is no saved state to reset.
- Browser is the installed Google Chrome (`channel: 'chrome'`). Do not run `npx playwright install`; the user declined downloading Playwright's bundled Chromium.
- `drive.mjs` passes Chrome `--disable-audio-output`, so audio renders to a fake output stream and journeys never depend on the speakers. A sleeping or busy output device otherwise stalls the realtime `AudioContext` clock while its state still reads `running`.

## Doctor

```bash
.claude/skills/verify-space-invader/scripts/doctor.sh <run-id>
```

Read-only. Fails with a `DOCTOR FAIL:` reason unless all hold: the recorded pid is alive and is this run's `vite --port <port>`, that pid owns the listening port, `/` serves `<title>Space Invader Roguelike</title>`, and in Chrome `window.__game` exists and the `Title` scene becomes active with no console errors. It prints the git build (`<sha>` or `<sha>+dirty`). Run it first whenever anything looks off.

## Drive

```bash
.claude/skills/verify-space-invader/scripts/drive.mjs <run-id> <journey...|all> [--headed]
```

Journeys: `doctor`, `title-start`, `combat`, `gunner-fan`, `movement`, `shop`, `shop-tooltip`, `perk-mechanics`, `skill-hud`, `items`, `trans-am`, `cut-in`, `voice`, `trans-am-sound`, `graze`, `summon`, `boss-forms`, `boss-moves`, `enemy-hp`, `bosses`, `run-end`, `viewport`, `music`, `mobile`, `sfx`. `all` runs every journey except `doctor`. Each journey gets a fresh browser context at 600x800 unless it sets its own. `viewport` also opens its own contexts at 1920x1080, 1366x768@2x and 800x1280 and resizes a live page. `mobile` opens its own 390x844 phone context (deviceScaleFactor 3, `isMobile`, `hasTouch`) and drives it with CDP touch events. Prints `PASS <journey>` or `FAIL <journey>: <reason>` and exits 1 if any failed. The feature map in `features/` says what each journey proves.

Stable handles (there are no selectors on a canvas):

- Keys: the arrow keys or `w`/`a`/`s`/`d` move (left and right, and up and down inside the bottom zone), `Shift` dashes once unlocked, `Space` starts TRANS-AM on a full gauge during a fight (and starts a run from Title), `Enter` starts from Title, continues from Shop, and restarts from End. `m` mutes and unmutes the music anywhere. In the shop `1`/`2`/`3` buy a card, `r` refreshes. During a fight `z` `x` `c` `v` `b` use the matching held item (Repair Kit, Nitro, Power Cell, Overclock, Barrier Capsule), matched on `KeyboardEvent.code`, with `1` to `5` as a silent fallback. There is no fire key. The gun, and the laser once unlocked, fire on their own while `life` is `fighting`, never during `intro`, `cutIn` or `ending`.
- Touch: in a context with `hasTouch`, the page matches `(pointer: coarse)` and `state().input` is `touch` (else `keys`), which switches the wording and moves the tray into the band under the playfield. A finger that goes down anywhere but a tray slot steers: the ship flies toward where it was plus how far the finger has moved since, at no more than `stats.moveSpeed`. A tap on the TRANS-AM, dash or an item slot presses it. `page.touchscreen` only taps, so `mobile` sends `Input.dispatchTouchEvent` over a CDP session: `touchStart` and `touchMove` list every finger still down, and `touchEnd` lists only the finger that lifts.
- State: `window.__game.state()` returns `{ scenes, input, run, ... }`. `scenes` holds the active scene keys (`Boot`, `Title`, `Stage`, `Shop`, `End`). `run` is the `RunState` from `src/core/run.ts` (`stage`, `money`, `hp`, `perks`, `items`, `transAmGauge`, `phase.kind`, `phase.shop`). In `Stage` it adds `life` (`intro|fighting|cutIn|ending|leaving`), `cutInMs` (time into the TRANS-AM cut-in, `null` outside it), `cutInTotalMs` (how long this cut-in lasts, 1000 when silent), `foes`, `foeSpots` (`{ x, y }` per live foe), `coins`, `player {x,y}`, `laserFiring`, `dashing`, `boss { name, form, hpRatio, phase, stance, minions, deflected, pattern?, castMsLeft?, callout?, motion, hitFlash, x, y, maxHp }` (`stance` is `entering|fighting|casting|transforming|dead`; `pattern`, `castMsLeft` and `callout` exist only while casting; `motion` is `{ moves, pose, art }`, see `features/boss-moves.md`; `hitFlash` is true while she flashes white from a hit; `x`/`y` are her logical position, never the drawn pose), `flashing` (the camera's full-screen flash is running), `god`, `tally { fired, dealt, bossDealt, kills, hits, contacts, grazes }` and `clock { fightMs, frames, capped }`, `transAm` (`{ kind: 'charging', gauge }`, or `{ kind: 'active' | 'depleted', msLeft }`), `graze` (`{ grazes, streak, rushMs, slowMs, pulses, lastGrazedId, lastPulse, sparks }`, holding the counted grazes this stage, grazes since the last landed hit, Adrenaline's and Bullet Time's time left, Static Skin's pulses this stage, the `shots()` id of the bullet counted last, `{ x, y, erased: { id, x, y }[] }` for the last pulse with positions at pulse time, and `{ x, y, blast, hits, crowdOnly }` per live spark, `hits` being the foes it went through so far and `crowdOnly` true once it may only hit small foes, see `features/graze.md`), `summons` (`{ familiars, spiritMs, lastBlockedId, wisps, haunted }`: `{ state, x, y, msLeft? }` per familiar, `state` being `ready`, `resting`, `gone` or `diving` and `msLeft` the rest or absence left, the time until Great Spirit's next dive, the `shots()` id of the bullet Guardian blocked last, `{ x, y, hits }` per live wisp and `{ id, x, y, msLeft }` per haunted foe, see `features/summon.md`), `skills` (`{ id, kind, msLeft? }` per shown HUD skill slot, `transAm` always first), `items` (held counts), `buffs` (`{ buff, msLeft }` per running item buff), `shieldMs`, `invulnMs` (the ship's i-frames left), `hpBars` (`{ id, x, y, maxHp, hpRatio, bar: 'shown' | 'hidden' | 'hud', chipRatio?, msLeft? }` per live damaged foe; `id` is stable for the stage), and `stats` (effective `moveSpeed`, `bulletDamage`, `fireIntervalMs`, `pierce` with buffs, Adrenaline and TRANS-AM folded in), `tray` (`{ button, x, y, r }` in world units per tappable slot: `transAm`, `dash`, or an item id), `pointers` (`{ id, job }` per pointer held down, `job` being `steer` or the tray button it pressed) and `move` (the last move read: `{ kind: 'dir', x, y }` from keys, `{ kind: 'to', x, y }` toward a steering finger's target). In `Shop` it adds `cards` (`{ kind: 'perk' | 'item', id }` per slot, `null` when sold out), `chips` (`{ kind, id, x, y, w, h }` in world units per owned chip) `targets` (`{ id, x, y, w, h }` in world units for `card0`..`card2`, `refresh` and `go`, with no `refresh` in the hangar) and `tooltip` (`{ visible: false }`, or `{ visible: true, kind, id, hasNext, x, y, w, h, below }` while a chip is hovered, or tapped on touch, with a `fadeIns` count either way). Every state also has `view` (`canvas`, `zoom`, `world`, the camera's world view) `music` (`{ track, source, fellBack, playing, url, trackGain, files, muted, ctx, busGain, cutoffHz, step, plays, jingles, ringing, fadingGain }`, see `features/music.md`), `voice` (`{ lines, last, spoken }`, see `features/voice.md`) `transAmSound` (`{ live, releases, humFromMs, ticksAtMsLeft, shots }`, see `features/trans-am-sound.md`) and `sfx` (`{ played, beam }`, the sound effects played per name and the laser buzz's `{ starts, stops, live }`, see `features/sfx.md`).
- Pointer: `page.mouse` takes page coordinates. A world point `(wx, wy)` maps to `box.x + (wx - view.world.x) * box.width / view.world.width`, and the same for y, where `box` is the canvas bounding box. Do not scale by `view.zoom`, which is in backing pixels and doubles at deviceScaleFactor 2.
- Precondition shortcuts: `__game.start(stage, perks?, money?, items?)` jumps to a stage with a loadout, `kill()` kills everything on the current stage, `hurt()` forces one hit, `hit()` lands one hit through the normal damage path (i-frames and shields apply), `bossHp(ratio)` sets boss HP, `bossPattern(pattern)` makes the boss play that pattern after a short gap and then hold her cycle until the next call (`null` just holds it), `god(on)` keeps the ship's i-frames and shields but skips its HP loss (for measurement and long boss journeys; it resets each stage; hits still cost TRANS-AM gauge), `transAmGauge(value)` sets the TRANS-AM gauge and puts it back to charging, `pause()`/`resume()` freeze the stage for a crisp screenshot. `shots()` reads the live enemy bullets as `{ id, kind, x, y }`, ids stable for the stage, so a journey can time one bullet across frames.
- Expected values come from the game's own modules. The page can `import('/src/core/run.ts')` under Vite dev, and `drive.mjs`'s `h.core(expr)` uses that for `refreshCost`, `offerCost` and `deriveStats` (`run`, `perks` and `items` are in scope).

To add a journey, add an entry to `JOURNEYS` in `drive.mjs`, drive the feature with `h.page.keyboard`, assert with `h.check(label, ok, detail)`, capture with `h.shot(name)`, and add or update its file in `features/`.

## Measure

```bash
.claude/skills/verify-space-invader/scripts/measure.mjs <run-id> <cell...|all> [--runs N] [--trans-am [--hit-budget]]
```

Fights a boss with `god(true)` and a ship that weaves left and right under it, one run at a time, and prints one JSON line per run (time-to-kill in game time, hits a real ship would have taken per minute, contact episodes per minute, the fraction of fired shot damage that landed, grazes per minute, mean frame time and the share of frames capped at 50 ms) and a median/range summary per cell. Cells are `s5-typical`, `s5-strong`, `s10-typical` and `s10-strong`, loadouts sized from the coins a run can earn before each boss, plus `s5-graze`, `s5-summon`, `s10-graze` and `s10-summon`, built around their branch at about the typical cell's cost. The weave grazes far more than a careful human, so the graze cells are a proxy. It is not part of `all`. A run takes as long as the fight, so measure against a server whose tree you are not editing (a `git worktree` with `node_modules` symlinked) or Vite reloads the page mid-fight. Discard runs with a high `cappedPct`.

`--trans-am` presses `Space` whenever the gauge is full and the boss can be hurt, and adds a `transAm` block per run: `uses`, `grazesPerMin`, gauge `income` by source while charging (grazes, kills, boss, hits), the normal-fire boss damage rate (charging time outside the boss's entrance and transformation), and per use the boss HP% dealt while active and while depleted (plus a 1.2s tail, since shots take about a second to land) against the same time at the normal rate. `netPctOfFight` is the use's extra boss damage, net of the depleted window, as a share of the fight's total boss damage. `hurtableNetPctOfFight` leaves the boss's immune time out of the comparison, and `activeImmuneS` says how much of the active time that was. A use the boss's death cuts short is `done: false` and stays out of the per-use medians. The weaving ship takes far more hits than one that survives the fight, and each costs gauge, so `--hit-budget` refunds the gauge of every hit past `maxHp - 1`. The weave also grazes differently from a human, so graze rates are a rough proxy.

## Boss bullet replay

```bash
.claude/skills/verify-space-invader/scripts/boss-shots.mjs <run-id> [--out <file>] [--against <file>]
```

Replays both boss fights with a seeded `Math.random` and a virtual clock that steps exact 64 fps frames (1000/64 ms is exact in binary, so the record does not depend on how many frames the page took to boot), so a build reproduces itself bit for bit. Per segment (entrance, each phase of each form for one full pattern cycle, the transformation) it records every enemy bullet's first two positions, the boss's logical `x`/`y`, stance, form, phase and pattern every frame, every foe's position and the tally (hits, contacts, damage dealt to the boss). Boss HP is pinned each frame so the phase under test never changes, and the ship never moves. `--against` diffs with a saved record, prints `SAME` or `DIFF` per segment and exits 1 on any difference. Use it to prove a visual-only change leaves gameplay alone: record on the commit before, then `--against` that file on the commit after. It is not part of `all`.

Anything that calls `Math.random` shifts every later random draw, so a change that adds camera shakes, particle sparks or random visuals shows up here as a gameplay diff even when no rule changed.

## TRANS-AM sound render

```bash
.claude/skills/verify-space-invader/scripts/trans-am-sound.mjs <run-id> [--out <dir>]
```

Renders a full TRANS-AM offline, from the press through `powerDown`, over `boss1` through the music lowpass, to `.verify/<run-id>/evidence/trans-am-sound-render/` (and `--out`). It prints each layer's peak and loudness next to the sfx, the voice line and `boss1`, and the lowpass's drop above 2 kHz. It fails when a layer misses its level target or the peaks can clip. It is not part of `all`. See `features/trans-am-sound.md`.

## Sound effects render

```bash
.claude/skills/verify-space-invader/scripts/sfx.mjs <run-id>
```

Renders every sound effect offline, each boss cast at each boss's pitch, the laser beam at its base and longest duration and 3 s of the gun at its fastest fire rate, to `.verify/<run-id>/evidence/sfx-render/` with peak-normalized previews. It prints each one's length, peak and loudness against `pop` and the boss music. It fails when a sound is silent, could clip over the boss music, outlasts its recipe or beam, when the gun shot is not under `pop`, or when a boss cast does not clear the boss music by 1.5 times. It is not part of `all`. See `features/sfx.md`.

## Music render

```bash
.claude/skills/verify-space-invader/scripts/music.mjs <run-id>
```

Renders one loop of each music track offline to `.verify/<run-id>/evidence/music/<track>.wav` and prints its bpm, length, peak, RMS and per-channel levels against the sfx. It also renders each TRANS-AM voice line as played to `voice-<file>.wav` with its gain, shout time, freeze length and loudness against the music and sfx. It is not part of `all`. See `features/music.md`.

## Evidence

Each journey writes `.verify/<run-id>/evidence/<journey>/`: numbered PNGs, `log.json` (every step's action with state before and after, every check with its values, console errors), and `failure.png` on failure. The folder is wiped at the start of that journey so stale proof never mixes in.

Proof standards:

- Drive the feature under test with real keys, or real touches on the phone context. `__game.start`, `kill`, `hurt`, `hit` and `bossHp` only set up preconditions. They bypass the real path (`start` builds a RunState directly instead of going through Title and the shop), so never cite them as proof of the feature they shortcut.
- Capture the action and the resulting state: `log.json` must show the state change (money, perks, scene, HP), not only the final screenshot.
- Open the screenshots and look at them. A passing state check with a blank, frozen or washed-out frame is not a pass.
- Every journey fails on any browser console error.
- There are no external systems, so no mocks.

## Cleanup

```bash
.claude/skills/verify-space-invader/scripts/cleanup.sh <run-id>
```

Kills only the pid recorded for this run, and only if it is still this run's `vite --port <port>`. Removes `.verify/<run-id>/instance/`. Keeps `.verify/<run-id>/evidence/` and prints its path. Run it after every run, including failed ones. Never kill vite or Chrome by process name; the user may have their own `npm run dev` open.

## Isolation

Runs are isolated by run id, a free port and a fresh browser context, so several runs can go side by side. Do not drive a server you did not start (for example the user's own `npm run dev` on 5173); launch your own.

## Gotchas

- `window.__game` is undefined until the page script runs and in production builds. `drive.mjs` loads the page before any `__game` call.
- Boss phases and the transformation start only after the boss finishes its entrance. The Void Empress takes several seconds to arrive, so wait up to 10s for a form change after `bossHp`.
- A transforming boss absorbs every hit, `kill()` included, for `transform.durationMs`.
- Shop purchases fire a full-screen flash for about half a second. Wait before a screenshot.
- `hurt()` forces past i-frames and the Kinetic Barrier shield, so it cannot prove shields or i-frames. Use `hit()` for those.
- Vite watches the whole repo. A `tsconfig.json` written under it, for example by an agent worktree in `.claude/worktrees/`, full-reloads the page mid-journey, which then fails on a missing state field. Rerun the journey.
- `pause()` releases every held key. A journey that pauses in the middle of a hold finds the ship stopped after `resume()`, so take mid-hold shots live.
- Once the first key has started the audio and the voice lines have decoded, a TRANS-AM cut-in lasts as long as the pilot's line, up to about 2.8 s, and follows the audio clock, so `pause()` during it does not hold it. A journey that needs the silent 1 s cut-in serves the voice files as 404 with `h.serve404`.
- The stage intro banner lasts 1.2s and keeps fading for a moment after `life` turns `fighting`, so early screenshots show a faint `STAGE n` title.
