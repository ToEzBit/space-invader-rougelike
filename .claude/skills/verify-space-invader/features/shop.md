# Perk shop

After clearing a stage the player gets the stage reward plus kill coins and lands in the upgrade shop. It shows 3 random perk cards (branch, tier, level, Thai description, cost), a Refresh button whose cost rises each use, the player's owned perks, HP and money, and Continue.

## Sub-features

- `shop-offers` shows 3 eligible perk cards.
- `shop-refresh` rerolls the cards for `refreshCost`, which rises per refresh in the same visit.
- `shop-buy` buys a card for `offerCost`, adds or levels the perk, and marks the card sold out.
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

- **Offers.** Run `drive.mjs <run-id> shop`. `scenes` contains `Shop` and `cards` has 3 non-null perk ids.
- **Refresh.** Press `r`. `run.money` drops by exactly `refreshCost` from `src/core/run.ts`, `run.phase.shop.refreshes` becomes 1, and 3 new cards show.
- **Buy.** Press `1`. `run.money` drops by exactly `offerCost` for that perk, `run.perks[id]` becomes 1, and `cards[0]` becomes `null`.
- **Sold out.** Press `1` again. `run.money` is unchanged.
- **Continue.** Press `Enter`. `scenes` contains `Stage`, `run.stage` is 2, and money and perks match the shop's.
- **Proof.** `shop/01-shop.png`, `02-after-refresh.png` and `03-after-buy.png` show the cards, the higher refresh price, and the SOLD OUT card with the new perk chip.

## Gotchas

- `shop-poor` and the click entry points have no journey yet.
- Buying fires a full-screen flash. Wait about 0.7s before a screenshot.
- Offers are random. Assert costs and state changes, not specific perk names.
