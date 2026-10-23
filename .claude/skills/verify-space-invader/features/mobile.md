# Mobile touch

On a phone the whole run plays by touch. The game reads `(pointer: coarse)` once at boot and switches every key hint to touch wording from one table (`src/input.ts`): the Title controls panel and prompt, the tray hints, the shop buttons, the item card and item tooltip line, and the End prompt. In portrait the 480x640 playfield leaves a letterbox band above and below it, and the skill and item tray moves into the bottom band, enlarged up to 1.4x (skills over items on two rows when one row would shrink them). The thumb steers from that same band, so it never covers the ship. Desktop keyboard play is unchanged, and the desktop tray stays on the playfield's bottom edge.

## Sub-features

- `mobile-mode` switches to touch wording and the band tray on a coarse pointer.
- `mobile-start` starts a run from Title with a tap and launches stage 1 from the hangar with a tap on `ออกบิน`.
- `mobile-steer` steers by relative drag: the ship flies toward where it was when the finger went down plus how far the finger has moved since, capped at `stats.moveSpeed` (Nitro and TRANS-AM included), and stops exactly on that target. Past a wall the target re-anchors, so pulling back moves the ship at once. Lifting the finger stops it.
- `mobile-tray` makes the TRANS-AM, dash and item slots tap targets at least 48 CSS px across, pressed through the same path as Space, Shift and Z X C V B. A second finger can tap while the first steers.
- `mobile-shop` buys a card, refreshes and continues on a tap that began on the same target, so a steering finger lifted as the shop opens buys nothing. A tap on an owned chip opens its tooltip and a tap anywhere else closes it.
- `mobile-end` restarts to Title with a tap on End.

## How to get to it (user POV)

- Open the game on a phone in portrait. Tap to start, then tap a starter perk or `ออกบิน` in the hangar. Put a thumb anywhere, the band under the playfield is the comfortable spot, and drag to fly. Tap a tray slot with another finger to fire TRANS-AM, dash or use an item. In the shop tap a card, `รีเฟรช` or `ไปต่อ`, and tap an owned chip to read it.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.

Run `drive.mjs <run-id> mobile`. It opens a 390x844 context with deviceScaleFactor 3, `isMobile` and `hasTouch`, and sends touches through CDP `Input.dispatchTouchEvent` with explicit finger ids. Every target comes from state: `tray` for the slots, `targets` for shop cards and buttons, `chips` for owned chips, `view.world` for the band.

- **Mode and start.** `state().input` is `touch`. A tap on Title opens the hangar, whose `targets` have no `refresh` entry and a `go` target centered under the cards, and a tap on that `go` target reaches stage 1 with no perks and `run.OPENING_COINS` carried.
- **Steering.** A drag 80 world units right in the bottom band flies the ship 80 right at the same height. A per-frame recorder in the page divides each frame's travel by its `clock.fightMs` step and checks it never passes `stats.moveSpeed` (1% slack) while reaching about full speed. The ship then holds exactly on its target with the finger still. Pushing past the left wall parks it there, and pulling the finger back 20 units moves it off the wall within 150 ms. Lifting stops it.
- **Second-finger taps.** With `__game.start(3, { afterburnerDash: 1 }, 0, { nitro: 2 })` as the precondition and finger 1 steering, finger 2 presses the Nitro slot (its job shows as `nitro` in `pointers`), and on release exactly one Nitro is spent, finger 1 still steers toward the same target, and a drag under Nitro outruns the base speed but not the boosted one. Finger 2 then taps the dash slot (the ship dashes) and, with the gauge set full by `transAmGauge`, the TRANS-AM slot (the cut-in starts). Every tray target is checked at 48 CSS px or more. A full loadout (`__game.start(6, ...)` with every skill perk and all five items) checks seven tap targets in the band, none overlapping, on two rows. Setting `--safe-bottom: 34px` on the root and resizing then checks every target ends above that home-indicator inset.
- **Shop.** `__game.start(1, {}, 300)` and `kill()` open the shop with a finger still down over the first card; lifting it buys nothing. A tap on the first card spends its `offerCost` and changes the owned perks or items, a tap on refresh spends `refreshCost` for new offers, a tap on an owned chip shows its tooltip and keeps it up after the finger lifts, a tap at the top hides it, and a tap on continue starts stage 2.
- **End.** `hurt()` until defeat opens End; a tap returns to Title.
- **Proof.** Open `01-title.png` (touch controls panel, `แตะเพื่อเริ่ม`), `02-hangar.png` (hangar subtitle on one line, one centered `ออกบิน ▶` button and no `รีเฟรช`, no `[1]` badges), `03-sideways.png` (the turn-upright hint), `04-mid-fight-tray.png` (enlarged tray in the bottom band, playfield clear), `05-full-tray.png` (skills above items, the `AUTO` hints clear of the `x1` badges), `06-full-tray-inset.png` (the same tray lifted clear of the inset), `07-shop-tooltip.png` (item tooltip reads `แตะไอคอน`), `08-shop.png` (buttons without key prefixes, no `[1]` badges) and `09-end.png`. No text may overflow or overlap.

## Gotchas

- In Chrome's CDP touch emulation `touchEnd` lifts the fingers it lists, and a `touchMove` that leaves a finger out does not lift it. So `touchStart` and `touchMove` carry every finger still down, and `touchEnd` carries just the one lifting.
- A touch's `pointerdown` is not a user activation, so the AudioContext and fullscreen wait for the release. Headless Chrome starts audio either way; iOS's suspended-until-release context is not reproducible here.
- iPhone Safari has no element fullscreen, so Title hides its fullscreen hint there. Chrome's emulation reports fullscreen available, so the journey cannot show the hidden case.
- Playwright cannot emulate iOS safe areas. `index.html` routes `env(safe-area-inset-bottom)` through `--safe-bottom`, which `src/view.ts` reads, so the journey overrides that variable instead. A real notch is still unproven.
