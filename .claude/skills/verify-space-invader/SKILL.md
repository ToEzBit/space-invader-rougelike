---
name: verify-space-invader
description: Launch and drive the Space Invader Roguelike Phaser web game in a real browser (system Google Chrome via Playwright) to prove gameplay, shop, perk, boss and run-end behavior with screenshots and state logs. Use after any change under src/ before claiming it works, or when asked to run, screenshot, or verify the game.
---

# Verify Space Invader Roguelike

The game is a single-page Phaser 4 canvas app served by Vite. There is no DOM UI to select: everything renders into one `<canvas>`. Input is keyboard. State is read through a dev-only hook, `window.__game`, which exists only under `vite` dev (never in `vite build` output).

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

## Doctor

```bash
.claude/skills/verify-space-invader/scripts/doctor.sh <run-id>
```

Read-only. Fails with a `DOCTOR FAIL:` reason unless all hold: the recorded pid is alive and is this run's `vite --port <port>`, that pid owns the listening port, `/` serves `<title>Space Invader Roguelike</title>`, and in Chrome `window.__game` exists and the `Title` scene becomes active with no console errors. It prints the git build (`<sha>` or `<sha>+dirty`). Run it first whenever anything looks off.

## Drive

```bash
.claude/skills/verify-space-invader/scripts/drive.mjs <run-id> <journey...|all> [--headed]
```

Journeys: `doctor`, `title-start`, `combat`, `movement`, `shop`, `perk-mechanics`, `skill-hud`, `items`, `enemy-hp`, `bosses`, `run-end`, `viewport`. `all` runs every journey except `doctor`. Each journey gets a fresh browser context at 600x800 unless it sets its own. `viewport` also opens its own contexts at 1920x1080, 1366x768@2x and 800x1280 and resizes a live page. Prints `PASS <journey>` or `FAIL <journey>: <reason>` and exits 1 if any failed. The feature map in `features/` says what each journey proves.

Stable handles (there are no selectors on a canvas):

- Keys: the arrow keys or `w`/`a`/`s`/`d` move (left and right, and up and down inside the bottom zone), `Shift` dashes once unlocked, `Enter` starts from Title, continues from Shop, and restarts from End. In the shop `1`/`2`/`3` buy a card, `r` refreshes. During a fight `1` to `5` use the matching held item. There is no fire key. The gun, and the laser once unlocked, fire on their own while `life` is `fighting`, never during `intro` or `ending`.
- State: `window.__game.state()` returns `{ scenes, run, ... }`. `scenes` holds the active scene keys (`Boot`, `Title`, `Stage`, `Shop`, `End`). `run` is the `RunState` from `src/core/run.ts` (`stage`, `money`, `hp`, `perks`, `items`, `phase.kind`, `phase.shop`). In `Stage` it adds `life` (`intro|fighting|ending|leaving`), `foes`, `coins`, `player {x,y}`, `laserFiring`, `dashing`, `boss {name,hpRatio,phase}`, `skills` (`{ id, kind, msLeft? }` per unlocked HUD skill slot), `items` (held counts), `buffs` (`{ buff, msLeft }` per running item buff), `shieldMs`, `hpBars` (`{ id, x, y, maxHp, hpRatio, bar: 'shown' | 'hidden' | 'hud', chipRatio?, msLeft? }` per live damaged foe; `id` is stable for the stage), and `stats` (effective `moveSpeed`, `bulletDamage`, `fireIntervalMs` with buffs folded in). In `Shop` it adds `cards` (`{ kind: 'perk' | 'item', id }` per slot, `null` when sold out).
- Precondition shortcuts: `__game.start(stage, perks?, money?, items?)` jumps to a stage with a loadout, `kill()` kills everything on the current stage, `hurt()` forces one hit, `hit()` lands one hit through the normal damage path (i-frames and shields apply), `bossHp(ratio)` sets boss HP, `pause()`/`resume()` freeze the stage for a crisp screenshot.
- Expected values come from the game's own modules. The page can `import('/src/core/run.ts')` under Vite dev, and `drive.mjs`'s `h.core(expr)` uses that for `refreshCost`, `offerCost` and `deriveStats` (`run`, `perks` and `items` are in scope).

To add a journey, add an entry to `JOURNEYS` in `drive.mjs`, drive the feature with `h.page.keyboard`, assert with `h.check(label, ok, detail)`, capture with `h.shot(name)`, and add or update its file in `features/`.

## Evidence

Each journey writes `.verify/<run-id>/evidence/<journey>/`: numbered PNGs, `log.json` (every step's action with state before and after, every check with its values, console errors), and `failure.png` on failure. The folder is wiped at the start of that journey so stale proof never mixes in.

Proof standards:

- Drive the feature under test with real keys. `__game.start`, `kill`, `hurt`, `hit` and `bossHp` only set up preconditions. They bypass the real path (`start` builds a RunState directly instead of going through Title and the shop), so never cite them as proof of the feature they shortcut.
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
- Boss phases advance only after the boss finishes its entrance. The Void Empress takes several seconds to arrive, so wait up to 10s for a phase change after `bossHp`.
- Shop purchases fire a full-screen flash for about half a second. Wait before a screenshot.
- `hurt()` forces past i-frames and the Kinetic Barrier shield, so it cannot prove shields or i-frames. Use `hit()` for those.
- Vite watches the whole repo. A `tsconfig.json` written under it, for example by an agent worktree in `.claude/worktrees/`, full-reloads the page mid-journey, which then fails on a missing state field. Rerun the journey.
- `pause()` releases every held key. A journey that pauses in the middle of a hold finds the ship stopped after `resume()`, so take mid-hold shots live.
- The stage intro banner lasts 1.2s and keeps fading for a moment after `life` turns `fighting`, so early screenshots show a faint `STAGE n` title.
