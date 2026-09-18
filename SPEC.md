# egolite-jev — locked spec

Companion skill for **ego-lite 0.4.7.4** (global helpers: `useOrCreateTaskSpace`, `snapshot()`, `click('@N')`).

## Product claim

A coding agent delegates one bounded DOM subtask. The runner returns **checkable evidence**. Jev only picks among actions the runner already listed. `DONE` from Jev is never success.

## File ownership (do not edit others' files)

| Owner | Files |
|---|---|
| Amp | `scripts/lib.js`, `tests/**` |
| Grok | `scripts/loop.js`, `scripts/run` |
| Agy | `SKILL.md`, `README.md`, `references/**`, `examples/**` |
| Orchestrator | `SPEC.md`, `LICENSE`, overlay wiring |

Delete leftover `scripts/jev-loop*` after Grok's `scripts/run` exists.

## Amp: `scripts/lib.js` (pure Node, no ego globals)

Export (or attach to `globalThis` if no `export` — ego concat cannot use ESM `import`; **use function declarations, no `export`/`require`/`import`** so the wrapper can `cat lib.js loop.js`):

- `parseSnapshot(content: string) -> lines[]` with `{indent, role, ref, href, loc, name, raw}`
- `buildCandidates(content, goal) -> {actions: Action[], byKey: Record<string, Action>}`
  - Action: `{key, op: 'CLICK'|'FILL'|'SCROLL_DOWN', ref?, name, href?, loc?, role?}`
  - Opaque keys only: `click_1`, `fill_1`, `scroll_1` — **never** send `@ref` / backendNodeId to Jev
  - Drop FAQ-like names (`/^(what|how|why|does|can|is|where|when)\b/i`) unless they have `href`
  - Drop unnamed non-fields
  - Rank by goal-token overlap + href bonus; cap 16 click/fill then append `scroll_1` and `escalate_1` (`op: 'ESCALATE'`)
- `describeAction(action) -> string` e.g. `CLICK link "Docs" → https://lite.ego.app/document/...`
- `validateChoice(answer, allowedKeys) -> {ok, choice, confidence}`
  - `choice` in allowedKeys
  - `probabilities` keys === allowedKeys
  - values finite in `[0,1]`, sum within 0.02 of 1
  - chosen probability is the max
  - confidence finite in `[0,1]`
- `verifiedDone(page, successMatch) -> boolean` — `successMatch` substring in `(url+' '+title).toLowerCase()`. Empty match → always false.

`tests/` use `node --test` (no ego, no network). Fixture: homepage snapshot excerpt containing a `Docs` link with url= and FAQ buttons without href. Assert Docs is `click_1` (or at least ranked above FAQ) and FAQ buttons are absent.

## Grok: `scripts/loop.js` + `scripts/run`

Wrapper `scripts/run`:

- Require `GOAL` and `SUCCESS_MATCH`
- Require `OPENROUTER_API_KEY` or `TYPESAFE_API_KEY`
- `mktemp` unique args JSON (mode 600), write goal/url/space/maxSteps/minConf/model/successMatch/fill/keys
- Preamble: `const ARGS_PATH = "<path>"`
- `{ preamble; cat lib.js; cat loop.js } | ego-browser nodejs`
- trap unlink args file
- Do not `exec` over the trap

`scripts/loop.js` (runs inside ego-browser; **no import/require**; lib.js already loaded):

1. Read args from `ARGS_PATH`, unlink
2. `useOrCreateTaskSpace(SPACE)`; optional `openOrReuseTab(URL)`
3. Loop max 4 (cap 8):
   - If `pageInfo().dialog` → `{reason:'dialog'}`
   - If `verifiedDone(page, SUCCESS_MATCH)` → `{reason:'done'}`
   - `snapshot()` then `buildCandidates(content, GOAL)`
   - One Jev Choice `next_action` whose criteria are `describeAction` strings keyed by opaque ids **plus** `escalate_1`
   - `validateChoice`; fail → `need_llm`
   - `escalate_1` or confidence < 0.45 → `need_llm`
   - FILL: value from `JEV_FILL` only; missing → `need_llm` (do not call a text LLM)
   - CLICK: record **set of tab targetIds**, `click('@'+ref)`, then:
     - if a **new** targetId appeared → `switchTab` that id, `waitForLoad` only then
     - else if URL changed → `waitForLoad`
     - else wait 0.15s (**never** `waitForLoad` on same-page clicks)
   - SCROLL_DOWN: `scrollBy(900)`
4. JSON stdout: `{ok, reason, goal, elapsed_ms, space, page:{url,title}, steps}`
   - `ok` true **only** if `verifiedDone` on the final page
   - Jev saying done/escalate is not `ok`

Jev endpoint: OpenRouter `https://openrouter.ai/api/alpha/decisions` model `typesafe/jev-1.13`, else TypeSafe `https://api.typesafe.ai/v1/systemone`.

No naive mode, no screenshots, no RECORD_DIR.

## Agy: skill packaging

`SKILL.md` ≤ 120 lines. Description is **triggers only**. Recipe: when to use vs ego heredoc vs siteSkills vs visual vs handoff. Run command uses `<skill_dir>/scripts/run`. Result table. Forbidden list (no snapshot dump, no Chrome, no auto takeOver, no treating Jev DONE as success).

`README.md`: `npx skills add` first, ego 0.4.7.4 requirement, env, Docs example.

`references/contract.md`: JSON in/out, wait policy, opaque keys.

`examples/open-docs.sh`: GOAL/URL/SUCCESS_MATCH=/document

Do not mention Grok-specific paths as the only install.

## Demo (orchestrator)

```
GOAL='Open the Docs page' URL='https://lite.ego.app/' SUCCESS_MATCH='/document' ./scripts/run
```

Pass: `ok:true`, url contains `/document`, `elapsed_ms < 20000`, no FAQ name in `steps[].detail`, process is ego-browser.

## Non-goals

Chrome/Harness, daemon, Flights booker, inspector UI, overwriting ego-browser SKILL.md, Node 26 lock, OpenAI Responses requirement.
