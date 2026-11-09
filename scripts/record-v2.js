const fs = await import("node:fs");
const ARGS = JSON.parse(fs.readFileSync(ARGS_PATH, "utf8"));
try { fs.unlinkSync(ARGS_PATH); } catch {}
const GOAL = ARGS.goal;
const START_URL = ARGS.url;
const SUCCESS_MATCH = String(ARGS.successMatch || "").toLowerCase();
const MODE = ARGS.mode === "before" ? "before" : "after";
const KEY = ARGS.openrouterKey;
const startedAt = Date.now();

const task = await taskSpace(ARGS.space || "sbs");
let page = task.page("p1");
await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 20_000 });
try { await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }); } catch {}

function matched(url, title) {
  return ((url || "") + " " + (title || "")).toLowerCase().includes(SUCCESS_MATCH);
}

function parseClicks(snap) {
  const lines = String(snap || "").split("\n");
  const out = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(\S+)\s+\[ref=(\d+)([^\]]*)\]/);
    if (!m) continue;
    const role = m[1];
    if (!/^(anchor|button|link)$/i.test(role)) continue;
    let name = (m[3].match(/name="([^"]*)"/) || [])[1] || "";
    if (!name) {
      const tm = (lines[i + 1] || "").match(/text "([^"]*)"/);
      if (tm) name = tm[1];
    }
    name = name.replace(/\s+/g, " ").trim().slice(0, 80);
    if (name.length < 2) continue;
    const href = ((m[3].match(/url=([^,\]]+)/) || m[3].match(/loc=href:([^,\]]+)/) || [])[1] || "").trim();
    const key = role + "|" + name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ref: m[2], role, name, href });
  }
  const tokens = GOAL.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !/^(the|and|for|open|page)$/.test(t));
  out.sort((a, b) => {
    const sa = tokens.reduce((s, t) => s + ((a.name + a.href).toLowerCase().includes(t) ? 5 : 0), 0);
    const sb = tokens.reduce((s, t) => s + ((b.name + b.href).toLowerCase().includes(t) ? 5 : 0), 0);
    return sb - sa;
  });
  return out.slice(0, 20);
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + KEY,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/raydocs/egolite-jev",
      "X-Title": "egolite-jev-sbs",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error("HTTP " + res.status + " " + text.slice(0, 240));
  return JSON.parse(text);
}

async function pick(clicks, snap) {
  const hrefHit = clicks.find((c) => c.href.toLowerCase().includes(SUCCESS_MATCH));
  if (MODE === "after" && hrefHit) return { via: "href", click: hrefHit, ms: 0 };

  if (MODE === "before") {
    const t0 = Date.now();
    const json = await post("https://openrouter.ai/api/v1/chat/completions", {
      model: "openai/gpt-4o-mini",
      temperature: 0,
      max_tokens: 80,
      messages: [
        { role: "system", content: 'Pick the control to click. JSON only {"name":"Docs"}.' },
        { role: "user", content: "Goal: " + GOAL + "\nSnapshot:\n" + String(snap).slice(0, 22000) },
      ],
    });
    let name = "";
    try {
      const raw = json.choices[0].message.content;
      const m = String(raw).match(/\{[\s\S]*\}/);
      name = String(JSON.parse(m ? m[0] : raw).name || "");
    } catch {}
    const click = clicks.find((c) => c.name.toLowerCase() === name.toLowerCase())
      || clicks.find((c) => name && c.name.toLowerCase().includes(name.toLowerCase()))
      || clicks[0];
    return { via: "llm", click, ms: Date.now() - t0 };
  }

  const criteria = {};
  clicks.forEach((c, i) => {
    criteria[String(i + 1)] = (c.role + " " + c.name + (c.href ? " -> " + c.href : "")).slice(0, 180);
  });
  const t0 = Date.now();
  const json = await post("https://openrouter.ai/api/alpha/decisions", {
    model: "typesafe/jev-1.14",
    state: { subgoal: GOAL, url: await page.url() },
    questions: {
      next: {
        type: "choice",
        instructions: "Pick the control that advances the subgoal.",
        criteria,
      },
    },
  });
  const choice = json.answers && json.answers.next && json.answers.next.choice;
  const click = clicks[Number(choice) - 1] || clicks[0];
  return { via: "jev", click, ms: Date.now() - t0 };
}

const steps = [];
for (let i = 0; i < 4; i++) {
  const url = await page.url();
  const title = await page.title();
  if (matched(url, title)) break;
  const snap = await page.snapshot();
  const clicks = parseClicks(snap);
  if (!clicks.length) break;
  const picked = await pick(clicks, snap);
  steps.push({ via: picked.via, name: picked.click && picked.click.name, ms: picked.ms });
  if (!picked.click) break;
  const popupPromise = page.waitForEvent("popup", { timeout: 4_000 }).catch(() => null);
  await page.click("@" + picked.click.ref, { label: picked.click.name });
  const pop = await popupPromise;
  if (pop) {
    page = pop;
    try { await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }); } catch {}
  } else {
    try { await page.waitForURL((u) => String(u).toLowerCase().includes(SUCCESS_MATCH), { timeout: 4_000 }); } catch {}
  }
}

const finalUrl = await page.url();
const finalTitle = await page.title();
const result = {
  ok: matched(finalUrl, finalTitle),
  mode: MODE,
  elapsed_ms: Date.now() - startedAt,
  page: { url: finalUrl, title: finalTitle },
  steps,
};
console.log(JSON.stringify(result));
