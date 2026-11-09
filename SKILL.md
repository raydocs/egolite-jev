---
name: egolite-jev
description: Invoke by name for one bounded, multi-step DOM navigation in Ego Lite whose target link is uncertain and whose success is checkable by URL or title. Not for ordinary ego-browser work; a direct heredoc is faster there.
---

# egolite-jev

Delegate bounded DOM navigation to a fast candidate-selection loop inside ego-browser. Jev picks among opaque, pre-ranked candidate actions; the runner returns checkable evidence. `DONE` from Jev is never treated as success without independent verification.

Requires: ego-lite 0.6.2.9 (`ego-browser` on PATH; documented `taskSpace()`/`page.*` API), and the `ego-browser` skill.

## Default dispatch

Do not load this skill for ordinary browser work. For known targets, batch the justified clicks and targeted extraction in one heredoc.
For uncertain multi-step DOM navigation, use `scripts/run` with a bounded goal and
an independently checkable success condition instead of a snapshot/click loop.
Before sending private page titles, URLs, or candidate labels to OpenRouter, obtain
permission for that disclosure; otherwise keep inspection local and direct.
Skill loading is agent guidance, not a browser interception hook. Report actual
`steps[].via` and `timing.jev_ms`; a deterministic `href` result is not a Jev call.
When authentication is unavailable, report the blocker once; do not claim Jev ran.

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
- Candidates: whole-page snapshot plus DOM `a[href]` links, one per destination. A cross-document link is opened by its href; buttons and in-page anchors are clicked.
- Jev never acts alone on money, deletion or sign-out controls (`Buy`, `Delete`, `Sign out`, `删除`, `支付`, …): the run stops with `need_llm` and `detail: guarded action: …`.
- Auth: `TYPESAFE_API_KEY` (environment, or the `TYPESAFE_API_KEY=` line of `~/.config/typesafe/env`) is used first: TypeSafe's own endpoint answered in ~90 ms vs ~250 ms through OpenRouter (2026-11-09). Otherwise `OPENROUTER_API_KEY` from the environment, `~/.config/egolite-jev/env` (`scripts/install.sh`; legacy `~/.config/ego-verified-actions/env`), or `~/.config/amp/secrets/openrouter-api-key`. `JEV_PROVIDER=openrouter` forces OpenRouter. Output reports `provider`. Never print or commit credentials. Local secret files are not automatically available in cloud orbs.

## Result Handling

The runner outputs JSON stdout: `{ok, reason, goal, elapsed_ms, space, page, steps}`.

| `reason` | Description | Action to Take |
|---|---|---|
| `done` | Target reached; `SUCCESS_MATCH` verified in URL or title. | `ok: true`. Task complete. Extract data with `js()` if needed. |
| `need_llm` | Choice validation failed, confidence < 0.45, `escalate_1` chosen, a guarded control picked, a click/goto failed, or fill missing. `detail` says which. | Inspect page with one targeted snapshot, then use heredoc or stop. Do not loop blindly. |
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
