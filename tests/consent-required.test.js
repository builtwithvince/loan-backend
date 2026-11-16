'use strict';

// Submits without consent are refused before any DB read (decision 023).
// No network: Supabase gets a dummy URL and every query throws.
// Run: node tests/consent-required.test.js

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

const assert = require('node:assert/strict');
const { supabase } = require('../services/supabase');
const router = require('../routes/application');

let dbTouched = false;
supabase.from = () => {
  dbTouched = true;
  throw new Error('DB must not be touched');
};

function handlerFor(path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods.post);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

async function run(path, body) {
  dbTouched = false;
  const out = { status: null, body: null };
  const res = {
    status(code) {
      out.status = code;
      return this;
    },
    json(payload) {
      out.body = payload;
      return this;
    },
  };
  await handlerFor(path)({ body, files: [], get: () => undefined, headers: {} }, res);
  return out;
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

(async () => {
  for (const path of ['/submit', '/submit-group']) {
    await test(`${path}: missing consentAgreed → 400 consent_required, no DB read`, async () => {
      const out = await run(path, { loanType: 'personal', mobile: '09171234567' });
      assert.equal(out.status, 400);
      assert.equal(out.body.code, 'consent_required');
      assert.equal(dbTouched, false);
    });

    await test(`${path}: consentAgreed 'false' → 400`, async () => {
      const out = await run(path, { consentAgreed: 'false' });
      assert.equal(out.status, 400);
      assert.equal(dbTouched, false);
    });

    await test(`${path}: consentAgreed 'true' passes the consent gate`, async () => {
      const out = await run(path, { consentAgreed: 'true', loanType: 'personal', members: '[]' });
      assert.notEqual(out.body && out.body.code, 'consent_required');
    });
  }

  await test('message avoids the words the frontend reads as an upload error', async () => {
    const { body } = await run('/submit', {});
    const m = body.message.toLowerCase();
    assert.ok(!m.includes('size limit') && !m.includes('too many files'));
    assert.ok(!(m.includes('exceed') && m.includes('mb')));
  });

  console.log(`\n${passed} passed`);
})();
