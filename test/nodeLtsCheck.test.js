const test = require('node:test');
const assert = require('node:assert/strict');

const { isLtsVersion, runNodeLtsCheck } = require('../tools/check-node-lts');

test('isLtsVersion returns true for release objects with lts codename', () => {
  assert.equal(isLtsVersion('v23.1.0', { lts: 'Jod' }, [20, 22]), true);
});

test('runNodeLtsCheck warns for non-lts versions and does not throw', () => {
  const warnings = [];
  const logger = {
    warn(message) {
      warnings.push(message);
    },
  };

  const isLts = runNodeLtsCheck({
    version: 'v23.0.0',
    release: {},
    logger,
    supportedMajors: [20, 22],
  });

  assert.equal(isLts, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /does not appear to be an LTS release/);
});
