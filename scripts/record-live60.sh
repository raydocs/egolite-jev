#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/assets/x-compare-60.mp4}"
RAW="$ROOT/assets/raw60"
mkdir -p "$RAW" "$(dirname "$OUT")"
export PATH="$HOME/.local/bin:$PATH"

GOAL="${GOAL:-Open the GitHub repository for ego lite}"
URL="${URL:-https://lite.ego.app/}"
SUCCESS_MATCH="${SUCCESS_MATCH:-github.com}"

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo 'Set OPENROUTER_API_KEY' >&2
  exit 2
fi

osascript <<'APPLESCRIPT'
tell application "System Events"
  tell process "ego lite"
    set frontmost to true
    delay 0.2
    repeat with w in windows
      if (name of w as text) does not contain "Restore" then
        set position of w to {24, 40}
        set size of w to {1400, 900}
      end if
    end repeat
  end tell
end tell
APPLESCRIPT
sleep 0.4

# logical window 24,40 1400x900; capture is 2x 3456x2234 vs 1728x1117
CROP="2800:1800:48:80"

record_until() {
  local dest="$1"
  ffmpeg -y -hide_banner -loglevel error \
    -f avfoundation -pixel_format uyvy422 -framerate 60 -capture_cursor 1 -i "5:none" \
    -vf "crop=${CROP},scale=1920:1080:flags=lanczos,fps=60,format=yuv420p" \
    -c:v libx264 -preset veryfast -crf 18 -r 60 -movflags +faststart \
    "$dest" &
  echo $!
  sleep 0.6
}

stop_rec() {
  local pid="$1"
  kill -INT "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

run_before() {
  local args
  args="$(mktemp "${TMPDIR:-/tmp}/eva60.XXXXXX.json")"
  python3 - "$args" <<PY
import json, os, sys
json.dump({
  "mode": "before",
  "recordDir": "/tmp/eva60-unused-before",
  "space": "eva-x60-before",
  "goal": """$GOAL""",
  "url": """$URL""",
  "successMatch": """$SUCCESS_MATCH""",
  "openrouterKey": os.environ["OPENROUTER_API_KEY"],
}, open(sys.argv[1], "w"))
os.chmod(sys.argv[1], 0o600)
PY
  mkdir -p /tmp/eva60-unused-before
  {
    python3 -c 'import json,sys; print("const ARGS_PATH = " + json.dumps(sys.argv[1]))' "$args"
    cat "$ROOT/scripts/lib.js"
    cat "$ROOT/scripts/record-x.js"
  } | ego-browser nodejs
  rm -f "$args"
}

run_after() {
  GOAL="$GOAL" URL="$URL" SUCCESS_MATCH="$SUCCESS_MATCH" \
    SPACE="eva-x60-after" MAX_STEPS=4 \
    "$ROOT/scripts/run"
}

echo "== BEFORE record =="
osascript -e 'tell application "System Events" to set frontmost of process "ego lite" to true'
BPID=$(record_until "$RAW/before-raw.mp4")
set +e
run_before | tee "$RAW/before.json"
set -e
sleep 0.8
stop_rec "$BPID"

echo "== AFTER record =="
osascript -e 'tell application "System Events" to set frontmost of process "ego lite" to true'
APID=$(record_until "$RAW/after-raw.mp4")
set +e
run_after | tee "$RAW/after.json"
set -e
sleep 0.8
stop_rec "$APID"

python3 "$ROOT/scripts/stitch-live60.py" "$RAW/before-raw.mp4" "$RAW/after-raw.mp4" "$RAW/before.json" "$RAW/after.json" "$OUT"
ls -lh "$OUT"
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,avg_frame_rate,width,height -of default=nw=1 "$OUT"
echo "video: $OUT"
