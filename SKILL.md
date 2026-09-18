---
name: egolite-jev
description: Trigger when automating multi-step browser interactions where target buttons or links are uncertain, delegating bounded DOM navigation in ego-lite, selecting next actions via Jev fast decisions without snapshot dumps, or requiring verified page state checks before declaring browser task completion.
---

# egolite-jev

Delegate bounded DOM navigation to a fast candidate-selection loop inside ego-browser. Jev picks among opaque, pre-ranked candidate actions; the runner returns checkable evidence. `DONE` from Jev is never treated as success without independent verification.

Requires: ego-lite 0.4.7.4 with `ego-browser` on PATH, and the `ego-browser` skill.

## Recipe: Choosing the Right Browser Tool

- **Known click or `js()` extract**: Use an `ego-browser` heredoc directly. No Jev needed.
- **Installed site skill**: Use the matching `siteSkills` / `runSiteTool` if available.
- **Canvas / Docs / Figma**: Use the `ego-browser` visual workflow (screenshots + vision).
- **Uncertain DOM target**: Use this runner (`<skill_dir>/scripts/run`).
- **Auth, CAPTCHA, payment, or active user**: Call `handOffTaskSpace` and stop.

## Run

```bash
GOAL='Open the Docs page' URL='https://lite.ego.app/' SUCCESS_MATCH='/document' \
  <skill_dir>/scripts/run
```

- `GOAL` and `SUCCESS_MATCH` are mandatory.
- `SUCCESS_MATCH` is verified against `(url + " " + title).toLowerCase()`.
- Fill values come strictly from `JEV_FILL` (JSON map); missing values escalate to `need_llm`.
- Budget is capped at 4 actions (max 8).
- Auth: `OPENROUTER_API_KEY` in the environment, or `~/.config/egolite-jev/env` from `scripts/install.sh`. Do not paste the key into the transcript if that file exists.

## Result Handling

The runner outputs JSON stdout: `{ok, reason, goal, elapsed_ms, space, page, steps}`.

| `reason` | Description | Action to Take |
|---|---|---|
| `done` | Target reached; `SUCCESS_MATCH` verified in URL or title. | `ok: true`. Task complete. Extract data with `js()` if needed. |
| `need_llm` | Choice validation failed, confidence < 0.45, `escalate_1` chosen, or fill missing. | Inspect page with one targeted snapshot, then use heredoc or stop. Do not loop blindly. |
| `dialog` | Native dialog (`pageInfo().dialog`) appeared. | Handle dialog via CDP or hand off to user. |
| `budget_exhausted` | Action budget reached without matching `SUCCESS_MATCH`. | Inspect `steps`. Refine goal or hand off; do not re-run unchanged. |

`ok` is true **only** when `verifiedDone` succeeds on the final page (`reason: 'done'`). Jev model confidence is not proof of success.

## Forbidden

- Never dump `snapshot()` or `snapshotText()` into the LLM context between clicks.
- Never execute one click per LLM reasoning turn.
- Never treat Jev `DONE` or high model confidence as success without independent verification.
- Never use Chrome, Puppeteer, Playwright, or browser-use as a fallback when keys are missing.
- Never call `takeOverTaskSpace` automatically without human consent.
- Never call `waitForLoad` after same-page clicks (runner waits only when a new tab opens or URL changes; same-page clicks wait 0.15s).
- Never send raw `@ref` or `backendNodeId` to Jev (use opaque action keys only).
- Never invent selectors, fill text, or JavaScript from Jev output.
