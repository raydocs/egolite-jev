const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

test('runner reads the Amp local OpenRouter secret without overriding explicit configuration', () => {
  const home = mkdtempSync(join(tmpdir(), 'jev-auth-test-'));
  try {
    mkdirSync(join(home, '.config/amp/secrets'), { recursive: true });
    writeFileSync(join(home, '.config/amp/secrets/openrouter-api-key'), 'test-amp-secret\n', { mode: 0o600 });
    mkdirSync(join(home, 'bin'));
    // Replace only the browser boundary; execute the real shell credential resolution.
    writeFileSync(join(home, 'bin/ego-browser'), '#!/bin/sh\n[ "$OPENROUTER_API_KEY" = "$EXPECTED_KEY" ]\n', { mode: 0o700 });
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
