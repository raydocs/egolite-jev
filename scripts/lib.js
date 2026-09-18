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
  for (let i = 0; i < lines.length; i++) {
    const child = lines[i + 1];
    if (!lines[i].name && child && child.indent > lines[i].indent && child.role === 'text') {
      lines[i].name = child.name;
    }
  }
  return lines;
}

function buildCandidates(content, goal) {
  const tokens = new Set(goal.toLowerCase().split(/[^a-z0-9]+/).filter(
    token => token && !/^(the|and|for|open|page|this|that|with|from|into)$/.test(token)
  ));
  const ranked = [];
  for (const line of parseSnapshot(content)) {
    const isField = /^(textbox|searchbox|combobox)$/i.test(line.role);
    if (!line.ref || (!isField && !/^(anchor|button|link|tab|menuitem)$/i.test(line.role))) continue;
    if (!isField && !line.name) continue;
    if (/^(what|how|why|does|can|is|where|when)\b/i.test(line.name) && !line.href) continue;
    const words = new Set((line.name + ' ' + line.href).toLowerCase().split(/[^a-z0-9]+/));
    let score = line.href ? 1 : 0;
    for (const token of tokens) if (words.has(token)) score += 2;
    ranked.push({
      score,
      action: {
        op: isField ? 'FILL' : 'CLICK', ref: line.ref,
        name: line.name || line.role, href: line.href, loc: line.loc, role: line.role,
      },
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  const counts = { CLICK: 0, FILL: 0 };
  const actions = ranked.slice(0, 16).map(({ action }) => ({
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
