# ego-verified-actions

```bash
npx skills add raydocs/ego-verified-actions
```

Then:

```bash
export OPENROUTER_API_KEY=sk-or-...

GOAL='Open the Docs page' \
  URL='https://lite.ego.app/' \
  SUCCESS_MATCH='/document' \
  ./scripts/run
```

Companion skill for [ego lite](https://lite.ego.app/). One bounded click/fill, checkable evidence. Does not dump `snapshotText()` into a coding model between clicks.

Needs `ego-browser` on `PATH` and `OPENROUTER_API_KEY` (Jev via `typesafe/jev-1.13`) or `TYPESAFE_API_KEY`.

`ok: true` only if `SUCCESS_MATCH` appears in the final URL or title.

## Measured

Same machine, `Open the Docs page` on lite.ego.app:

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
  "page": {
    "url": "https://lite.ego.app/document/en/docs/quick-start"
  }
}
```

| `reason` | What you do |
|---|---|
| `done` | Stop. Extract with `js()` if needed. |
| `need_llm` | One targeted snapshot, then heredoc or stop. |
| `dialog` | Hand off. |
| `budget_exhausted` | Do not rerun unchanged. |

## Env

`GOAL` and `SUCCESS_MATCH` required. Optional: `URL`, `JEV_FILL` (JSON fill map), `MAX_STEPS` (default 4), `SPACE`.

Copy `SKILL.md` + `scripts/` + `references/` into any agent skills dir if you skip `npx`.

```bash
node --test tests
```

MIT. Browser: ego lite. Decisions: TypeSafe Jev.
