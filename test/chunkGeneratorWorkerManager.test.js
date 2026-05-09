const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { ChunkGeneratorWorkerManager } = require('../src/main/chunkGeneratorWorkerManager');

test('ChunkGeneratorWorkerManager generates, queues and caches chunks', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chunks-'));
  const sourceWorkerPath = path.join(
    '/home/runner/work/3d-game/3d-game',
    'src',
    'workers',
    'chunk_generator_worker.py',
  );
  const workerPath = path.join(tempRoot, 'chunk_generator_worker.py');
  await fs.copyFile(sourceWorkerPath, workerPath);

  const manager = new ChunkGeneratorWorkerManager({
    userDataPath: tempRoot,
    workerScriptPath: workerPath,
    maxConcurrentJobs: 1,
  });

  const [chunkA, chunkB] = await Promise.all([
    manager.getChunk({ x: 1, y: 2, seed: 10 }),
    manager.getChunk({ x: 3, y: 4, seed: 10 }),
  ]);

  assert.equal(chunkA.id, '1_2');
  assert.equal(chunkB.id, '3_4');

  const cachePath = path.join(tempRoot, 'chunks', '1_2_10.json');
  const cachedBefore = JSON.parse(await fs.readFile(cachePath, 'utf8'));
  assert.equal(cachedBefore.id, '1_2');

  await fs.rm(workerPath);
  const cachedChunk = await manager.getChunk({ x: 1, y: 2, seed: 10 });
  assert.equal(cachedChunk.id, '1_2');
});
