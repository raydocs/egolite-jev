const ARGS = JSON.parse(fs.readFileSync(ARGS_PATH, 'utf8'))
try { fs.unlinkSync(ARGS_PATH) } catch {}
const GOAL = ARGS.goal
const START_URL = ARGS.url
const SPACE = ARGS.space
const SUCCESS_MATCH = ARGS.successMatch
const MODE = ARGS.mode === 'before' ? 'before' : 'after'
const RECORD_DIR = ARGS.recordDir
const KEY = ARGS.openrouterKey
fs.mkdirSync(RECORD_DIR, { recursive: true })
const startedAt = Date.now()
let shotN = 0
const log = []

const task = await useOrCreateTaskSpace(SPACE)
if (START_URL) await openOrReuseTab(START_URL, { wait: true, timeout: 20 })
await shot('open')

let stop = 'budget_exhausted'
for (let step = 1; step <= 4; step++) {
  await adoptSuccess()
  const page = await pageInfo()
  if (verifiedDone(page, SUCCESS_MATCH)) {
    stop = 'done'
    await shot('done')
    break
  }
  const snap = await snapshot()
  const packed = buildCandidates(String(snap.content || ''), GOAL)
  const picked = MODE === 'before'
    ? await llmPick(await snapshotText(), packed)
    : await jevPick(page, packed)
  log.push({ step, mode: MODE, ...picked, url: page.url })
  await shot('decide-' + (picked.key || 'none'))
  if (!picked.ok || picked.key === 'escalate_1') {
    stop = 'need_llm'
    break
  }
  const action = packed.byKey[picked.key]
  if (!action || action.op !== 'CLICK') {
    stop = 'need_llm'
    break
  }
  const beforeTabs = new Set((await listTabs().catch(() => [])).map((t) => t.targetId))
  await click('@' + action.ref, { label: action.name })
  await settle(beforeTabs, page.url)
  await shot('click')
}

const finalPage = await pageInfo().catch(() => ({}))
if (verifiedDone(finalPage, SUCCESS_MATCH)) stop = 'done'
const result = {
  ok: stop === 'done',
  reason: stop,
  mode: MODE,
  goal: GOAL,
  elapsed_ms: Date.now() - startedAt,
  decide_ms: log.reduce((s, x) => s + (x.ms || 0), 0),
  page: { url: finalPage.url, title: finalPage.title },
  steps: log,
}
fs.writeFileSync(RECORD_DIR + '/result.json', JSON.stringify(result, null, 2))
cliLog(JSON.stringify(result, null, 2))

async function shot(tag) {
  shotN += 1
  if (!RECORD_DIR || /unused/i.test(RECORD_DIR)) return
  try {
    const src = await captureScreenshot()
    if (src && fs.existsSync(src)) {
      const dest = RECORD_DIR + '/' + String(shotN).padStart(2, '0') + '-' + tag + '.png'
      fs.copyFileSync(src, dest)
    }
  } catch {}
}

async function llmPick(text, packed) {
  const t0 = Date.now()
  const json = await post('https://openrouter.ai/api/v1/chat/completions', {
    model: 'openai/gpt-4o-mini',
    temperature: 0,
    max_tokens: 120,
    messages: [
      { role: 'system', content: 'Pick the next click from the snapshot. JSON only {"name":"Docs"} matching a visible control name.' },
      { role: 'user', content: 'Goal: ' + GOAL + '\nSnapshot:\n' + String(text).slice(0, 24000) },
    ],
  })
  let name = ''
  try {
    const raw = json.choices[0].message.content
    const m = String(raw).match(/\{[\s\S]*\}/)
    name = String(JSON.parse(m ? m[0] : raw).name || '')
  } catch {}
  const hit = packed.actions.find((a) => a.op === 'CLICK' && a.name.toLowerCase() === name.toLowerCase())
    || packed.actions.find((a) => a.op === 'CLICK' && name && a.name.toLowerCase().includes(name.toLowerCase()))
  return {
    ok: Boolean(hit),
    key: hit ? hit.key : 'escalate_1',
    ms: Date.now() - t0,
    cost: json.usage && json.usage.cost,
    via: 'llm-snapshot',
  }
}

async function jevPick(page, packed) {
  const criteria = {}
  for (const a of packed.actions) criteria[a.key] = describeAction(a)
  const t0 = Date.now()
  const json = await post('https://openrouter.ai/api/alpha/decisions', {
    model: 'typesafe/jev-1.14',
    state: { subgoal: GOAL, page: { url: page.url, title: page.title } },
    questions: {
      next_action: {
        type: 'choice',
        instructions: 'Choose one complete action that advances `subgoal`. Prefer a navigation link matching the subgoal.',
        criteria,
      },
    },
  })
  const checked = validateChoice(json.answers && json.answers.next_action, packed.actions.map((a) => a.key))
  return {
    ok: checked.ok,
    key: checked.choice,
    ms: Date.now() - t0,
    cost: json.usage && json.usage.cost,
    via: 'jev',
  }
}

async function adoptSuccess() {
  const tabs = await listTabs().catch(() => [])
  const hit = tabs.find((t) => verifiedDone({ url: t.url, title: t.title }, SUCCESS_MATCH))
  if (!hit) return false
  await switchTab(hit.targetId)
  return true
}

async function settle(beforeTabs, prevUrl) {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    if (await adoptSuccess()) return
    const tabs = await listTabs().catch(() => [])
    const fresh = tabs.find((t) => t.targetId && !beforeTabs.has(t.targetId))
    if (fresh) await switchTab(fresh.targetId)
    const info = await pageInfo().catch(() => ({}))
    if (verifiedDone(info, SUCCESS_MATCH)) return
    if (info.url && prevUrl && info.url !== prevUrl) return
    await wait(0.1)
  }
  await adoptSuccess()
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/egolite-jev',
      'X-Title': 'eva-x-record',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + text.slice(0, 300))
  return JSON.parse(text)
}
