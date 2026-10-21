# Chibi character art

This folder holds the sources for the eight character sprites in `src/assets/characters/`: player, optionDrone, drone, gunner, tank, diver, crimsonSeraph and voidEmpress. Each PNG has one art pixel per world unit and uses only fully opaque or fully transparent pixels.

The art is made in two steps.

1. `gen-all.mjs` asks the Codex CLI's image tool for one large picture of each character on flat green, using the prompts in `prompts.json`. Its outputs go to `raw/`.
2. `pipeline.mjs` keys out the green, snaps each picture to the pixel grid and palette size set in its `CHARACTERS` table, then writes `out/<key>.png`, `manifest.json` and review sheets in `sheets/`. It is deterministic. The same raws always give the same bytes.

## What is not committed

- `raw/` holds the generated pictures, about 17 MB.
- `ref/` holds the style sheet and per-character crops that `gen-all.mjs` sends as reference images, about 4 MB.

Neither folder is in the repo. Without `raw/`, `pipeline.mjs` skips every character. Without `ref/`, `gen-all.mjs` cannot generate. The committed PNGs in `src/assets/characters/` are the source of truth.

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
for k in player optionDrone drone gunner tank diver crimsonSeraph voidEmpress; do
  cp out/$k.png ../../src/assets/characters/
done
```

`gen-all.mjs` skips any character whose raw already exists. Delete or rename a raw to regenerate it, and bump its `raw` name in `prompts.json` and `pipeline.mjs` to keep the old one.

Collision radii do not come from the sprite size. They live in `src/game/hitbox.ts`, so replacing the art never changes gameplay.
