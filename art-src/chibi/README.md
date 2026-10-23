# Chibi character art

This folder holds the sources for the thirteen character sprites in `src/assets/characters/`: player, optionDrone, the summon branch's familiar, drone, gunner, tank, diver, the two bosses crimsonSeraph and voidEmpress, their second forms crimsonSeraphAscended and voidEmpressEclipse, and those forms' casting poses. Each PNG has one art pixel per world unit and uses only fully opaque or fully transparent pixels.

The art is made in two steps.

1. `gen-all.mjs` asks the Codex CLI's image tool for one large picture of each character on flat green, using the prompts in `prompts.json`. Its outputs go to `raw/`. A prompt entry may override `head` and `style` and name its own reference `inputs`; the second-form prompts send `ref-forms/<boss>-6x.png` (the first-form sprite enlarged 6x) plus a raw.
2. `pipeline.mjs` keys out the green, snaps each picture to the pixel grid and palette size set in its `CHARACTERS` table, then writes `out/<key>.png`, `manifest.json` and review sheets in `sheets/`. A second form names its first form in `form`, which adds `c-forms-<boss>.png` (both forms at 1x and 4x) and `d-stage-<form>.png` (both forms at world coordinates). It is deterministic. The same raws always give the same bytes.

## What is not committed

- `raw/` holds the generated pictures, about 17 MB.
- `ref/` holds the style sheet and per-character crops that `gen-all.mjs` sends as reference images, about 4 MB.
- `ref-forms/` holds the enlarged first-form sprites the second-form prompts send.

These folders live here on the original machine but are gitignored, so they are not in the repo. Without `raw/`, `pipeline.mjs` skips every character. Without `ref/`, `gen-all.mjs` cannot generate. The committed PNGs in `src/assets/characters/` are the source of truth.

## Re-running

Requires Node 20.11 or newer, for `import.meta.dirname`. Generating also requires the `codex` CLI on `PATH`.

```bash
cd art-src/chibi
npm ci
node gen-all.mjs [key...]   # generates missing raws only; needs ref/ and codex
node pipeline.mjs           # raw/ -> out/, manifest.json, sheets/
```

Then copy the finals into the game.

```bash
for k in player optionDrone familiar drone gunner tank diver crimsonSeraph voidEmpress crimsonSeraphAscended voidEmpressEclipse crimsonSeraphAscendedCast voidEmpressEclipseCast; do
  cp out/$k.png ../../src/assets/characters/
done
```

`gen-all.mjs` skips any character whose raw already exists. The two `*Cast-v1` raws are the second forms' casting poses, made outside `gen-all.mjs` as edits of `crimsonSeraphAscended-v2` and `voidEmpressEclipse-v2` with `gen.sh -i <that raw>` and the prompt saved beside each raw. The game reads only the texture key, so a replacement of the same size class needs no code change. Delete or rename a raw to regenerate it, and bump its `raw` name in `prompts.json` and `pipeline.mjs` to keep the old one.

Review helpers write into `review/`, which is gitignored. `sweep.mjs <key> '<json overrides>'` renders one character under several `CHARACTERS` knob sets at 4x, `face.mjs '<json overrides>'` does the same for the Ascended Seraph's face at 8x, and `up.mjs` and `crop.mjs` upscale or crop any PNG with nearest-neighbour sampling.

Collision radii do not come from the sprite size. They live in `src/game/hitbox.ts`, so replacing the art never changes gameplay.
