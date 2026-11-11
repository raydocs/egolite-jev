// Concatenated before loop.js: only function declarations at the top level.
function parseSnapshot(content) {
  const lines = [];
  for (const raw of content.split(/\r?\n/)) {
    const match = raw.match(/^(\s*)([\w-]+)(?:\s+\[((?:"(?:\\.|[^"\\])*"|[^\]"])*?)\])?(?:\s+"((?:\\.|[^"\\])*)")?/);
    if (!match) continue;
    const attrs = {};
    for (const attr of (match[3] || '').matchAll(/(?:^|,\s*|\s+)(\w+)=("(?:\\.|[^"\\])*"|[^,\s]+(?:\s+(?!\w+=)[^,\s]+)*)/g)) {
      attrs[attr[1]] = attr[2].startsWith('"')
        ? attr[2].slice(1, -1).replace(/\\(["\\])/g, '$1')
        : attr[2].trim();
    }
    const loc = attrs.loc || '';
    lines.push({
      indent: match[1].length,
      role: match[2],
      ref: attrs.ref || '',
      href: attrs.url || (loc.startsWith('href:') ? loc.slice(5) : ''),
      loc,
      name: (attrs.name || match[4] || '').replace(/\s+/g, ' ').trim(),
      raw,
    });
  }
  // An unnamed control takes the first named node inside its own subtree (e.g. an
  // anchor wrapping container > text "Windows"), never a sibling's text.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].name) continue;
    for (let j = i + 1; j < lines.length && lines[j].indent > lines[i].indent; j++) {
      if (lines[j].name) { lines[i].name = lines[j].name; break; }
    }
  }
  return lines;
}

// A plain link to another document: opening its href reaches the same destination as the
// click without waiting on it, or on a hidden duplicate's failed click. Buttons and in-page
// (#hash) links are still clicked.
function opensByHref(action, currentUrl) {
  if (!action || action.op !== 'CLICK' || !/^https?:\/\//i.test(action.href || '')) return false;
  if (!/^(anchor|link)$/i.test(action.role || '')) return false;
  return destinationKey(action.href) !== destinationKey(currentUrl || '');
}

// Controls Jev may not act on by itself: money, deletion, sign-out. The caller decides.
function guardedAction(action) {
  const text = String(action && action.name || '');
  return /\b(buy|pay|purchase|checkout|check out|place order|delete|remove|unsubscribe|sign out|log out|logout|cancel subscription|transfer)\b|删除|支付|付款|购买|下单|退出登录|注销/i.test(text);
}

// OpenRouter names Jev "typesafe/jev-1.14"; TypeSafe's own API calls it "jev-1.14.0".
function typesafeModel(slug) {
  const name = String(slug || '').replace(/^typesafe\//, '');
  return /^jev-\d+\.\d+$/.test(name) ? name + '.0' : name;
}

function hrefPath(href) {
  // Origin is shared by most links on a page; scoring it makes every link match the site name.
  return String(href || '').replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
}

function destinationKey(href) {
  return String(href || '').replace(/#.*$/, '');
}

// options.successMatch: hrefs containing it always make the list (deterministic click).
// options.extraLinks: [{ name, href }] from the DOM, for links the accessibility snapshot omits
// (collapsed navigation); they have no ref and are opened by href.
function buildCandidates(content, goal, options = {}) {
  const successMatch = String(options.successMatch || '').toLowerCase();
  const tokens = new Set(goal.toLowerCase().split(/[^a-z0-9]+/).filter(
    token => token && !/^(the|and|for|open|page|this|that|with|from|into|find|guide|documentation)$/.test(token)
  ));
  const lines = parseSnapshot(content);
  const seen = new Set(lines.map(line => destinationKey(line.href)).filter(Boolean));
  for (const link of options.extraLinks || []) {
    if (!/^https?:\/\//i.test(link.href || '') || seen.has(destinationKey(link.href))) continue;
    seen.add(destinationKey(link.href));
    lines.push({ indent: 0, role: 'link', ref: '', href: link.href, loc: '',
      name: String(link.name || '').replace(/\s+/g, ' ').trim().slice(0, 80), raw: '' });
  }
  const ranked = [];
  for (const line of lines) {
    const isField = /^(textbox|searchbox|combobox)$/i.test(line.role);
    if (!isField && !/^(anchor|button|link|tab|menuitem)$/i.test(line.role)) continue;
    if (!line.ref && (isField || !/^https?:\/\//i.test(line.href))) continue;
    if (!isField && !line.name && line.href) {
      line.name = decodeURIComponent(hrefPath(destinationKey(line.href)).split('/').filter(Boolean).pop() || '')
        .replace(/[-_]+/g, ' ').replace(/\.html?$/i, '').trim();
    }
    if (!isField && !line.name) continue;
    if (/^(what|how|why|does|can|is|where|when)\b/i.test(line.name) && !line.href) continue;
    const words = new Set((line.name + ' ' + hrefPath(line.href)).toLowerCase().split(/[^a-z0-9]+/));
    let score = line.href ? 1 : 0;
    for (const token of tokens) if (words.has(token)) score += 2;
    if (successMatch && line.href && line.href.toLowerCase().includes(successMatch)) score += 100;
    ranked.push({
      score,
      action: {
        op: isField ? 'FILL' : 'CLICK', ref: line.ref,
        name: line.name || line.role, href: line.href, loc: line.loc, role: line.role,
      },
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  // One candidate per destination: duplicates ("Docs", "Docs", "Read the docs") split Jev's
  // probability below the confidence floor even when they all agree.
  const destinations = new Set();
  const unique = ranked.filter(({ action }) => {
    if (action.op !== 'CLICK' || !action.href) return true;
    const key = destinationKey(action.href);
    if (destinations.has(key)) return false;
    destinations.add(key);
    return true;
  });
  const counts = { CLICK: 0, FILL: 0 };
  const actions = unique.slice(0, 16).map(({ action }) => ({
    key: action.op.toLowerCase() + '_' + (++counts[action.op]), ...action,
  }));
  actions.push({ key: 'scroll_1', op: 'SCROLL_DOWN', name: 'scroll down' });
  actions.push({ key: 'escalate_1', op: 'ESCALATE', name: 'escalate to supervisor' });
  const byKey = {};
  for (const action of actions) byKey[action.key] = action;
  return { actions, byKey };
}

function describeAction(action) {
  if (action.op === 'SCROLL_DOWN') return 'SCROLL_DOWN';
  if (action.op === 'ESCALATE') return 'ESCALATE: no justified control';
  return action.op + ' ' + action.role + ' ' + JSON.stringify(action.name)
    + (action.href ? ' → ' + action.href : '');
}

function validateChoice(answer, allowedKeys) {
  const invalid = { ok: false, choice: null, confidence: 0 };
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return invalid;
  const { choice, confidence, probabilities } = answer;
  if (!allowedKeys.includes(choice)) return invalid;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return invalid;
  if (!probabilities || typeof probabilities !== 'object' || Array.isArray(probabilities)) return invalid;
  const keys = Object.keys(probabilities);
  if (keys.length !== allowedKeys.length || !keys.every(key => allowedKeys.includes(key))) return invalid;
  const values = keys.map(key => probabilities[key]);
  if (!values.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return invalid;
  const sum = values.reduce((total, value) => total + value, 0);
  // Compare endpoints directly so decimal sums of 0.98 and 1.02 remain inclusive.
  if (sum < 0.98 || sum > 1.02) return invalid;
  if (probabilities[choice] !== Math.max(...values)) return invalid;
  return { ok: true, choice, confidence };
}

function verifiedDone(page, successMatch) {
  if (!successMatch || !page) return false;
  return ((page.url || '') + ' ' + (page.title || '')).toLowerCase()
    .includes(successMatch.toLowerCase());
}

function hrefMatchesSuccess(href, successMatch) {
  if (!href || !successMatch) return false;
  return String(href).toLowerCase().includes(String(successMatch).toLowerCase());
}

function deterministicAction(packed, successMatch) {
  if (!packed || !packed.actions) return null;
  const hits = packed.actions.filter(action =>
    action.op === 'CLICK' && hrefMatchesSuccess(action.href, successMatch));
  return hits[0] || null;
}

// DuckDuckGo HTML results link through /l/?uddg=<target>; ad links are dropped.
function decodeSearchHref(href) {
  let url
  try { url = new URL(String(href || ''), 'https://duckduckgo.com') } catch { return null }
  if (/duckduckgo\.com$/i.test(url.hostname) && url.pathname === '/y.js') return null
  if (/bing\.com$/i.test(url.hostname) && /aclick/.test(url.pathname)) return null
  const target = url.searchParams.get('uddg')
  const out = target || url.href
  return /^https?:\/\//i.test(out) ? out : null
}

function searchResults(raw, limit) {
  const seen = new Set()
  const out = []
  for (const item of raw || []) {
    const url = decodeSearchHref(item.href)
    if (!url || seen.has(destinationKey(url))) continue
    seen.add(destinationKey(url))
    out.push({ title: String(item.title || '').replace(/\s+/g, ' ').trim().slice(0, 100), url,
      snippet: String(item.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 180) })
    if (out.length >= limit) break
  }
  return out
}

function searchCriteria(results) {
  const criteria = {}
  results.forEach((r, i) => {
    let host = ''
    try { host = new URL(r.url).hostname } catch {}
    criteria['r' + (i + 1)] = r.title + ' — ' + host + (r.snippet ? ' — ' + r.snippet : '')
  })
  return criteria
}

// Orders results by Jev's probabilities; null when the answer fails validation.
function rankResults(answer, results) {
  const keys = results.map((_, i) => 'r' + (i + 1))
  if (!validateChoice(answer, keys).ok) return null
  return keys.slice().sort((a, b) => answer.probabilities[b] - answer.probabilities[a])
    .map((key) => results[Number(key.slice(1)) - 1])
}

function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
    const k = e.toLowerCase()
    if (k[0] !== '#') return named[k]
    try { return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)) } catch { return m }
  })
}

function htmlText(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

// Title, h1-h3 and the start of main/article/body from raw HTML, for pages fetched without a browser.
function htmlDigest(html) {
  const clean = String(html || '').slice(0, 3000000).replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
  const title = htmlText((clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).slice(0, 120)
  const headings = [...clean.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => htmlText(m[1]).slice(0, 80)).filter(Boolean).slice(0, 12)
  const body = (clean.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || clean.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)
    || clean.match(/<body\b[^>]*>([\s\S]*)/i) || [null, clean])[1]
  return { title, headings, text: htmlText(body).slice(0, 600) }
}

// A fetched page is usable when it has real text; script-rendered shells and bot walls go to the browser.
function digestUsable(digest) {
  return Boolean(digest && digest.text && digest.text.length >= 200 && (digest.title || digest.headings.length))
}

// --- Visual references (SHOTS=1). Pure decisions here; capture.js gathers page facts and applies them. ---

// URLS="a b c": http(s) only, deduplicated by destination, at most 6.
function parseUrlList(value) {
  const seen = new Set()
  const out = []
  for (const part of String(value || '').split(/[\s,]+/)) {
    if (!/^https?:\/\//i.test(part)) continue
    let url
    try { url = new URL(part).href } catch { continue }
    if (seen.has(destinationKey(url))) continue
    seen.add(destinationKey(url))
    out.push(url)
    if (out.length >= 6) break
  }
  return out
}

// Desktop 1280x800 and mobile 390x844 at DPR 1: under the vision long-edge cap, so nothing is downscaled.
// SHOT_HEIGHT captures more of the page (bounded at 2400 px); the default is one screen.
function shotPlan(args) {
  const view = ['desktop', 'mobile', 'both'].includes(args.shotView) ? args.shotView : 'desktop'
  const asked = Number(args.shotHeight) || 0
  const views = []
  if (view !== 'mobile') views.push({ name: 'desktop', width: 1280, height: 800, mobile: false })
  if (view !== 'desktop') views.push({ name: 'mobile', width: 390, height: 844, mobile: true })
  for (const v of views) v.clipHeight = Math.max(v.height, Math.min(2400, asked || v.height))
  return { views, scheme: ['light', 'dark'].includes(args.shotScheme) ? args.shotScheme : '', quality: 70,
    sheet: args.sheet !== false }
}

// Default visual deadline: 12 s for up to 3 pages (3 capture tabs run at once), 8 s more per further batch of 3, and
// x1.5 when SHOT_HEIGHT asks for more than one screen. An explicit BUDGET_MS wins.
function visualBudget(pages, plan) {
  const batches = Math.max(1, Math.ceil(pages / 3))
  const tall = plan.views.some((v) => v.clipHeight > v.height)
  return Math.round((12000 + 8000 * (batches - 1)) * (tall ? 1.5 : 1))
}

// Approximate vision tokens: images over 1568 px on the long edge or 1.15 MP are scaled down first, then w*h/750.
function imageTokens(width, height) {
  const scale = Math.min(1, 1568 / Math.max(width, height), Math.sqrt(1150000 / (width * height)))
  return Math.ceil((width * scale) * (height * scale) / 750)
}

const CONSENT_WORDS = /cookie|consent|gdpr|ccpa|onetrust|cookiebot|usercentrics|didomi|truste|quantcast|sp_message|\bcmp\b|privacy (choices|preferences|settings|center)|we use cookies|we value your privacy/i

// Overlays to hide with CSS before a capture (nothing is clicked or accepted): consent banners, modal dialogs, and
// the scrims behind them. A fixed nav or header with ordinary links stays.
function overlayHideList(facts) {
  const hide = new Set()
  let blocking = false
  for (const f of facts || []) {
    const floating = f.position === 'fixed' || f.position === 'sticky'
    const dialog = f.role === 'dialog' || f.role === 'alertdialog' || f.ariaModal || f.tag === 'dialog'
    const attrHit = CONSENT_WORDS.test([f.id, f.cls, f.label, f.src].join(' '))
    const textHit = CONSENT_WORDS.test(f.text || '') && (f.textLength || 0) <= 2000 && (f.area <= 0.6 || dialog)
    const shell = f.area >= 0.9 && (f.textLength || 0) > 3000
    if ((floating || dialog) && (attrHit || textHit) && !shell) { hide.add(f.i); blocking = true; continue }
    if (dialog && floating && f.area >= 0.15 && !shell) { hide.add(f.i); blocking = true }
  }
  if (blocking) {
    for (const f of facts) if (f.position === 'fixed' && (f.textLength || 0) < 5 && f.area >= 0.5) hide.add(f.i)
  }
  return [...hide]
}

const BOT_WORDS = /just a moment|attention required|verify you are (a )?human|are you a robot|captcha|access denied|unusual traffic|checking your browser/i

// Why a capture is not worth a reviewer's look, or null. bytes/pixels catches near-uniform (blank) JPEGs.
function pageProblem(f) {
  const head = (f.title || '') + ' ' + String(f.text || '').slice(0, 500)
  if (f.gotoError && !f.title && (f.textLength || 0) < 20) return 'did not load: ' + f.gotoError
  if (BOT_WORDS.test(head)) return 'bot check'
  if (f.hasPassword && (f.textLength || 0) < 1500 && /sign in|log in|login|password/i.test(head)) return 'login wall'
  if (f.bytes && f.width && f.height && f.bytes / (f.width * f.height) < 0.012) return 'blank capture'
  if ((f.textLength || 0) < 20 && !f.images) return 'blank page'
  return null
}

// 'dark' or 'light' from a computed background color (rgb, lab/lch, oklab/oklch, color(srgb ...)), by CIE lightness;
// null when mostly transparent (alpha < 0.5) or unparsable.
function schemeFromColor(css) {
  const fn = String(css || '').trim().toLowerCase().match(/^([a-z-]+)\((.*)\)$/)
  if (!fn) return null
  const [name, body] = [fn[1], fn[2]]
  const parts = body.split('/')[0].split(/[\s,]+/).filter(Boolean)
  const num = (x, scale) => (String(x).endsWith('%') ? parseFloat(x) / 100 * scale : parseFloat(x))
  const alpha = body.includes('/') ? body.split('/').pop().trim() : /^(rgba|hsla)$/.test(name) ? parts[3] : undefined
  if (alpha !== undefined && num(alpha, 1) < 0.5) return null
  const fromRgb = (r, g, b) => {
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
  }
  let lightness
  if (name === 'rgb' || name === 'rgba') lightness = fromRgb(...parts.slice(0, 3).map((x) => num(x, 255) / 255))
  else if (name === 'lab' || name === 'lch') lightness = num(parts[0], 100)
  else if (name === 'oklab' || name === 'oklch') lightness = num(parts[0], 1) * 100
  else if (name === 'color' && /^(srgb|display-p3)$/.test(parts[0])) lightness = fromRgb(...parts.slice(1, 4).map((x) => num(x, 1)))
  if (!Number.isFinite(lightness)) return null
  return lightness < 50 ? 'dark' : 'light'
}

// Contact sheet grid: the fewest columns that keep the sheet within maxHeight, tiles cropped to the shot aspect.
// Tiles are never wider than the source capture (no upscaling).
function sheetLayout(n, aspect, sourceWidth, maxWidth = 1568, maxHeight = 1000) {
  const gap = 8
  const label = 28
  let best
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols)
    const tileWidth = Math.min(sourceWidth || maxWidth, Math.floor((maxWidth - gap * (cols + 1)) / cols))
    const tileHeight = Math.round(tileWidth * aspect)
    best = { cols, rows, tileWidth, tileHeight, label, gap, width: cols * tileWidth + gap * (cols + 1),
      height: rows * (tileHeight + label + gap) + gap }
    if (best.height <= maxHeight) break
  }
  return best
}

// Text a coordinating agent can paste into a reviewer brief: paths and one line per page, never image data.
function shotBrief(pages, sheet) {
  const lines = []
  if (sheet) lines.push('Contact sheet (triage of color and layout only; open the full captures for type): ' + sheet.path)
  for (const p of pages) {
    if (p.problem) { lines.push('skipped #' + p.rank + ' ' + p.url + ' (' + p.problem + ')'); continue }
    const shots = (p.shots || []).map((s) => s.view + ' ' + s.path).join(', ')
    lines.push('#' + p.rank + ' ' + String(p.title || '').replace(/\s+/g, ' ').slice(0, 70) + ' | ' + p.url + ' | ' + shots
      + (p.scheme ? ' | ' + p.scheme : ''))
  }
  return lines.join('\n')
}

// Shared by loop.js and search.js. ARGS_PATH, RESULT_PATH and fs come from the script preamble.
function emit(result) {
  const text = JSON.stringify(result, null, 2)
  fs.writeFileSync(RESULT_PATH, text + '\n', { mode: 0o600 })
  console.log(text)
}

function readArgs() {
  const parsed = JSON.parse(fs.readFileSync(ARGS_PATH, 'utf8'))
  try { fs.unlinkSync(ARGS_PATH) } catch {}
  return parsed
}

// TypeSafe first (lower latency); JEV_PROVIDER=openrouter forces OpenRouter when both keys exist.
function jevAuth(args) {
  if (args.typesafeKey && args.provider !== 'openrouter') {
    return {
      provider: 'typesafe',
      url: 'https://api.typesafe.ai/v1/systemone',
      headers: {
        Authorization: 'Bearer ' + args.typesafeKey,
        'Content-Type': 'application/json',
      },
    }
  }
  if (args.openrouterKey) {
    return {
      provider: 'openrouter',
      url: 'https://openrouter.ai/api/alpha/decisions',
      headers: {
        Authorization: 'Bearer ' + args.openrouterKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/raydocs/egolite-jev',
        'X-Title': 'egolite-jev',
      },
    }
  }
  return null
}

// Opens the TCP+TLS connection to the Jev endpoint while the page loads, so the first Jev
// call reuses it (first call ~140 ms -> ~65 ms, 2026-11-11). Sends no key and no payload:
// the endpoint answers 403 with keep-alive and runs no inference. HEAD gets 405 + close.
function preconnect(auth) {
  if (!auth) return
  fetch(auth.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then((res) => res.arrayBuffer()).catch(() => {})
}

async function postJson(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 400))
  return JSON.parse(text)
}
