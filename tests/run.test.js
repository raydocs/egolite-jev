const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

// Fake `ego-browser nodejs`: runs a shell check, prints browser noise, and writes the
// result file named in the piped script, as the real runtime does with loop.js.
function fakeBrowser(check) {
  return `#!/bin/sh
${check}
result="$(sed -n 's/^const RESULT_PATH = "\\(.*\\)"$/\\1/p')"
echo 'browser log line'
printf '{"ok": true, "reason": "done"}\\n' > "$result"
`;
}

test('runner prints only the result JSON on stdout even when the browser logs', () => {
  const home = mkdtempSync(join(tmpdir(), 'jev-stdout-test-'));
  try {
    mkdirSync(join(home, 'bin'));
    writeFileSync(join(home, 'bin/ego-browser'), fakeBrowser('true'), { mode: 0o700 });
    const result = spawnSync('bash', [join(__dirname, '../scripts/run')], {
      env: { ...process.env, HOME: home, TMPDIR: home, PATH: `${home}/bin:${process.env.PATH}`,
        GOAL: 'Public navigation test', SUCCESS_MATCH: '/document', OPENROUTER_API_KEY: 'test-key' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ok: true, reason: 'done' });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('runner survives a leftover temp file from an earlier run', () => {
  const home = mkdtempSync(join(tmpdir(), 'jev-tmp-test-'));
  try {
    mkdirSync(join(home, 'bin'));
    writeFileSync(join(home, 'bin/ego-browser'), fakeBrowser('true'), { mode: 0o700 });
    // The literal name the old ".XXXXXX.json" template produced on macOS.
    writeFileSync(join(home, 'egolite-jev.XXXXXX.json'), '');
    const env = { ...process.env, HOME: home, TMPDIR: home, PATH: `${home}/bin:${process.env.PATH}`,
      GOAL: 'Public navigation test', SUCCESS_MATCH: '/document', OPENROUTER_API_KEY: 'test-key' };
    const run = () => spawnSync('bash', [join(__dirname, '../scripts/run')], { env, encoding: 'utf8' });
    spawnSync('bash', [join(__dirname, '../scripts/run')], { env: { ...env, GOAL: '' }, encoding: 'utf8' });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('runner reads only the key line of ~/.config/typesafe/env', () => {
  const home = mkdtempSync(join(tmpdir(), 'jev-typesafe-test-'));
  try {
    mkdirSync(join(home, '.config/typesafe'), { recursive: true });
    writeFileSync(join(home, '.config/typesafe/env'), 'echo should-not-run > "$HOME/ran"\nTYPESAFE_API_KEY="ts-test"\n');
    mkdirSync(join(home, 'bin'));
    writeFileSync(join(home, 'bin/ego-browser'), fakeBrowser('[ "$TYPESAFE_API_KEY" = "ts-test" ] || exit 1'), { mode: 0o700 });
    const result = spawnSync('bash', [join(__dirname, '../scripts/run')], {
      env: { ...process.env, HOME: home, TMPDIR: home, PATH: `${home}/bin:${process.env.PATH}`,
        GOAL: 'Public navigation test', SUCCESS_MATCH: '/document', OPENROUTER_API_KEY: '', TYPESAFE_API_KEY: '', TYPESAFE_AI_API_KEY: '' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(home, 'ran')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('search pipes search.js and needs only QUERY', () => {
  const home = mkdtempSync(join(tmpdir(), 'jev-search-test-'));
  try {
    mkdirSync(join(home, 'bin'));
    writeFileSync(join(home, 'bin/ego-browser'), fakeBrowser('true'), { mode: 0o700 });
    const env = { ...process.env, HOME: home, TMPDIR: home, PATH: `${home}/bin:${process.env.PATH}`,
      OPENROUTER_API_KEY: '', TYPESAFE_API_KEY: '', TYPESAFE_AI_API_KEY: '', GOAL: '', SUCCESS_MATCH: '' };
    const search = (extra) => spawnSync('bash', [join(__dirname, '../scripts/search')], { env: { ...env, ...extra }, encoding: 'utf8' });
    assert.equal(search({}).status, 2);
    writeFileSync(join(home, 'bin/ego-browser'), fakeBrowser('cat > "$TMPDIR/in.js"; grep -q "html.duckduckgo.com" "$TMPDIR/in.js" || exit 1; exec < "$TMPDIR/in.js"'), { mode: 0o700 });
    const result = search({ QUERY: 'vpn landing page design' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ok: true, reason: 'done' });
    writeFileSync(join(home, 'bin/ego-browser'), fakeBrowser(`cat > "$TMPDIR/in.js"; args="$(sed -n 's/^const ARGS_PATH = "\\(.*\\)"$/\\1/p' "$TMPDIR/in.js")"; grep -q '"shots": true' "$args" && grep -q '"shotsDir": "${home}/shots"' "$args" && grep -q '"shotView": "both"' "$args" && grep -q 'function captureReference' "$TMPDIR/in.js" || exit 1; exec < "$TMPDIR/in.js"`), { mode: 0o700 });
    const shots = search({ URLS: 'https://linear.app/', SHOTS: '1', SHOT_VIEW: 'both', SHOTS_DIR: join(home, 'shots') });
    assert.equal(shots.status, 0, shots.stderr);
    assert.ok(existsSync(join(home, 'shots')));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('runner reads the Amp local OpenRouter secret without overriding explicit configuration', () => {
  const home = mkdtempSync(join(tmpdir(), 'jev-auth-test-'));
  try {
    mkdirSync(join(home, '.config/amp/secrets'), { recursive: true });
    writeFileSync(join(home, '.config/amp/secrets/openrouter-api-key'), 'test-amp-secret\n', { mode: 0o600 });
    mkdirSync(join(home, 'bin'));
    // Replace only the browser boundary; execute the real shell credential resolution.
    writeFileSync(join(home, 'bin/ego-browser'), fakeBrowser('[ "$OPENROUTER_API_KEY" = "$EXPECTED_KEY" ] || exit 1'), { mode: 0o700 });
    const env = { ...process.env, HOME: home, TMPDIR: home, PATH: `${home}/bin:${process.env.PATH}`,
      GOAL: 'Public navigation test', SUCCESS_MATCH: '/document', OPENROUTER_API_KEY: '',
      TYPESAFE_API_KEY: '', TYPESAFE_AI_API_KEY: '', EXPECTED_KEY: 'test-amp-secret' };
    const run = (overrides = {}) => spawnSync('bash', [join(__dirname, '../scripts/run')], {
      env: { ...env, ...overrides }, encoding: 'utf8',
    });
    let result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes('test-amp-secret'), false);
    result = run({ OPENROUTER_API_KEY: 'test-explicit', EXPECTED_KEY: 'test-explicit' });
    assert.equal(result.status, 0, result.stderr);
    mkdirSync(join(home, '.config/egolite-jev'));
    writeFileSync(join(home, '.config/egolite-jev/env'), 'OPENROUTER_API_KEY=test-config\n');
    result = run({ EXPECTED_KEY: 'test-config' });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
