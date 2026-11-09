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
