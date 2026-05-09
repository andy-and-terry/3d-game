const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatTimeOfDay,
  normalizeAiStates,
  normalizeUpgradeLevels,
  calculateUpgradeEffects,
} = require('../src/renderer/simulation_panel');

test('simulation panel formats wrapped time values', () => {
  assert.equal(formatTimeOfDay(0), '00:00');
  assert.equal(formatTimeOfDay(6 * 3600), '06:00');
  assert.equal(formatTimeOfDay(24 * 3600 + 90), '00:01');
  assert.equal(formatTimeOfDay(-60), '23:59');
});

test('simulation panel normalizes AI debug entries', () => {
  assert.deepEqual(normalizeAiStates([]), ['(none)']);
  assert.deepEqual(
    normalizeAiStates([{ id: 'rabbit-1', state: 'foraging', action: 'move' }, 'rabbit-2: idle']),
    ['rabbit-1: foraging (move)', 'rabbit-2: idle'],
  );
  assert.deepEqual(
    normalizeAiStates([{ id: 'rabbit-3' }]),
    ['rabbit-3: unknown (unknown)'],
  );
});

test('simulation panel normalizes upgrade levels', () => {
  assert.deepEqual(
    normalizeUpgradeLevels({ rabbitSpeed: 2.9, rabbitCount: -1, sleepRange: 9 }),
    { rabbitSpeed: 2, rabbitCount: 0, sleepRange: 3 },
  );
});

test('simulation panel calculates upgrade effects', () => {
  assert.deepEqual(
    calculateUpgradeEffects({ rabbitSpeed: 2, rabbitCount: 1, sleepRange: 3 }),
    {
      levels: { rabbitSpeed: 2, rabbitCount: 1, sleepRange: 3 },
      rabbitSpeedMultiplier: 1.4,
      rabbitCount: 4,
      sleepRangeBonus: 3.75,
    },
  );
});
