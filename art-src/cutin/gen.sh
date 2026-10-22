#!/bin/bash
# Generates the two eye raws one at a time: blue first, then red as an edit of blue so they line up.
cd "$(dirname "$0")"
GEN=../chibi/gen.sh
SHIP=../chibi/raw/player-v1.png
[ -f raw/eyes-blue.png ] || "$GEN" -o "$PWD/raw/eyes-blue.png" -i raw/mock-c.png -i "$SHIP" -t 900 "$(cat eyes-blue.txt)"
[ -f raw/eyes-blue.png ] || { echo "FAILED blue"; exit 1; }
[ -f raw/eyes-red.png ] || "$GEN" -o "$PWD/raw/eyes-red.png" -i raw/eyes-blue.png -t 900 "$(cat eyes-red.txt)"
md5 raw/*.png
