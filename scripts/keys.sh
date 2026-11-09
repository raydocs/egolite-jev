# Sourced by scripts/run: resolves the Jev key without printing it.
# shellcheck shell=bash
CONFIG=""
for candidate in \
  "${HOME}/.config/egolite-jev/env" \
  "${HOME}/.config/ego-verified-actions/env"
do
  if [[ -f "$candidate" ]]; then
    CONFIG="$candidate"
    break
  fi
done
if [[ -z "${OPENROUTER_API_KEY:-}" && -n "$CONFIG" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$CONFIG"
  set +a
fi

# TypeSafe's own endpoint answers in ~90 ms against ~250 ms through OpenRouter (2026-11-09), so a
# TypeSafe key is used first. Only the key line is read from ~/.config/typesafe/env, never sourced.
if [[ -z "${TYPESAFE_API_KEY:-}" && -z "${TYPESAFE_AI_API_KEY:-}" && -r "${HOME}/.config/typesafe/env" ]]; then
  TYPESAFE_API_KEY="$(sed -n 's/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}TYPESAFE_API_KEY=//p' "${HOME}/.config/typesafe/env" | head -n 1 | sed "s/^[\"']//; s/[\"']\$//")"
  if [[ -n "$TYPESAFE_API_KEY" ]]; then export TYPESAFE_API_KEY; else unset TYPESAFE_API_KEY; fi
fi

if [[ -z "${OPENROUTER_API_KEY:-}" && ( "${JEV_PROVIDER:-}" == "openrouter" || ( -z "${TYPESAFE_API_KEY:-}" && -z "${TYPESAFE_AI_API_KEY:-}" ) ) && -r "${HOME}/.config/amp/secrets/openrouter-api-key" ]]; then
  export OPENROUTER_API_KEY="$(cat "${HOME}/.config/amp/secrets/openrouter-api-key")"
fi
