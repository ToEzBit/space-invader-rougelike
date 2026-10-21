#!/usr/bin/env bash
# Usage: doctor.sh <run-id>
# Read-only: is this run's instance alive, ours, serving this game, and usable in a browser?
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
RUN_ID="${1:?usage: doctor.sh <run-id>}"
INST="$ROOT/.verify/$RUN_ID/instance"
fail() { echo "DOCTOR FAIL: $*" >&2; exit 1; }

[ -f "$INST/pid" ] || fail "no instance for run $RUN_ID (run launch.sh first)"
PID="$(cat "$INST/pid")"; PORT="$(cat "$INST/port")"
kill -0 "$PID" 2>/dev/null || fail "vite pid $PID is not running"
ps -p "$PID" -o command= | grep -q "vite.*--port $PORT" || fail "pid $PID is not this run's vite on port $PORT"
lsof -a -p "$PID" -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 || fail "pid $PID does not own port $PORT"
curl -sf "http://127.0.0.1:$PORT/" | grep -q "<title>Space Invader Roguelike</title>" || fail "port $PORT is not serving this game"
echo "process ok: pid=$PID port=$PORT build=$(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet || echo '+dirty')"
node "$HERE/drive.mjs" "$RUN_ID" doctor
