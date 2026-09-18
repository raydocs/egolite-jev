# Agent handoff

Read `SKILL.md`. Use `scripts/run`. Do not dump `snapshotText()` into the chat.

Key: `OPENROUTER_API_KEY` in the environment, or `~/.config/ego-verified-actions/env` written by `scripts/install.sh`. Do not ask the user to paste the key into the transcript if that file already exists.

Smoke test:

```bash
export PATH="$HOME/.local/bin:$PATH"
GOAL='Open the Docs page' URL='https://lite.ego.app/' SUCCESS_MATCH='/document' \
  ~/.codex/skills/ego-verified-actions/scripts/run
```

On Claude Code the same script lives at `~/.claude/skills/ego-verified-actions/scripts/run`.

Pass only if JSON has `ok: true`, `reason: done`, and `page.url` contains `/document`. Print `elapsed_ms`, `timing`, and `steps[].via`. If `ok` is false, paste the JSON and stop. Do not fall back to Chrome, Playwright, or one-click-per-turn snapshot loops.
