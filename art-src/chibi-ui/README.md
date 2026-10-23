# Chibi UI art

This folder holds the sources for the UI art in `src/assets/ui/`. That means the hearts, coins, skill and item icons, the 9-slice frames (perk and item cards, panel, HUD bar, buttons, chips), the title logo, the title backdrop and cast, and the victory and defeat vignettes. Each PNG has one art pixel per world unit, so the game never scales it. `src/art/ui.ts` lists them, and its 9-slice insets must equal the ones in `manifest.json`, which `src/art/art.test.ts` checks.

The art is made in two steps.

1. `gen-all.mjs` asks the Codex CLI's image tool for each raw on flat green. It uses the prompts in `prompts.json` and the reference images in `ref/`, and its outputs go to `raw/`. It runs `../chibi/gen.sh`.
2. `pipeline.mjs` keys out the green and snaps each raw to the pixel grid and palette size set in `assets.mjs`. Frames get canonical corners and uniform edges, and their color variants are recolors of one geometry. It writes `out/<key>.png`, `manifest.json` and a stretch preview in `sheets/`. It is deterministic. The same raws always give the same bytes.

`pixel.mjs` holds the keying, palette and grid snapping shared with `../chibi/pipeline.mjs`.

## What is not committed

- `raw/` holds the generated pictures and their prompts, about 30 MB.
- `ref/` holds `style.png` and `cast.png`, the reference images that `gen-all.mjs` sends, about 3 MB.
- `out/`, `sheets/` and `mockups/` are pipeline and review outputs.

`raw/` and `ref/` live here on the original machine but are gitignored, so they are not in the repo. Without `raw/`, `pipeline.mjs` skips every asset. Without `ref/`, `gen-all.mjs` cannot generate. `make-refs.mjs` rebuilds `ref/` from the shipped character PNGs and `../chibi/ref/sheet.png`. The committed PNGs in `src/assets/ui/` are the source of truth.

## Re-running

Requires Node 20.11 or newer, for `import.meta.dirname`. Generating also requires the `codex` CLI on `PATH`.

```bash
cd art-src/chibi-ui
npm ci
node gen-all.mjs [raw...]   # generates missing raws only; needs ref/ and codex
node pipeline.mjs           # raw/ -> out/, manifest.json, sheets/stretch.png
node verify.mjs             # determinism, sizes, insets, and src/assets/ui == out/
```

Then copy the finals the game uses into it. `out/chip.png`, the neutral chip, is not shipped because every chip in the game has a branch or item color.

```bash
for f in out/*.png; do [ "$f" = out/chip.png ] || cp "$f" ../../src/assets/ui/; done
```

`gen-all.mjs` skips any raw that already exists. To regenerate one, add a new `raw` name in `prompts.json` and point its entry in `assets.mjs` at it, so the old raw stays.

A prompt entry's `overrides` replaces parts of its `common` block, such as `avoid`. Lime cannot be generated on the green key, because the keyer fades or despills it. The graze icon is drawn in gold, and its `recolor` in `assets.mjs` turns the snapped gold to lime.

## Review helpers

- `mockup.mjs [title shop hud end icons]` renders the screens at the game's layout from `layout.json`, using the real character PNGs and `out/`, into `mockups/` at x2. It drives the system Chrome through the repo's Playwright. `MOCK_OPTS` sets variants. The approved mockups used `{"keyArt":true,"logo":"image"}` for the title, `{"suffix":"-victory"}` and `{"defeat":true,"suffix":"-defeat"}` for the end screens, and no options for the shop and HUD. Those settings reproduce them byte for byte. For the five-branch review, `perks` and `chips` replace the shop's cards and owned chips, and `skills` and `familiars` replace the HUD's skill slots and add familiars beside the ship.
- `inspect.mjs raw/x.png` prints a raw's keyed trim box and pixel pitch.
- `peek.mjs out.png scale in.png...` stacks images, downscaled, for a quick look.
