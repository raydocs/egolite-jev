#!/bin/bash
# Install egolite-jev for Claude Code and Codex, then ask for a Jev key:
# TypeSafe (preferred, lower latency) or OpenRouter (sk-or-...).
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/raydocs/egolite-jev.git}"
SHARE="${HOME}/.local/share/egolite-jev"
CONFIG_DIR="${HOME}/.config/egolite-jev"
CONFIG="${CONFIG_DIR}/env"

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "${HERE}/../SKILL.md" && -x "${HERE}/run" ]]; then
    SHARE="$(cd "${HERE}/.." && pwd)"
  fi
fi

if [[ ! -f "${SHARE}/SKILL.md" || ! -x "${SHARE}/scripts/run" ]]; then
  if [[ -d "${SHARE}/.git" ]]; then
    git -C "$SHARE" pull --ff-only
  else
    mkdir -p "$(dirname "$SHARE")"
    git clone --depth 1 "$REPO_URL" "$SHARE"
  fi
fi

link_skill() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"
  ln -sfn "$SHARE" "$dest"
  echo "skill -> $dest"
}

link_skill "${HOME}/.claude/skills/egolite-jev"
link_skill "${HOME}/.codex/skills/egolite-jev"
link_skill "${HOME}/.agents/skills/egolite-jev"

mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
OLD_CONFIG="${HOME}/.config/ego-verified-actions/env"
if [[ -f "$OLD_CONFIG" && ! -f "$CONFIG" ]]; then
  cp "$OLD_CONFIG" "$CONFIG"
  chmod 600 "$CONFIG"
  echo "Moved saved key to $CONFIG"
fi

prompt_key() {
  local key=""
  if [[ -n "${TYPESAFE_API_KEY:-}" ]]; then
    key="$TYPESAFE_API_KEY"
    echo "Using TYPESAFE_API_KEY from the environment."
  elif [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
    key="$OPENROUTER_API_KEY"
    echo "Using OPENROUTER_API_KEY from the environment."
  elif [[ -t 0 || -r /dev/tty ]]; then
    echo "Jev needs an API key: TypeSafe (https://docs.typesafe.ai, ~90 ms per decision)"
    echo "or OpenRouter (https://openrouter.ai/keys, sk-or-..., ~250 ms)."
    if [[ -f "$CONFIG" ]] && grep -Eq '^(TYPESAFE|OPENROUTER)_API_KEY=.' "$CONFIG"; then
      read -r -p "A key is already saved. Replace it? [y/N] " ans </dev/tty || true
      case "$ans" in
        y|Y) ;;
        *) echo "Kept existing key."; return 0 ;;
      esac
    fi
    read -r -s -p "Paste TypeSafe or OpenRouter API key: " key </dev/tty
    echo
  else
    echo "No TTY. Export TYPESAFE_API_KEY or OPENROUTER_API_KEY and re-run, or create $CONFIG" >&2
    return 1
  fi
  if [[ -z "$key" || "$key" =~ [[:space:]] ]]; then
    echo "Expected a single API key" >&2
    return 1
  fi
  local name=TYPESAFE_API_KEY
  [[ "$key" == sk-or-* ]] && name=OPENROUTER_API_KEY
  umask 077
  printf '%s=%s\n' "$name" "$key" > "$CONFIG"
  chmod 600 "$CONFIG"
  echo "Saved key to $CONFIG"
}

prompt_key

echo
echo "Installed. Smoke test:"
echo "  GOAL='Open the Docs page' URL='https://lite.ego.app/' SUCCESS_MATCH='/document' \\"
echo "    ${SHARE}/scripts/run"
echo
echo "Claude Code and Codex will pick up the skill on the next session."
