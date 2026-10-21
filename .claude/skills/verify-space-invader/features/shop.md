# Perk shop

After clearing a stage the player gets the stage reward plus kill coins and lands in the upgrade shop. It shows 3 random offer cards, a Refresh button whose cost rises each use, the player's owned perks and held items, HP and money, and Continue. Each card is a perk (branch, tier, level, Thai description, cost) or, with a 20% chance per slot, a consumable item (gold frame, round icon well, `ถืออยู่ n/3`, cost). Items have their own feature file, [items.md](./items.md).

## Sub-features

- `shop-offers` shows 3 eligible offers, perks and items mixed.
- `shop-refresh` rerolls the cards for `refreshCost`, which rises per refresh in the same visit.
- `shop-buy` buys a card for `offerCost`, adds or levels the perk (or adds one item), and marks the card sold out.
- `shop-sold-out` ignores a second buy of a sold-out card.
- `shop-poor` refuses a buy or refresh the player cannot afford.
- `shop-continue` starts the next stage with money and perks carried over.

## How to get to it (user POV)

- Clear any stage before stage 10.
- Press `1`, `2` or `3` (or click a card) to buy, `r` (or the Refresh button) to refresh, `Enter` (or Continue) to go on.

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

## Gotchas

- `shop-poor` and the click entry points have no journey yet.
- Buying fires a full-screen flash. Wait about 0.7s before a screenshot.
- Offers are random. Assert costs and state changes, not specific perk names or kinds.
