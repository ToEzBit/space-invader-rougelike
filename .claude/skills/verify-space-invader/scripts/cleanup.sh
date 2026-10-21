#!/usr/bin/env bash
# Usage: cleanup.sh <run-id>
# Stops only the vite process this run started and removes its instance state. Evidence is kept.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
RUN_ID="${1:?usage: cleanup.sh <run-id>}"
INST="$ROOT/.verify/$RUN_ID/instance"
if [ -f "$INST/pid" ]; then
  PID="$(cat "$INST/pid")"; PORT="$(cat "$INST/port")"
  if ps -p "$PID" -o command= 2>/dev/null | grep -q "vite.*--port $PORT"; then
    kill "$PID"
    for _ in $(seq 1 25); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
    kill -0 "$PID" 2>/dev/null && kill -9 "$PID"
    echo "stopped vite pid=$PID port=$PORT"
  else
    echo "pid $PID is gone or no longer this run's vite; not killing anything"
  fi
fi
rm -rf "$INST"
echo "evidence kept at $ROOT/.verify/$RUN_ID/evidence"
