#!/usr/bin/env bash
# Usage: launch.sh [run-id]
# Starts an isolated Vite dev server on a free 127.0.0.1 port and blocks until the game is usable.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
RUN_ID="${1:-$(date +%Y%m%d-%H%M%S)-$$}"
INST="$ROOT/.verify/$RUN_ID/instance"
if [ -e "$INST/pid" ]; then echo "run $RUN_ID already has an instance; pick a new run id" >&2; exit 1; fi
mkdir -p "$INST" "$ROOT/.verify/$RUN_ID/evidence"

cd "$ROOT"
[ -d node_modules/phaser ] && [ -d node_modules/playwright ] || npm ci

PORT="$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")"
nohup node_modules/.bin/vite --host 127.0.0.1 --port "$PORT" --strictPort >"$INST/vite.log" 2>&1 &
echo $! >"$INST/pid"
echo "$PORT" >"$INST/port"

for _ in $(seq 1 150); do
  if ! kill -0 "$(cat "$INST/pid")" 2>/dev/null; then echo "vite exited during startup:" >&2; cat "$INST/vite.log" >&2; exit 1; fi
  if grep -q "ready in" "$INST/vite.log" && curl -sf "http://127.0.0.1:$PORT/" >/dev/null; then break; fi
  sleep 0.2
done

"$HERE/doctor.sh" "$RUN_ID"
echo "RUN_ID=$RUN_ID"
echo "URL=http://127.0.0.1:$PORT/"
