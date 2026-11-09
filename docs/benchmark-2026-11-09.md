# Jev runner vs plain ego-browser heredoc (2026-11-09)

ego-browser 0.6.2.9, `typesafe/jev-1.14` (1.13 for comparison), `MAX_STEPS=6`, public docs sites only.
Plain = the coding model writes `ego-browser nodejs` heredocs: open the start page, filter `a[href]` by goal keywords, follow the match.
Wall time for plain includes the coding model's turns between rounds; Jev wall time is one process.

| Task (start → target) | Jev 1.14 runs (ok / elapsed / via) | Jev 1.13 | Plain heredoc |
|---|---|---|---|
| docs.github.com → managing-a-branch-protection-rule | 4 runs: ok 5.9 s (viewport snapshot, jev×3 + href); ok 4.8 s (jev×2 + href); fail 0.8 s twice (conf 0.35 at step 1, below 0.45) | ok 4.8 s | ok, 2 rounds, browser 0.85 s, wall 10.2 s |
| docs.python.org/3 → asyncio-task | 2 runs: ok 4.6 s (jev×3 + href); fail 1.0 s (viewport snapshot) | fail 3.3 s (escalate at step 3) | ok, 2 rounds (1 wasted on a bad selector), browser 14.2 s, wall 21.8 s |
| developers.cloudflare.com/workers → cron-triggers | 3 runs: escalate 0.8 s (viewport snapshot); crash, no JSON (href hit in a collapsed sidebar, click intercepted); fail 5.1 s with the click-error fix | crashed | ok, 1 round, browser 1.2 s |
| code.visualstudio.com/docs → settings-sync | 2 runs: fail 0.6 s and 1.2 s (scroll, escalate): the link is in the DOM but not in the accessibility snapshot | fail 0.8 s | ok, 1 round, browser 1.2 s |

Jev latency was 240–350 ms per decision; cost about $0.00004 per decision.
Coding-model I/O per Jev run: ~250 chars of command + 0.7–1.8 kB JSON; per plain task: 0.6–1.7 kB of script + 0.3–1.2 kB output.

Result: Jev 1.14 reached the target in 3 of 11 runs (1.13: 1 of 4); plain heredocs in 4 of 4.
Every Jev failure returns `need_llm`, after which the coding model does the plain work anyway.

## Second pass (same day, after the fixes below)

Fixes: a failed click on a link falls back to `page.goto(href)` (hidden duplicates in the full-page
snapshot made correct Jev picks fail with "intercepts pointer events" / "not visible in the viewport"),
click timeout 1.5 s, and the BSD `mktemp` template fix. Four more tasks start at https://lite.ego.app/,
where the target link is not on the start page, so Jev must pick step 1 (always "Docs").

| Task | Jev, minConf 0.45 | Jev, minConf 0.3 | Plain heredoc |
|---|---|---|---|
| GitHub → branch protection rule | ok 6.4 s (jev, jev→goto, href) | ok 7.1 s | ok, 2 rounds, wall 10.2 s |
| Python → asyncio-task | ok 9.2 s (jev, jev→goto, href) | ok 9.6 s | ok, 2 rounds, wall 21.8 s |
| Cloudflare → cron-triggers | ok 6.6 s; 4.9 s with 1.5 s click timeout (href→goto) | ok 6.8 s | ok, 1 round, 1.4 s |
| VS Code → settings-sync | fail (scroll, escalate) | fail | ok, 1 round, 1.4 s |
| ego lite → Space | ok 4.3 s (jev 0.46, href) | ok 5.0 s | ok, 2 rounds, ~13 s |
| ego lite → Windows quick start | fail (Docs at 0.34) | fail (escalate on Docs page) | ok, 2 rounds, ~13 s |
| ego lite → Claude Code guide | fail (Docs at 0.23) | fail (0.22) | ok, 2 rounds, ~13 s |
| ego lite → ego-browser page | fail (Docs at 0.35) | ok 3.1 s | ok, 2 rounds, ~13 s |

Plain ego lite rounds: 0.8 s browser, ~11 s coding-model turn, 1.2–1.7 s browser.
Earlier, at minConf 0.45, Jev picked "Docs" correctly in 8 of 8 ego lite runs but with confidence
0.21–0.44, so the runner refused all 8.

Result: Jev succeeds on 4 of 8 tasks at 0.45 (5 of 8 at 0.3); plain on 8 of 8. Jev spends
~300 ms per decision; the rest is browser time. A Jev success on a 2–3 hop task (3–9 s) beats a
two-round plain loop (10–22 s) because it skips coding-model turns; a Jev failure adds 1–3 s before
the plain loop. When the target link is on the start page, plain takes one round (~1.4 s) and Jev
adds nothing.

## Third pass: candidate-list fixes

Diagnosis (probing the decisions API with the runner's own candidate lists):
- Duplicates split the vote: on lite.ego.app "Docs", "Docs" and "Read the docs" share one URL; Jev gave
  them 0.29 + 0.26 + 0.16 = 0.71, but the top single key had 0.29 < 0.45.
- Unnamed anchors were dropped: the Windows link's text sits two levels below the anchor, and the parser only
  read a direct `text` child.
- Ranking matched the site name: every href contains `lite.ego.app`, so "ego lite" in a goal scored every link
  and tweet links filled the 16 slots.
- Collapsed navigation is absent from the accessibility snapshot (VS Code `settings-sync`).

Fixes: one candidate per destination (href without hash); unnamed controls take the first named node in their
subtree, else the last path segment; score name + href path only; `find`/`guide`/`documentation` are stopwords;
an href containing SUCCESS_MATCH always makes the list; DOM `a[href]` links missing from the snapshot are added
without a ref and opened by href.

| Task | run 1 | run 2 |
|---|---|---|
| GitHub → branch protection rule | ok 1.6 s (jev 0.50, href) | ok 1.4 s (jev 0.46, href) |
| Python → asyncio-task | ok 4.9 s (jev 0.83, jev 0.97, href) | ok 4.7 s |
| Cloudflare → cron-triggers | ok 3.7 s (href) | ok 3.8 s |
| VS Code → settings-sync | ok 7.6 s (DOM href) | ok 3.1 s |
| ego lite → Space | ok 3.1 s (jev 0.94 "Docs", href) | ok 2.9 s |
| ego lite → Windows quick start | ok 3.0 s (jev 0.93, href) | ok 3.0 s |
| ego lite → Claude Code guide | fail: jev 0.46 picks "vs Claude Chrome extension" | fail (same) |
| ego lite → ego-browser page | ok 4.3 s (jev 0.79, href) | ok 4.7 s |

14 of 16 runs succeed (was 4 of 8), all at the default minConf 0.45. Plain heredocs: 8 of 8, 1.4 s when the
link is on the start page, 10–22 s when they need a second round.

Remaining miss (Claude Code guide): Jev keeps choosing "vs Claude Chrome extension" (0.42–0.59) over "Docs".
Tried and not adopted: viewport page text in `state` (it escalates instead, 0.33–0.43), each link's page
section in the criteria, an instruction to prefer hub sections, and backtracking with the lure excluded
(Jev then escalates on the home page). A lexical lure with no hub hint is a limit of a one-shot choice.

## Similar projects (read 2026-11-09, not re-run)

| Project | Candidates | Acceptance | Own measured result |
|---|---|---|---|
| Ying-Kai-Liao/jev-browser | DOM, all elements, nearby text, href path; Playwright | top-1, `minTarget` 0.3 → "ambiguous" | 40/42 fixture + public tasks, ~290 ms/call; aggregates only |
| jiangkoumo/ego-decision-layer | DOM viewport, ≤60; viewport text in state | gates off by default; stale/visibility/danger guards | 13/16 live trials (ego host 8/8); raw JSON committed |
| ZephyrDeng/ego-jev | viewport snapshot + DOM, ≤120, `in:` context, position | op ≥ 0.45, target ≥ 0.35, screenshot locate rescue | one 7-step form, 3/3; raw runs committed |
| romaluev/jev-ego | DOM viewport, ≤250, page text ≤6000 | none (argmax) | one Google Flights run, 31.6 s |

None dedupes by destination or ranks by the goal; all target general agent loops (forms, search), and none
reports a head-to-head against plain agent heredocs on navigation. Ideas worth a later test here: per-step
history in `state`, a stale/visibility re-check before clicks, and a danger-word block before acting.
