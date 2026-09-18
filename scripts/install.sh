#!/bin/bash
# Install ego-verified-actions for Claude Code and Codex, then ask for an OpenRouter key.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/raydocs/ego-verified-actions.git}"
SHARE="${HOME}/.local/share/ego-verified-actions"
CONFIG_DIR="${HOME}/.config/ego-verified-actions"
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

link_skill "${HOME}/.claude/skills/ego-verified-actions"
link_skill "${HOME}/.codex/skills/ego-verified-actions"
link_skill "${HOME}/.agents/skills/ego-verified-actions"

mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

prompt_key() {
  local key=""
  if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
    key="$OPENROUTER_API_KEY"
    echo "Using OPENROUTER_API_KEY from the environment."
  elif [[ -t 0 || -r /dev/tty ]]; then
    echo "Jev on OpenRouter needs an API key (https://openrouter.ai/keys)."
    if [[ -f "$CONFIG" ]] && grep -q '^OPENROUTER_API_KEY=sk-or-' "$CONFIG"; then
      read -r -p "A key is already saved. Replace it? [y/N] " ans </dev/tty || true
      case "$ans" in
        y|Y) ;;
        *) echo "Kept existing key."; return 0 ;;
      esac
    fi
    read -r -s -p "Paste OpenRouter API key (sk-or-...): " key </dev/tty
    echo
  else
    echo "No TTY. Export OPENROUTER_API_KEY and re-run, or create $CONFIG" >&2
    return 1
  fi
  if [[ "$key" != sk-or-* ]]; then
    echo "Expected a key starting with sk-or-" >&2
    return 1
  fi
  umask 077
  printf 'OPENROUTER_API_KEY=%s\n' "$key" > "$CONFIG"
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
