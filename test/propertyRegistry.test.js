const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { PropertyRegistry } = require('../src/main/propertyRegistry');

test('PropertyRegistry loads JSON properties by type and id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'properties-'));
  const propertiesDir = path.join(tempRoot, 'data', 'properties');
  await fs.mkdir(path.join(propertiesDir, 'items'), { recursive: true });
  await fs.mkdir(path.join(propertiesDir, 'flora'), { recursive: true });

  await fs.writeFile(
    path.join(propertiesDir, 'items', 'stone.json'),
    JSON.stringify({ id: 'item.stone', name: 'Stone', stackSize: 64 }),
  );

  await fs.writeFile(
    path.join(propertiesDir, 'flora', 'grass.json'),
    JSON.stringify({ id: 'flora.grass', name: 'Grass', rarity: 'common' }),
  );

  const registry = new PropertyRegistry({ baseDir: propertiesDir });
  await registry.loadAll();

  assert.equal(registry.get('item.stone')?.name, 'Stone');
  assert.equal(registry.getByType('flora', 'flora.grass')?.name, 'Grass');
  assert.ok(registry.listByType('items').some((item) => item.id === 'item.stone'));
});
