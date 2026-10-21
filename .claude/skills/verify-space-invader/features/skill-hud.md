# Skill cooldown tray

Every unlocked cooldown skill gets a round icon in a row at the bottom left of the stage: Afterburner Dash (pink, `SHIFT`), Prism Lance (cyan, `AUTO`) and Orbital Cannon (yellow, `AUTO`). While a skill cools down, a dark pie covers the part of the cooldown still left and shrinks clockwise from 12 o'clock, with the seconds left in the middle. A skill coming back pops with a white flash. A firing laser glows, with a white arc for the beam time left. Dash shows charge pips once it has more than one charge.

## Sub-features

- `tray-unlocked` shows a slot only for skills the loadout owns, and none without skill perks.
- `dash-cooldown` turns the dash slot to `cooling` when Shift spends the last charge, counts `msLeft` down, and returns to `ready` after the cooldown.
- `dash-charges` keeps the dash slot `ready` while a spare charge remains.
- `laser-cycle` moves the laser slot through `active` while the beam fires, then `cooling`.
- `sweep-look` draws the pie, the sweep edge, the countdown and the colors.

## How to get to it (user POV)

- Buy Prism Lance, Orbital Cannon or Afterburner Dash in the shop, then continue to the next stage.
- Press `Shift` to dash and watch the pink slot sweep back. The laser and cannon slots cycle on their own.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The journey sets loadouts with `__game.start`. `state().skills` lists `{ id, kind, msLeft? }` for each unlocked slot, with `msLeft` only while `cooling`.

- **Dash.** Run `drive.mjs <run-id> skill-hud`. Stage 3 with `{ afterburnerDash: 1 }` shows only `dash`, `ready`. After `Shift` it turns `cooling` with `0 < msLeft <= dashCooldownMs` (from `deriveStats`), `msLeft` drops over 500ms, and it is `ready` again within the time left plus 1s.
- **Wall.** A second `Shift` then `ArrowLeft` held to the wall puts the ship over the first slot. The tray draws under the ship and enemy shots.
- **Charges.** With `{ afterburnerDash: 1, twinComet: 1 }`, 1.5s after the first dash lands `dash` is still `ready` with the refill arc partway round. A second `Shift` turns it `cooling`.
- **Laser.** With `{ prismLance: 1, orbitalCannon: 1 }` both `laser` and `orbital` show, and `laser` goes `active` and then `cooling`.
- **Locked.** Stage 1 with no perks has an empty `skills`.
- **Proof.** The journey runs at device scale 2. Each `*-closeup.png` is the bottom-left tray. `02` and `04` show the dash sweep early and late with the countdown. `05` shows the ready pop and flash. `06` and `07` show the ship at the left wall drawn over the slot. `09` shows one of two charge pips lit and the white refill arc. `11` shows the laser glow ring and its time-left arc beside a cooling cannon. `13` shows both AUTO slots mid-sweep. `14` shows no tray.

## Gotchas

- The stage is paused around each screenshot so the sweep and countdown in the PNG match the logged state.
- Orbital Cannon starts each stage half charged, so its slot is `cooling` from the first frame. A charged cannon with no foe on screen stays `ready` until one appears.
