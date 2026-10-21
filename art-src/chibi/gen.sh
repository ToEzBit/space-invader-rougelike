#!/usr/bin/env bash
# Generate an image headlessly via the local Codex CLI (built-in image_gen tool).
# Usage: gen.sh -o <output.png> [-i ref.png]... [-m model] [-t timeout_sec] "<prompt>"
set -euo pipefail

out=""; model=""; timeout_sec=600; refs=()
while getopts "o:i:m:t:" opt; do
  case "$opt" in
    o) out="$OPTARG" ;;
    i) refs+=("$OPTARG") ;;
    m) model="$OPTARG" ;;
    t) timeout_sec="$OPTARG" ;;
    *) echo "bad option" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
prompt="${1:-}"
[[ -z "$prompt" || -z "$out" ]] && { echo "usage: gen.sh -o out.png [-i ref.png] \"prompt\"" >&2; exit 2; }
command -v codex >/dev/null || { echo "codex CLI not found in PATH" >&2; exit 127; }

mkdir -p "$(dirname "$out")"
out_abs="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
codex_home="${CODEX_HOME:-$HOME/.codex}"
log="$(mktemp -t codex-image-gen.XXXXXX)"

args=(exec --skip-git-repo-check -s workspace-write --json -C "$(dirname "$out_abs")")
[[ -n "$model" ]] && args+=(-m "$model")
for r in "${refs[@]+"${refs[@]}"}"; do args+=(-i "$r"); done

instruction="Use your built-in image_gen tool to generate exactly one image (no SVG/HTML stand-ins).
Image request:
$prompt

After generating, copy the final image to: $out_abs
Do not modify any other files. Reply with only the saved path."

# </dev/null: otherwise codex waits on stdin ("Reading additional input from stdin...")
if command -v timeout >/dev/null; then
  timeout "$timeout_sec" codex "${args[@]}" -- "$instruction" </dev/null >"$log" 2>&1 || true
else
  codex "${args[@]}" -- "$instruction" </dev/null >"$log" 2>&1 || true
fi

# Fallback: Codex didn't copy it — grab the newest image from this thread's folder.
if [[ ! -s "$out_abs" ]]; then
  thread_id="$(grep -o '"thread_id":"[^"]*"' "$log" | head -1 | cut -d'"' -f4 || true)"
  src=""
  [[ -n "$thread_id" && -d "$codex_home/generated_images/$thread_id" ]] &&
    src="$(ls -t "$codex_home/generated_images/$thread_id"/* 2>/dev/null | head -1 || true)"
  if [[ -n "$src" ]]; then
    cp "$src" "$out_abs"
  else
    echo "Image generation failed. Codex log: $log" >&2
    tail -20 "$log" >&2
    exit 1
  fi
fi

echo "$out_abs"
