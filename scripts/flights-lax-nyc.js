const fs = await import("node:fs");
const fsp = await import("node:fs/promises");
const ARGS = JSON.parse(fs.readFileSync(ARGS_PATH, "utf8"));
try { fs.unlinkSync(ARGS_PATH); } catch {}
const startedAt = Date.now();
const steps = [];
const frameDir = "/tmp/flights-cast";
await fsp.rm(frameDir, { recursive: true, force: true });
await fsp.mkdir(frameDir, { recursive: true });
let frameN = 0;

const existing = (await listTaskSpaces()).find((s) => s.name === "flights-lax-nyc");
const task = existing ? await taskSpace(existing.id) : await taskSpace("flights-lax-nyc");
const page = task.page("p1");

await page.goto("https://www.google.com/travel/flights", { waitUntil: "domcontentloaded", timeout: 25_000 });
try { await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }); } catch {}
await page.waitForTimeout(600);

async function pump() {
  frameN += 1;
  try {
    await page.screenshot({ path: frameDir + "/f" + String(frameN).padStart(4, "0") + ".png" });
  } catch {}
}

async function typeAirport(sel, code, matcher, label) {
  const rect = await page.evaluate((sel) => {
    const input = document.querySelector(sel);
    if (!input) return null;
    const r = input.getBoundingClientRect();
    return { x: r.x + 24, y: r.y + r.height / 2 };
  }, sel);
  if (!rect) throw new Error("missing " + sel);
  await page.mouse.click(rect.x, rect.y, { label });
  await page.waitForTimeout(150);
  await page.keyboard.press("Meta+A");
  await page.keyboard.type(code, { delay: 40 });
  await page.waitForTimeout(1100);
  const picked = await page.evaluate((matcher) => {
    const re = new RegExp(matcher, "i");
    const opts = [...document.querySelectorAll('[role="option"]')];
    const opt = opts.find((el) => re.test(el.textContent || ""));
    if (!opt) return { ok: false };
    opt.click();
    return { ok: true, text: (opt.textContent || "").slice(0, 90) };
  }, matcher);
  steps.push({ acted: "airport", code, picked });
  await page.waitForTimeout(400);
  await pump();
}

await pump();
await typeAirport('input[aria-label="Where from?"]', "LAX", "Los Angeles International|\\(LAX\\)", "type LAX");
await typeAirport('input[placeholder="Where to?"]', "JFK", "Kennedy|\\(JFK\\)", "type JFK");
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  const b = btns.find((el) => /Search|Explore destinations/i.test((el.getAttribute("aria-label") || "") + (el.textContent || "")));
  if (b) b.click();
});
steps.push({ acted: "search" });
await pump();
try { await page.waitForURL(/tfs=|search/, { timeout: 12_000 }); } catch {}
await page.waitForTimeout(2000);
await pump();
await pump();

const url = await page.url();
const title = await page.title();
const result = {
  ok: /tfs=|search|JFK|LAX/i.test(url),
  elapsed_ms: Date.now() - startedAt,
  frames: frameN,
  page: { url, title },
  steps,
};
console.log(JSON.stringify(result, null, 2));
