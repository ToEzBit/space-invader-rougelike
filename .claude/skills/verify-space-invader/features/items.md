# Consumable items

Items are bought in the shop and spent mid-stage with keys `1` to `5`. They share the shop's 3 offer slots with perks: each slot is an item with a 20% chance (`ITEM_OFFER_CHANCE` in `src/core/items.ts`), otherwise a perk. An item stacks to 3 and carries across stages until used.

| Key | Item | Effect |
| --- | --- | --- |
| `1` | Repair Kit | Heal 1 HP. Refused at full HP. |
| `2` | Nitro | moveSpeed x1.5 for 8s. |
| `3` | Power Cell | bulletDamage, homingDamage and laserDps x1.5 for 8s. |
| `4` | Overclock | fireIntervalMs x0.6 for 8s. |
| `5` | Barrier Capsule | The Kinetic Barrier shield, blocking the next hit, for 10s. |

Re-using a running buff adds its duration to the time left and keeps one multiplier. Buffs end with the stage. Every item held at stage start gets a round slot in the bottom-right tray with its key, an `xN` count and, while its buff or shield runs, a white sweep of the time left. A refused use (none held, or Repair Kit at full HP) shakes the slot and flashes it red.

## Sub-features

- `item-offer` shows an item card (gold frame, round icon well, `ถืออยู่ n/3`, no tier) in the shop.
- `item-buy` charges the item's cost, adds 1 to `run.items[id]` and sells out the card.
- `item-refuse` keeps the item when the use is refused.
- `item-heal` heals 1 HP and spends one Repair Kit.
- `item-buff` raises the effective stats while the buff runs and restores them when it expires.
- `item-extend` adds time to a running buff instead of a second entry.
- `item-shield` raises a shield that blocks one normal hit.
- `item-tray` draws the bottom-right tray, counts and sweeps.

## How to get to it (user POV)

- Clear a stage and press `r` in the shop until a gold-framed item card shows, then press its key.
- Continue, and press the item's key during the fight.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The shop half reaches the shop with `__game.start(1, {}, 2000)` then `kill()`.
- The stage half loads items with `__game.start(stage, perks, money, items)`. `state()` in `Stage` adds `items`, `buffs` (`{ buff, msLeft }[]`), `shieldMs` and the effective `stats` (`moveSpeed`, `bulletDamage`, `fireIntervalMs`).

- **Offer and buy.** Run `drive.mjs <run-id> items`. It presses `r` until a `cards` entry has `kind: 'item'` (it stops early if money would drop under 25), then presses that card's key. `run.items[id]` rises by 1, `run.money` drops by `offerCost`, and the card is `null`.
- **Repair.** Stage 4 with `{ reinforcedHull: 3 }` and `{ repairKit: 2, nitro: 2, powerCell: 1, overclock: 1, barrierCapsule: 1 }`. `1` at full HP leaves HP and `repairKit` unchanged. After `hurt()`, `1` adds 1 HP and spends one.
- **Nitro.** `ArrowLeft` held 400ms is measured without and then with Nitro from the middle of the field. With Nitro `stats.moveSpeed` is 1.5x `deriveStats` and the ship moves about 1.5x as far, with neither end at the wall.
- **Power Cell and Overclock.** `3` then `4` make `buffs` hold three entries, `stats.bulletDamage` 1.5x and `stats.fireIntervalMs` 0.6x.
- **Extend.** `2` again leaves one `nitro` entry whose `msLeft` grew by more than 7s, and `moveSpeed` stays 1.5x.
- **Expiry.** Once `buffs` is empty, still `fighting`, `stats` equal `deriveStats`.
- **Shield.** Stage 1 with `{ barrierCapsule: 1 }`. `1` first, with no Repair Kit held, changes nothing (the tray has no slot for it, so a red `ไม่มี Repair Kit` floats instead). `5` sets `shieldMs` above 9s. While paused, `hit()` leaves HP unchanged and `shieldMs` at 0. After the block's i-frames, `hit()` again costs 1 HP, which proves `hit()` takes the real damage path.
- **Proof.** The journey runs at device scale 2. `01-shop-item-card.png` shows the gold-framed item card, `02` the sold-out slot and the item chip in the owned panel. Each `*-closeup.png` is the bottom-right tray. `04` shows slot 1 flashing red on the refused repair. `06` shows slots 2, 3 and 4 with sweeps and `x0` on the spent ones. `08` shows the Nitro sweep reset after extending. `10` shows every slot back to ready, spent ones dimmed. `11` and `12` show the ship's shield bubble and the active Barrier slot.

## Gotchas

- `hurt()` forces past shields and i-frames. Use `hit()` to prove a block.
- The buff wait runs about 16s with the gun boosted, so it uses stage 4, which has enough foe HP to stay `fighting` throughout. Enemy fire still lands during the wait, hence the extra hull. Five runs ended the wait at 2 or 3 of 6 HP. A failure on that check with `life` not `fighting` and `hp` 0 is the ship dying, not an item bug; rerun it.
- Item keys work only while `life` is `fighting`. A press during the intro banner is dropped.
- The tray's leftmost slot sits under the ship's starting x when all five items are held. The tray draws under the ship, as the skill tray does.
