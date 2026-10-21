# Title and run start

The game boots to a title screen with the pixel logo, the chibi cast key art over scrolling stars, the controls panel in Thai, and a prompt. Pressing Enter starts a fresh run at stage 1.

## Sub-features

- `title-boot` shows the Title scene after textures are built, with no console errors.
- `title-start-enter` starts a new run on Enter.
- `title-start-space` starts a new run on Space.
- `title-start-click` starts a new run on a click anywhere.

## How to get to it (user POV)

- Open the game URL. The Title scene appears after a brief boot.
- Press `Enter`, press `Space`, or click the page.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.

- **Boot.** Load the page. Run `drive.mjs <run-id> doctor`. `log.json` shows `scenes` contains `Title`, and `01-title.png` shows the logo and controls panel.
- **Start with Enter.** Press `Enter` on the title. Run `drive.mjs <run-id> title-start`. The state reaches `scenes: ["Stage"]`, `run.stage: 1`, `run.phase.kind: "playing"`, `run.money: 0`, `run.hp: 3`, and `foes: 24`.
- **Proof.** `title-start/02-stage1.png` shows stage 1 with the 3x8 formation and the HUD reading `STAGE 1/10`.

## Gotchas

- `title-start-space` and `title-start-click` have no journey yet. Report them as not verified.
- The title listens for its start key once. A second Enter during the fade does nothing.
