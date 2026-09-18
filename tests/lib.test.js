const assert = require('node:assert/strict');
const { test } = require('node:test');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const path = join(__dirname, '../scripts/lib.js');
const source = existsSync(path) ? readFileSync(path, 'utf8') : '';
const lib = vm.createContext({});
vm.runInContext(source, lib);

function call(name, ...args) {
  assert.equal(typeof lib[name], 'function', `${name} must be a global function declaration`);
  return lib[name](...args);
}

const homepage = readFileSync(join(__dirname, 'fixtures/homepage.txt'), 'utf8');

test('parses snapshot metadata and indented child text without borrowing sibling text', () => {
  const lines = call('parseSnapshot', 'main [ref=1]\n  link [ref=82, url=https://lite.ego.app/document/start, loc=href:/document/start]\n    text "Docs"\n  button [ref=9]\n  text "Sibling"\n  textbox [ref=10, name="Email, work", loc=css:#email]');
  assert.deepEqual(JSON.parse(JSON.stringify(lines[1])), {
    indent: 2, role: 'link', ref: '82', href: 'https://lite.ego.app/document/start',
    loc: 'href:/document/start', name: 'Docs',
    raw: '  link [ref=82, url=https://lite.ego.app/document/start, loc=href:/document/start]',
  });
  assert.equal(lines.find(line => line.ref === '9').name, '');
  assert.equal(lines.find(line => line.ref === '10').name, 'Email, work');
  assert.equal(call('parseSnapshot', '').length, 0);
});

test('ranks Docs first and excludes FAQ buttons from homepage fixture', () => {
  const { actions, byKey } = call('buildCandidates', homepage, 'Open the Docs page');
  assert.equal(actions[0].key, 'click_1');
  assert.equal(actions[0].name, 'Docs');
  assert.equal(actions[0].ref, '82');
  assert.equal(actions.some(action => /^(what|how|why|does|can|is|where|when)\b/i.test(action.name)), false);
  for (const action of actions) assert.equal(byKey[action.key], action);
});

test('keeps FAQ links and unnamed fields but drops unnamed non-fields and non-controls', () => {
  const { actions } = call('buildCandidates', [
    'button [ref=1]', 'textbox [ref=2]', 'searchbox [ref=3, name="Search"]',
    'combobox [ref=4, name="Country"]', 'heading [ref=5, name="Docs"]',
    'link [ref=6, name="How it works", loc=href:https://example.com/how]',
    'button [ref=7, name="X"]',
  ].join('\n'), 'Country');
  assert.equal(actions[0].ref, '4');
  assert.deepEqual(Array.from(actions.filter(a => a.op === 'FILL'), a => a.ref).sort(), ['2', '3', '4']);
  assert.deepEqual(Array.from(actions.filter(a => a.op === 'CLICK'), a => a.ref).sort(), ['6', '7']);
  assert.equal(actions.find(a => a.ref === '6').href, 'https://example.com/how');
});

test('caps ranked controls at 16 with unique opaque keys and terminal actions', () => {
  const content = Array.from({ length: 20 }, (_, i) => `button [ref=${900 + i}, name="Item ${i}"]`).join('\n');
  const { actions, byKey } = call('buildCandidates', content, 'Item 19');
  assert.equal(actions.length, 18);
  assert.equal(actions[0].name, 'Item 19');
  assert.equal(Object.keys(byKey).length, 18);
  assert.deepEqual(Array.from(actions.slice(-2), a => [a.key, a.op]), [['scroll_1', 'SCROLL_DOWN'], ['escalate_1', 'ESCALATE']]);
  assert.ok(actions.every(a => /^(click|fill|scroll|escalate)_\d+$/.test(a.key)));
  assert.deepEqual(Array.from(call('buildCandidates', '', '').actions, a => a.op), ['SCROLL_DOWN', 'ESCALATE']);
});

test('describes actions without exposing internal refs or locators', () => {
  assert.equal(call('describeAction', { op: 'CLICK', role: 'link', name: 'Docs', href: 'https://lite.ego.app/document/', ref: '823', loc: 'backendNodeId:987' }), 'CLICK link "Docs" → https://lite.ego.app/document/');
  assert.equal(call('describeAction', { op: 'FILL', role: 'textbox', name: 'Email' }), 'FILL textbox "Email"');
  for (const op of ['SCROLL_DOWN', 'ESCALATE']) assert.ok(call('describeAction', { op, name: 'fallback' }).startsWith(op));
});

test('validates exact probability keys, maximum choice, numeric bounds and confidence', () => {
  const keys = ['click_1', 'scroll_1', 'escalate_1'];
  const valid = { choice: 'click_1', confidence: 0.8, probabilities: { click_1: 0.7, scroll_1: 0.2, escalate_1: 0.1 } };
  const result = call('validateChoice', valid, keys);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, choice: 'click_1', confidence: 0.8 });
  for (const answer of [
    null, {}, { ...valid, choice: 'DONE' }, { ...valid, choice: 'scroll_1' },
    ...[NaN, Infinity, -0.1, 1.1, '0.8', undefined].map(confidence => ({ ...valid, confidence })),
    ...[
      { click_1: 0.8, scroll_1: 0.2 },
      { ...valid.probabilities, extra: 0 },
      { click_1: 0.7, scroll_1: 0.2, wrong: 0.1 },
      { click_1: 1.1, scroll_1: -0.1, escalate_1: 0 },
      { click_1: '0.7', scroll_1: 0.2, escalate_1: 0.1 },
      { click_1: NaN, scroll_1: 0.2, escalate_1: 0.1 },
      { click_1: Infinity, scroll_1: 0.2, escalate_1: 0.1 },
      { click_1: 0.6, scroll_1: 0.2, escalate_1: 0.1 },
    ].map(probabilities => ({ ...valid, probabilities })),
  ]) assert.equal(call('validateChoice', answer, keys).ok, false);
});

test('accepts ties and inclusive probability sum tolerance but rejects outside it', () => {
  for (const probability of [0.98, 1]) {
    assert.equal(call('validateChoice', { choice: 'click_1', confidence: 0, probabilities: { click_1: probability } }, ['click_1']).ok, true);
  }
  for (const remainder of [0.48, 0.5, 0.52]) {
    assert.equal(call('validateChoice', { choice: 'scroll_1', confidence: 1, probabilities: { click_1: remainder, scroll_1: 0.5 } }, ['click_1', 'scroll_1']).ok, remainder <= 0.5);
  }
  for (const remainder of [0.38, 0.42, 0.379, 0.421]) {
    assert.equal(call('validateChoice', { choice: 'click_1', confidence: 1, probabilities: { click_1: 0.6, scroll_1: remainder } }, ['click_1', 'scroll_1']).ok, remainder === 0.38 || remainder === 0.42);
  }
});

test('verifies completion only from case-insensitive URL or title substring', () => {
  assert.equal(call('verifiedDone', { url: 'https://lite.ego.app/DOCUMENT/start', title: 'Home' }, '/document'), true);
  assert.equal(call('verifiedDone', { url: 'https://example.com', title: 'Documentation' }, 'DOCS'), false);
  assert.equal(call('verifiedDone', { url: '', title: 'Docs — Ego' }, 'DOCS'), true);
  assert.equal(call('verifiedDone', { url: '/document', title: 'Docs' }, ''), false);
  assert.equal(call('verifiedDone', { url: '/', title: 'Home', choice: 'DONE' }, '/document'), false);
});

test('deterministicAction takes the top ranked click whose href matches success', () => {
  const packed = call('buildCandidates', homepage, 'Open the Docs page');
  const hit = call('deterministicAction', packed, '/document');
  assert.equal(hit && hit.name, 'Docs');
  assert.equal(call('deterministicAction', packed, '/nope'), null);
  assert.equal(call('hrefMatchesSuccess', 'https://lite.ego.app/DOCUMENT/x', '/document'), true);
});
