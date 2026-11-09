#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/assets/raw"
OUT="${1:-$ROOT/assets/x-compare.mp4}"
mkdir -p "$RAW/before" "$RAW/after" "$(dirname "$OUT")"
rm -rf "$RAW/before"/* "$RAW/after"/*

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo 'Set OPENROUTER_API_KEY' >&2
  exit 2
fi

GOAL="${GOAL:-Open the Docs page}"
URL="${URL:-https://lite.ego.app/}"
SUCCESS_MATCH="${SUCCESS_MATCH:-/document}"

run_mode() {
  local mode="$1" dir="$2" space="$3"
  local args
  args="$(mktemp "${TMPDIR:-/tmp}/eva-x.XXXXXX.json")"
  python3 - "$args" "$mode" "$dir" "$space" "$GOAL" "$URL" "$SUCCESS_MATCH" <<'PY'
import json, os, sys
path, mode, directory, space, goal, url, match = sys.argv[1:8]
json.dump({
    "mode": mode,
    "recordDir": directory,
    "space": space,
    "goal": goal,
    "url": url,
    "successMatch": match,
    "openrouterKey": os.environ["OPENROUTER_API_KEY"],
}, open(path, "w"))
os.chmod(path, 0o600)
PY
  {
    python3 -c 'import json,sys; print("const ARGS_PATH = " + json.dumps(sys.argv[1]))' "$args"
    cat "$ROOT/scripts/lib.js"
    cat "$ROOT/scripts/record-x.js"
  } | ego-browser nodejs
  rm -f "$args"
}

echo "== BEFORE: snapshotText -> LLM =="
run_mode before "$RAW/before" eva-x-before
echo "== AFTER: Jev =="
run_mode after "$RAW/after" eva-x-after
python3 "$ROOT/scripts/stitch-x.py" "$RAW/before" "$RAW/after" "$OUT"
echo "video: $OUT"
ls -lh "$OUT"
