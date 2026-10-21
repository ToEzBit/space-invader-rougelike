# Perk shop

After clearing a stage the player gets the stage reward plus kill coins and lands in the upgrade shop. It shows 3 random offer cards, a Refresh button whose cost rises each use, the player's owned perks and held items, HP and money, and Continue. Each card is a perk (branch, tier, level, Thai description, cost) or, with a 20% chance per slot, a consumable item (gold frame, round icon well, `ถืออยู่ n/3`, cost). Items have their own feature file, [items.md](./items.md).

## Sub-features

- `shop-offers` shows 3 eligible offers, perks and items mixed.
- `shop-refresh` rerolls the cards for `refreshCost`, which rises per refresh in the same visit.
- `shop-buy` buys a card for `offerCost`, adds or levels the perk (or adds one item), and marks the card sold out.
- `shop-sold-out` ignores a second buy of a sold-out card.
- `shop-poor` refuses a buy or refresh the player cannot afford.
- `shop-continue` starts the next stage with money and perks carried over.
- `shop-tooltip` shows a tooltip while the pointer rests on an owned chip. A perk tooltip has its name in the branch color, the branch, `Lv n / max` (plus `MAX` at the cap), what it does at the current level, and a dim `เลเวลถัดไป: ...` line unless it is maxed. An item tooltip has its name, `ถืออยู่ n/3`, the key that uses it in a fight, and what it does. It sits above the chip, slides sideways to stay inside the 480x640 world, and stays up without re-fading while the pointer slides from one chip to the next.

## How to get to it (user POV)

- Clear any stage before stage 10.
- Press `1`, `2` or `3` (or click a card) to buy, `r` (or the Refresh button) to refresh, `Enter` (or Continue) to go on.
- Rest the pointer on a chip in the owned panel at the bottom to read what that perk or item does.

## Driving it with drive.mjs

Preconditions:

- `doctor.sh <run-id>` passes.
- The journey reaches the shop with `__game.start(1, {}, 200)` then `kill()`.

- **Offers.** Run `drive.mjs <run-id> shop`. `scenes` contains `Shop` and `cards` has 3 non-null offers, each `{ kind: 'perk' | 'item', id }`.
- **Refresh.** Press `r`. `run.money` drops by exactly `refreshCost` from `src/core/run.ts`, `run.phase.shop.refreshes` becomes 1, and 3 new cards show.
- **Buy.** Press `1`. `run.money` drops by exactly `offerCost` for that offer, `run.perks[id]` (or `run.items[id]` for an item) becomes 1, and `cards[0]` becomes `null`.
- **Sold out.** Press `1` again. `run.money` is unchanged.
- **Continue.** Press `Enter`. `scenes` contains `Stage`, `run.stage` is 2, and money and what was bought match the shop's.
- **Proof.** `shop/01-shop.png`, `02-after-refresh.png` and `03-after-buy.png` show the cards, the higher refresh price, and the SOLD OUT card with the new perk chip.

Tooltips run as their own journey, `drive.mjs <run-id> shop-tooltip`, at deviceScaleFactor 2. It reaches the shop with `__game.start(1, { heavyCaliber: 2, prismLance: 3, afterburnerDash: 1 }, 0, { nitro: 2 })` then `kill()`, and hovers with `page.mouse` only.

- **Chips.** `chips` holds one `{ kind, id, x, y, w, h }` per placed chip in world units. The journey converts each center to page coordinates through `view.world` and the canvas box.
- **Hover.** Moving onto each chip makes `tooltip` `{ visible: true, kind, id }` for that chip. `hasNext` is true for a perk below its max level and false for the maxed `prismLance` and for the item. The bounds `{ x, y, w, h }` stay inside 480x640, at most 260 wide, above the chip.
- **Clamp.** The first chip's center is closer to the left edge than half the tooltip width, and the tooltip's `x` still stays at 4 or more.
- **Leave.** Moving the pointer to the title area makes `tooltip.visible` false.
- **No flicker.** Sliding from the first chip to the second in 10 steps keeps `visible` true at every sample, ends on the second chip, and leaves `tooltip.fadeIns` unchanged. A hover from nothing raises `fadeIns` by one.
- **Proof.** `shop-tooltip/01-tooltip-in-shop.png` shows the tooltip in place. `02-tooltip-edge-heavyCaliber.png` is the clamped edge close-up with the next-level line. `03-tooltip-perk-prismLance.png` is a maxed perk with no next-level line. `04-tooltip-item-nitro.png` is an item.

## Gotchas

- `shop-poor` and the click entry points have no journey yet.
- Buying or refreshing rebuilds the chips and drops the tooltip. It comes back on the next pointer move over a chip.
- `tooltip.visible` turns false when the hide fires, about 90ms after the pointer leaves. The fade-out runs about 80ms more, so wait before hovering again if you count `fadeIns`.
- Buying fires a full-screen flash. Wait about 0.7s before a screenshot.
- Offers are random. Assert costs and state changes, not specific perk names or kinds.
