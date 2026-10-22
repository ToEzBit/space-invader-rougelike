# TRANS-AM cut-in art

The two strips in `src/assets/cutin/` show the pilot's eyes in the TRANS-AM cut-in, blue before the system fires and red after. The game crossfades blue into red, and draws the band, text and light slash itself.

1. `gen.sh` asks the Codex CLI's image tool for `raw/eyes-blue.png` from `eyes-blue.txt`, sending the approved mockup `raw/mock-c.png` and the player ship raw `../chibi/raw/player-v1.png` as references. It then makes `raw/eyes-red.png` as an edit of the blue raw with `eyes-red.txt`, so only the irises change. It skips a raw that already exists.
2. `pipeline.mjs` checks that the two raws differ only in a small share of pixels, crops the eye band at y 430 to 830 out of each 1536x1024 raw, halves it with a box filter and writes the 768x200 strips. It is deterministic.

`raw/` is gitignored. The committed strips are the source of truth.

```bash
cd art-src/cutin
./gen.sh            # needs codex on PATH and ../chibi/raw/player-v1.png
node pipeline.mjs   # needs ../chibi/node_modules (npm ci in art-src/chibi)
```
