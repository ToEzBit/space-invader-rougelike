# Viewport and fullscreen

The canvas fills the whole browser window at any size. The 480x640 playfield is zoomed to the largest size that fits and centered, with a thin violet frame at its edges. The parallax star field and nebula continue past the frame, so there are no black bars. The canvas backing store tracks device pixels (devicePixelRatio, capped at 2) and Text resolution follows the camera zoom, so Thai text stays sharp. `F` toggles browser fullscreen in every scene, and the Title screen has a clickable `F · เต็มจอ` hint (`เต็มจอ` on touch, toggled on release, and hidden where the browser has no element fullscreen, such as iPhone Safari).

## Sub-features

- `viewport-fill` makes the canvas box equal the window with no page scrollbars.
- `viewport-fit` zooms the camera to show the whole playfield, centered, filling one axis.
- `viewport-hidpi` sizes the backing store to the window times devicePixelRatio.
- `viewport-resize` re-fits the canvas, camera, backdrop and text on a live window resize.
- `viewport-fullscreen-key` enters and leaves fullscreen on `F`.
- `viewport-fullscreen-hint` toggles fullscreen from the Title hint without starting a run.

## How to get to it (user POV)

- Open the game in any window size. Resize the window or rotate the device.
- Press `F` anywhere, or click `F · เต็มจอ` at the top right of the Title screen. `Esc` or `F` leaves fullscreen.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.

- **Fill and fit.** Run `drive.mjs <run-id> viewport`. It opens fresh contexts at 1920x1080, 1366x768 with `deviceScaleFactor: 2`, and 800x1280, goes Title then Enter into stage 1, and at each screen checks the canvas box, the scroll size, the backing store size, and `state().view` (`canvas`, `zoom`, `world` from the camera's worldView).
- **Live resize.** The same journey loads at 1280x720, resizes the page to 1600x900, waits for `view.canvas` to change, and checks the fit again on Title and on stage 1.
- **Fullscreen key.** The journey presses `F` and checks `document.fullscreenElement` is `#game`, then presses `F` again and checks it is cleared.
- **Proof.** Open each `<viewport>-title.png` and `<viewport>-stage1.png` plus the `live-*` shots. Stars and nebula reach every edge, the violet frame marks the playfield walls (sides in landscape, top and bottom in portrait), and HUD and Thai text are crisp.

## Gotchas

- Shot numbering restarts per context, so files are named by viewport (`01-1920x1080-title.png`, `01-1366x768@2x-title.png`).
- Headless Chrome grants fullscreen but keeps the window size, so the canvas does not grow on `F`. A real fullscreen resize is only visible with `--headed` or by hand.
- `viewport-fullscreen-hint` needs a coordinate click on the canvas, which the driving conventions forbid, so it has no journey. Report it as not verified by a journey.
- The other journeys run at 600x800, which is exactly 3:4, so they show no margin around the playfield.
