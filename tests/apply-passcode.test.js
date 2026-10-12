'use strict';

// Unit tests for middleware/applyPasscode.js (pure; no DB, no network).
// Run: node tests/apply-passcode.test.js

const assert = require('node:assert/strict');
const { requireApplyPasscode } = require('../middleware/applyPasscode');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

// Runs the middleware once and reports whether it passed through or answered.
function run({ header, passcode, nodeEnv }) {
  const saved = { APPLY_PASSCODE: process.env.APPLY_PASSCODE, NODE_ENV: process.env.NODE_ENV };
  if (passcode === undefined) delete process.env.APPLY_PASSCODE;
  else process.env.APPLY_PASSCODE = passcode;
  process.env.NODE_ENV = nodeEnv || 'production';

  const out = { nextCalled: false, status: null, body: null };
  const req = { get: (name) => (name.toLowerCase() === 'x-apply-passcode' ? header : undefined) };
  const res = {
    status(code) {
      out.status = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    },
  };
  try {
    requireApplyPasscode(req, res, () => {
      out.nextCalled = true;
    });
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  return out;
}

test('correct passcode passes through', () => {
  const out = run({ header: 'mango-river-lantern-42', passcode: 'mango-river-lantern-42' });
  assert.equal(out.nextCalled, true);
  assert.equal(out.status, null);
});

test('wrong passcode is refused with 401 invalid_passcode', () => {
  const out = run({ header: 'guess', passcode: 'mango-river-lantern-42' });
  assert.equal(out.nextCalled, false);
  assert.equal(out.status, 401);
  assert.equal(out.body.code, 'invalid_passcode');
});

test('missing header is refused with 401', () => {
  const out = run({ header: undefined, passcode: 'mango-river-lantern-42' });
  assert.equal(out.nextCalled, false);
  assert.equal(out.status, 401);
});

test('passcode differing only in length is refused (no prefix match)', () => {
  const out = run({ header: 'mango-river-lantern-4', passcode: 'mango-river-lantern-42' });
  assert.equal(out.status, 401);
});

test('production without APPLY_PASSCODE fails closed with 503', () => {
  const out = run({ header: 'anything', passcode: undefined, nodeEnv: 'production' });
  assert.equal(out.nextCalled, false);
  assert.equal(out.status, 503);
  assert.equal(out.body.code, 'applications_unavailable');
});

test('non-production without APPLY_PASSCODE stays open for local dev', () => {
  const out = run({ header: undefined, passcode: undefined, nodeEnv: 'development' });
  assert.equal(out.nextCalled, true);
});

console.log(`\n${passed} passed`);
