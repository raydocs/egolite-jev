# Runner Contract & Specifications

This document defines the contract between the orchestrating agent and `egolite-jev`.

## 1. Input Contract

### Invocation
The wrapper script `scripts/run` executes `scripts/loop.js` inside the `ego-browser` environment:
```bash
GOAL='...' URL='...' SUCCESS_MATCH='...' ./scripts/run
```

### Argument Passing
- Required environment variables: `GOAL`, `SUCCESS_MATCH`, and either `OPENROUTER_API_KEY` or `TYPESAFE_API_KEY`.
- The runner creates a temporary JSON parameters file (permission `0600`) containing:
  - `goal`: High-level goal string
  - `url`: Optional starting URL
  - `space`: Task space name (defaults to `verified-actions`)
  - `maxSteps`: Max iterations (default 4, hard cap 8)
  - `minConf`: Minimum confidence threshold (default 0.45)
  - `model`: Decision model (default `typesafe/jev-1.13`)
  - `successMatch`: Target substring for independent verification
  - `fill`: Dictionary mapping control labels/keys to values for `FILL` operations
  - `keys`: API credentials
- The runner unlinks the temporary file upon initialization or via process exit trap.

## 2. Output Contract (JSON stdout)

The runner produces a single JSON object on stdout upon termination:

```json
{
  "ok": true,
  "reason": "done",
  "goal": "Open the Docs page",
  "elapsed_ms": 1420,
  "space": "verified-actions",
  "page": {
    "url": "https://lite.ego.app/document/introduction",
    "title": "Introduction - Ego Documentation"
  },
  "steps": [
    {
      "step": 1,
      "action": "click_1",
      "detail": "CLICK link \"Docs\" → https://lite.ego.app/document/...",
      "confidence": 0.95
    }
  ]
}
```

### Result Evaluation
- `ok`: Boolean. Evaluates to `true` **strictly** if `verifiedDone(page, SUCCESS_MATCH)` returns `true` on the final page state.
- `verifiedDone`: Checks whether `SUCCESS_MATCH.toLowerCase()` is contained in `(url + " " + title).toLowerCase()`. If `SUCCESS_MATCH` is empty, it returns `false`.
- **Jev `DONE` is never success**: Jev picking a done or escalate action is not sufficient to set `ok: true`.

### Reason Codes
- `done`: `verifiedDone` passed. Task achieved.
- `need_llm`: Model confidence was below `minConf` (0.45), Jev picked `escalate_1`, choice validation failed, or a required `FILL` value was missing from `JEV_FILL`.
- `dialog`: Native browser dialog (`pageInfo().dialog`) was encountered.
- `budget_exhausted`: Maximum steps reached without achieving `verifiedDone`.

## 3. Wait Policy

To maintain speed and avoid freezing execution:
1. **Target ID Tracking**: Before performing a `click('@' + ref)`, record the set of all active tab `targetIds`.
2. **New Tab Opened**: If a new `targetId` appears, switch to that tab with `switchTab(newId)` and call `waitForLoad()`.
3. **URL Changed**: If the current tab URL changes, call `waitForLoad()`.
4. **Same-Page Click**: If the click modifies the page without opening a new tab or changing URL, wait exactly `0.15s`.
5. **Never**: Never call `waitForLoad()` after a same-page click.

## 4. Opaque Keys & Action Candidates

### Opaque Candidate Generation
- Real DOM references (`@ref`, `backendNodeId`) are stripped and never sent to Jev.
- Candidate actions use opaque keys:
  - `click_1`, `click_2`, ...
  - `fill_1`, `fill_2`, ...
  - `scroll_1`
  - `escalate_1`
- Noise filtering:
  - Elements matching FAQ-like question patterns (`/^(what|how|why|does|can|is|where|when)\b/i`) are dropped unless they have an `href`.
  - Unnamed non-field elements are dropped.
- Pre-ranking:
  - Scored by token overlap with `GOAL` + bonus for `href` presence.
  - Capped at 16 click/fill candidates, then `scroll_1` and `escalate_1` are appended.

### Choice Validation
Every decision returned by Jev must satisfy strict mathematical invariants:
1. `choice` must be present in the candidate `allowedKeys`.
2. `probabilities` map keys must match `allowedKeys` exactly.
3. Every probability value must be finite and within `[0, 1]`.
4. The sum of probabilities must be within `0.02` of `1.0`.
5. The chosen candidate's probability must be the maximum value in `probabilities`.
6. `confidence` must be finite and within `[0, 1]`.
