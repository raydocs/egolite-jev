# ego-verified-actions

Companion skill for [ego lite](https://lite.ego.app/): **one bounded click/fill, checkable evidence, no snapshot dump into a coding model.**

Coding agents usually do `snapshotText()` → LLM turn → one click → repeat. This runner lists the controls locally, asks [TypeSafe Jev](https://docs.typesafe.ai) only when the destination is unclear, clicks inside **one** `ego-browser` process, and treats success as a URL/title match you supplied — not a model saying “done”.

Built for **ego-browser 0.4.7.4** (`useOrCreateTaskSpace`, `snapshot()`, `click('@N')`). Not [phd-peter/ego-jev](https://github.com/phd-peter/ego-jev) (0.5 Page API) and not a Chrome/ultrafast clone.

## Measured (same machine, same goal)

`GOAL='Open the Docs page'` `URL='https://lite.ego.app/'` `SUCCESS_MATCH='/document'`

| | Wall | Decide |
|---|---|---|
| Dump `snapshotText` (~32k chars) into gpt-4o-mini, then click | 35–41 s typical; one run 131 s | ~3.1 s |
| This runner, after restarting ego lite | **4.1 s** | href match, no Jev |
| Second run (warm cache) | **0.92 s** | 0 |

When the top control’s `href` already contains `SUCCESS_MATCH`, Jev is skipped (`via: "href"`). Final `ok` still requires the live URL/title to match.

## Install

```bash
npx skills add raydocs/ego-verified-actions
```

Or copy `SKILL.md`, `scripts/`, `references/` into your agent skills dir (Claude, Codex, Cursor, Grok, …).

Needs:

- ego lite with `ego-browser` on `PATH`
- `OPENROUTER_API_KEY` (model `typesafe/jev-1.13`) **or** `TYPESAFE_API_KEY`

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...

GOAL='Open the Docs page' \
  URL='https://lite.ego.app/' \
  SUCCESS_MATCH='/document' \
  ./scripts/run
```

`ok: true` only if `SUCCESS_MATCH` appears in the **final** URL or title.

```json
{
  "ok": true,
  "reason": "done",
  "elapsed_ms": 4131,
  "timing": {
    "space_ms": 36,
    "open_ms": 2025,
    "jev_ms": 0,
    "click_ms": 799,
    "settle_ms": 0
  },
  "page": {
    "url": "https://lite.ego.app/document/en/docs/quick-start",
    "title": "Quick start | ego (lite) Docs"
  },
  "steps": [
    {
      "step": 1,
      "via": "href",
      "detail": "CLICK anchor \"Docs\" → https://lite.ego.app/document/en/docs/quick-start",
      "acted": "click"
    }
  ]
}
```

| `reason` | Meaning |
|---|---|
| `done` | `SUCCESS_MATCH` hit. Extract with `js()` if you still need content. |
| `need_llm` | Low confidence, `escalate_1`, or missing `JEV_FILL`. One targeted snapshot, then stop or heredoc. |
| `dialog` | Native dialog. Hand off. |
| `budget_exhausted` | Cap hit. Do not rerun unchanged. |

## Env

| | |
|---|---|
| `GOAL` | Required. What success looks like. |
| `SUCCESS_MATCH` | Required. Substring of URL or title. |
| `URL` | Optional start tab. |
| `JEV_FILL` | JSON map of strings to type. Jev never invents fill text. |
| `MAX_STEPS` | Default 4, max 8. |
| `SPACE` | Task space name. |

## What it will not do

- Paste `snapshotText()` into the LLM between clicks
- Trust Jev `DONE`
- Drive Chrome / Playwright / Orca `computer`
- Auto `takeOverTaskSpace`
- Canvas / Google Docs / Figma (use ego’s visual workflow)

## Tests

```bash
node --test tests
```

## Credits

Opaque keys and probability checks follow the discipline in [phd-peter/ego-jev](https://github.com/phd-peter/ego-jev) (MIT). Independent implementation; no source copied. Model: TypeSafe Jev. Browser: ego lite.

## License

MIT
