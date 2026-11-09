#!/bin/bash
# Record BEFORE (snapshot→LLM) and AFTER (egolite-jev) at 1x, then hstack.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$HOME/Desktop/egolite-jev-compare.mp4}"
RAW="$ROOT/assets/raw-sbs"
mkdir -p "$RAW"
export PATH="$HOME/.local/bin:$PATH"

for f in "$HOME/.config/egolite-jev/env" "$HOME/.config/ego-verified-actions/env"; do
  if [[ -z "${OPENROUTER_API_KEY:-}" && -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
  fi
done
if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "Need OPENROUTER_API_KEY" >&2
  exit 2
fi

export GOAL="${GOAL:-Open the Docs page}"
export URL="${URL:-https://lite.ego.app/}"
export SUCCESS_MATCH="${SUCCESS_MATCH:-/document}"
CROP="2800:1800:48:80"

osascript <<'APPLESCRIPT' >/dev/null
tell application "System Events"
  tell process "ego lite"
    set frontmost to true
    delay 0.2
    try
      key code 53
    end try
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

start_rec() {
  local dest="$1"
  ffmpeg -y -hide_banner -loglevel error \
    -f avfoundation -pixel_format uyvy422 -framerate 30 -capture_cursor 1 -i "5:none" \
    -vf "crop=${CROP},scale=1400:900:flags=lanczos,fps=30,format=yuv420p" \
    -c:v libx264 -preset ultrafast -crf 20 -r 30 \
    -movflags frag_keyframe+empty_moov+default_base_moof \
    "$dest" &
  echo $!
  sleep 0.5
}

stop_rec() {
  local pid="$1"
  kill -INT "$pid" 2>/dev/null || true
  sleep 1
  kill -TERM "$pid" 2>/dev/null || true
  sleep 1
  kill -KILL "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

run_mode() {
  local mode="$1"
  local args
  args="$(mktemp "${TMPDIR:-/tmp}/eva-sbs.XXXXXX.json")"
  python3 - "$args" "$mode" <<PY
import json, os, sys
json.dump({
  "mode": sys.argv[2],
  "space": "sbs-" + sys.argv[2],
  "goal": os.environ["GOAL"],
  "url": os.environ["URL"],
  "successMatch": os.environ["SUCCESS_MATCH"],
  "openrouterKey": os.environ["OPENROUTER_API_KEY"],
}, open(sys.argv[1], "w"))
os.chmod(sys.argv[1], 0o600)
PY
  local js
  js="$(mktemp "${TMPDIR:-/tmp}/eva-sbs.XXXXXX.js")"
  {
    python3 -c 'import json,sys; print("const ARGS_PATH = " + json.dumps(sys.argv[1]))' "$args"
    cat "$ROOT/scripts/record-v2.js"
  } > "$js"
  ego-browser nodejs < "$js"
  rm -f "$args" "$js"
}

echo "== BEFORE (LLM) =="
osascript -e 'tell application "System Events" to set frontmost of process "ego lite" to true' >/dev/null
set +e
run_mode before >"$RAW/before.json" 2>&1 &
BPID_RUN=$!
sleep 0.8
BPID=$(start_rec "$RAW/before.mp4")
wait "$BPID_RUN"
set -e
sleep 0.4
stop_rec "$BPID"
echo "before rec bytes $(wc -c < "$RAW/before.mp4" | tr -d ' ')"

echo "== AFTER (Jev) =="
osascript -e 'tell application "System Events" to set frontmost of process "ego lite" to true' >/dev/null
set +e
run_mode after >"$RAW/after.json" 2>&1 &
APID_RUN=$!
sleep 0.4
APID=$(start_rec "$RAW/after.mp4")
wait "$APID_RUN"
set -e
sleep 0.4
stop_rec "$APID"
echo "after rec bytes $(wc -c < "$RAW/after.mp4" | tr -d ' ')"

python3 "$ROOT/scripts/compose-side-by-side.py" "$RAW/before.mp4" "$RAW/after.mp4" "$RAW/before.json" "$RAW/after.json" "$OUT"
ls -lh "$OUT"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,avg_frame_rate -show_entries format=duration -of default=nw=1 "$OUT"
echo "video: $OUT"
