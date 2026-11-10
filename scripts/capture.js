// Visual capture for scripts/search (SHOTS=1). Runs inside ego-browser nodejs after lib.js; decisions live in lib.js.

// Emulated viewport and color scheme are set before navigation so the first layout is already the target one.
async function setView(tab, view, scheme) {
  await tab.cdp('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: 1, mobile: view.mobile })
  await tab.cdp('Emulation.setTouchEmulationEnabled', { enabled: view.mobile, maxTouchPoints: view.mobile ? 5 : 0 }).catch(() => {})
  // Only the mobile view changes the UA (sites pick phone layouts by it); desktop keeps the browser's own.
  if (view.mobile) {
    await tab.cdp('Emulation.setUserAgentOverride', { userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }).catch(() => {})
  }
  if (scheme) await tab.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }).catch(() => {})
}

// Bounded settle: web fonts, images inside the capture area (lazy ones are scrolled into range), finite animations
// finished so entrance effects show their end state. Returns early when ms runs out; the shot is taken regardless.
const SETTLE_IN_PAGE = async (opts) => {
  const end = performance.now() + opts.ms
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
  const until = (promise) => Promise.race([promise, sleep(end - performance.now())])
  if (document.fonts) await until(document.fonts.ready)
  if (opts.height > innerHeight) {
    for (let y = 0; y < opts.height && performance.now() < end; y += Math.round(innerHeight * 0.8)) { scrollTo(0, y); await sleep(120) }
    scrollTo(0, 0)
  }
  const images = [...document.images].filter((img) => {
    const box = img.getBoundingClientRect()
    return box.width > 0 && box.top < opts.height && box.bottom > 0 && !img.complete
  })
  await until(Promise.all(images.map((img) => img.decode().catch(() => null))))
  for (const animation of document.getAnimations()) {
    try {
      const timing = animation.effect && animation.effect.getComputedTiming()
      if (timing && Number.isFinite(timing.endTime)) animation.finish()
    } catch {}
  }
  await sleep(Math.min(250, end - performance.now()))
}

// Fixed/sticky and dialog elements, including those inside open shadow roots (consent widgets often live there); a
// shadow-root hit is marked on its top-level host, which is what gets hidden.
const OVERLAY_FACTS_IN_PAGE = () => {
  const vw = innerWidth
  const vh = innerHeight
  const out = []
  const stack = document.body ? [...document.body.children].reverse() : []
  while (stack.length && out.length < 200) {
    const el = stack.pop()
    if (el.shadowRoot) stack.push(...[...el.shadowRoot.children].reverse())
    stack.push(...[...el.children].reverse())
    const role = el.getAttribute('role') || ''
    const ariaModal = el.getAttribute('aria-modal') === 'true'
    const tag = el.tagName.toLowerCase()
    const style = getComputedStyle(el)
    if (style.position !== 'fixed' && style.position !== 'sticky' && !ariaModal && role !== 'dialog' && tag !== 'dialog') continue
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const box = el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) continue
    let target = el
    while (target.getRootNode() !== document && target.getRootNode().host) target = target.getRootNode().host
    if (target.hasAttribute('data-egolite-overlay')) continue
    const visible = Math.max(0, Math.min(box.right, vw) - Math.max(box.left, 0)) * Math.max(0, Math.min(box.bottom, vh) - Math.max(box.top, 0))
    const text = ((el.innerText || el.textContent || '') + (el.shadowRoot ? ' ' + el.shadowRoot.textContent : '')).replace(/\s+/g, ' ')
    const hostAttrs = target === el ? '' : ' ' + target.tagName.toLowerCase() + ' ' + (target.id || '') + ' ' + String(typeof target.className === 'string' ? target.className : '')
    target.setAttribute('data-egolite-overlay', String(out.length))
    out.push({ i: out.length, tag, id: el.id || '', cls: (String(typeof el.className === 'string' ? el.className : '') + hostAttrs).slice(0, 200),
      role, ariaModal, label: el.getAttribute('aria-label') || '', src: tag === 'iframe' ? String(el.src || '').slice(0, 200) : '',
      text: text.slice(0, 300), textLength: text.length, position: style.position, area: visible / (vw * vh) })
  }
  return out
}

const HIDE_IN_PAGE = (indexes) => {
  for (const i of indexes) {
    const el = document.querySelector('[data-egolite-overlay="' + i + '"]')
    if (el) el.style.setProperty('display', 'none', 'important')
  }
  if (indexes.length) {
    for (const el of [document.documentElement, document.body]) {
      if (el && getComputedStyle(el).overflow === 'hidden') el.style.setProperty('overflow', 'visible', 'important')
    }
  }
}

const PAGE_FACTS_IN_PAGE = () => {
  const text = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ')
  const main = (document.querySelector('main,article') || document.body || { innerText: '' }).innerText.replace(/\s+/g, ' ')
  // Colors behind what the viewer sees: walk up from a few viewport points; lib's schemeFromColor picks the first opaque one.
  const backgrounds = []
  for (const [x, y] of [[0.5, 0.5], [0.5, 0.25], [0.1, 0.5]]) {
    for (let el = document.elementFromPoint(innerWidth * x, innerHeight * y); el; el = el.parentElement) {
      const color = getComputedStyle(el).backgroundColor
      if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') backgrounds.push(color)
    }
  }
  return { title: document.title.slice(0, 120), text: text.slice(0, 600), line: main.slice(0, 160), textLength: text.length,
    hasPassword: Boolean(document.querySelector('input[type=password]')), images: document.images.length, backgrounds: backgrounds.slice(0, 12),
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches }
}

async function captureJpeg(tab, view, quality, path) {
  const fs = await import('node:fs')
  const params = { format: 'jpeg', quality }
  if (view.clipHeight > view.height) {
    params.captureBeyondViewport = true
    params.clip = { x: 0, y: 0, width: view.width, height: view.clipHeight, scale: 1 }
  }
  const shot = await tab.cdp('Page.captureScreenshot', params)
  const buffer = Buffer.from(shot.data, 'base64')
  fs.writeFileSync(path, buffer)
  return { view: view.name, path, width: view.width, height: view.clipHeight, kb: Math.round(buffer.length / 1024),
    approx_tokens: imageTokens(view.width, view.clipHeight), bytes: buffer.length }
}

// One reference page: each view is loaded, settled, cleared of consent overlays and captured, even when the deadline
// is near (a late page still yields a shot). Failure reasons come from pageProblem.
function newReference(rank, url) {
  return { rank, url, shots: [], hidden_overlays: 0, timing: { goto_ms: 0, settle_ms: 0, shot_ms: 0 } }
}

// The caller owns result, so a page cut off by the hard stop still reports the shots it already took.
async function captureReference(tab, result, plan, deadline, dir) {
  const { rank, url } = result
  const left = () => deadline - Date.now()
  const host = (() => { try { return new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '') } catch { return 'page' } })()
  let gotoError = ''
  for (const [n, view] of plan.views.entries()) {
    let t = Date.now()
    try {
      await setView(tab, view, plan.scheme)
      await tab.goto(url, { timeout: Math.max(1500, left() - 1500), waitUntil: 'domcontentloaded' })
    } catch (err) {
      gotoError = String(err && err.message || err).slice(0, 100)
    }
    result.timing.goto_ms += Date.now() - t
    t = Date.now()
    try {
      await tab.evaluate(SETTLE_IN_PAGE, { ms: Math.max(300, Math.min(2500, left() - 1000)), height: view.clipHeight })
      const hide = overlayHideList(await tab.evaluate(OVERLAY_FACTS_IN_PAGE))
      if (hide.length) await tab.evaluate(HIDE_IN_PAGE, hide)
      result.hidden_overlays += hide.length
    } catch {}
    result.timing.settle_ms += Date.now() - t
    t = Date.now()
    try {
      result.shots.push(await captureJpeg(tab, view, plan.quality, dir + '/' + rank + '-' + host + '-' + view.name + '.jpg'))
    } catch (err) {
      gotoError = gotoError || 'capture failed: ' + String(err && err.message || err).slice(0, 80)
    }
    result.timing.shot_ms += Date.now() - t
    if (n === 0) {
      const facts = await tab.evaluate(PAGE_FACTS_IN_PAGE).catch(() => ({}))
      Object.assign(result, { title: facts.title || '', line: facts.line || '',
        scheme: (facts.backgrounds || []).map(schemeFromColor).find(Boolean) || (facts.title ? 'light' : null) })
      const first = result.shots[0] || {}
      result.problem = pageProblem({ ...facts, gotoError, bytes: first.bytes, width: first.width, height: first.height })
        || (result.shots.length ? null : gotoError || 'no capture')
    }
  }
  return finishReference(result)
}

// A late page is copied so shots that land after the hard stop cannot change what was reported.
function finishReference(result, late) {
  if (late) result = { ...result, shots: result.shots.map((shot) => ({ ...shot })), timing: { ...result.timing } }
  for (const shot of result.shots) delete shot.bytes
  if (late && !result.shots.length) result.problem = 'timeout: no capture'
  if (late) result.late = true
  result.screenshot = result.shots.length ? result.shots[0].path : undefined
  return result
}

// One JPEG grid of the usable captures, labelled "#rank host" (labels set with textContent; page titles are not used).
async function contactSheet(tab, refs, plan, path) {
  const fs = await import('node:fs')
  const view = plan.views[0]
  const items = refs.filter((r) => !r.problem && r.shots[0]).map((r) => ({ rank: r.rank, path: r.shots[0].path,
    label: '#' + r.rank + ' ' + (() => { try { return new URL(r.url).hostname.replace(/^www\./, '') } catch { return '' } })() }))
  if (items.length < 2) return null
  const layout = sheetLayout(items.length, view.height / view.width, view.width)
  const tiles = items.map((item) => ({ label: item.label, src: 'data:image/jpeg;base64,' + fs.readFileSync(item.path).toString('base64') }))
  await tab.cdp('Emulation.setDeviceMetricsOverride', { width: layout.width, height: layout.height, deviceScaleFactor: 1, mobile: false })
  await tab.goto('about:blank', { timeout: 3000 }).catch(() => {})
  await tab.evaluate(async ({ tiles, layout }) => {
    document.body.style.cssText = 'margin:0;background:#e9e9ec;font:600 15px -apple-system,system-ui,sans-serif;color:#111'
    document.body.textContent = ''
    await Promise.all(tiles.map((tile, i) => {
      const x = layout.gap + (i % layout.cols) * (layout.tileWidth + layout.gap)
      const y = layout.gap + Math.floor(i / layout.cols) * (layout.tileHeight + layout.label + layout.gap)
      const label = document.createElement('div')
      label.textContent = tile.label
      label.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;height:' + layout.label + 'px;line-height:' + layout.label + 'px'
      const img = document.createElement('img')
      img.src = tile.src
      img.style.cssText = 'position:absolute;left:' + x + 'px;top:' + (y + layout.label) + 'px;width:' + layout.tileWidth + 'px;height:'
        + layout.tileHeight + 'px;object-fit:cover;object-position:top;border-radius:6px;background:#fff'
      document.body.append(label, img)
      return img.decode().catch(() => null)
    }))
  }, { tiles, layout })
  const shot = await tab.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80 })
  fs.writeFileSync(path, Buffer.from(shot.data, 'base64'))
  return { path, width: layout.width, height: layout.height, approx_tokens: imageTokens(layout.width, layout.height),
    items: items.map((item) => ({ label: item.label, path: item.path })) }
}
