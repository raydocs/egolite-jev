# ego-verified-actions

Claude Code / Codex — one command, then it asks for your OpenRouter key:

```bash
curl -fsSL https://raw.githubusercontent.com/raydocs/ego-verified-actions/main/scripts/install.sh | bash
```

Or:

```bash
npx skills add raydocs/ego-verified-actions
```

Then give this to the agent:

```
Read the ego-verified-actions skill. Do not dump snapshotText() into chat.
Run:
GOAL='Open the Docs page' URL='https://lite.ego.app/' SUCCESS_MATCH='/document' \
  ~/.claude/skills/ego-verified-actions/scripts/run
(Codex: ~/.codex/skills/ego-verified-actions/scripts/run)
Pass if ok:true and page.url contains /document. Print elapsed_ms and steps[].via.
```

`install.sh` links the skill into **Claude Code** (`~/.claude/skills`) and **Codex** (`~/.codex/skills`), then prompts for `OPENROUTER_API_KEY` and saves it to `~/.config/ego-verified-actions/env` (mode 600). `scripts/run` loads that file, so you do not export the key every session.

Needs [ego lite](https://lite.ego.app/) with `ego-browser` on `PATH`. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys).

`ok: true` only if `SUCCESS_MATCH` appears in the final URL or title.

## Measured

`Open the Docs page` on lite.ego.app:

| | Wall |
|---|---|
| Snapshot into an LLM, then click | 35–41 s |
| This runner, ego just restarted | **4.1 s** |
| Second run, warm | **0.92 s** |

If the top control’s `href` already contains `SUCCESS_MATCH`, Jev is skipped (`via: "href"`).

## Result

```json
{
  "ok": true,
  "reason": "done",
  "elapsed_ms": 4131,
  "page": { "url": "https://lite.ego.app/document/en/docs/quick-start" }
}
```

| `reason` | What you do |
|---|---|
| `done` | Stop. Extract with `js()` if needed. |
| `need_llm` | One targeted snapshot, then heredoc or stop. |
| `dialog` | Hand off. |
| `budget_exhausted` | Do not rerun unchanged. |

Optional env: `URL`, `JEV_FILL`, `MAX_STEPS`, `SPACE`. `GOAL` and `SUCCESS_MATCH` required.

```bash
node --test tests
```

MIT. Browser: ego lite. Decisions: TypeSafe Jev.
