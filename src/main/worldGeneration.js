const path = require('node:path');
const { PropertyRegistry } = require('./propertyRegistry');
const { ChunkGeneratorWorkerManager } = require('./chunkGeneratorWorkerManager');

function createWorldGenerationServices({ userDataPath, projectRoot, pythonCommand = 'python3' }) {
  const propertyRegistry = new PropertyRegistry({
    baseDir: path.join(projectRoot, 'data', 'properties'),
  });

  const chunkWorkerManager = new ChunkGeneratorWorkerManager({
    userDataPath,
    workerScriptPath: path.join(projectRoot, 'src', 'workers', 'chunk_generator_worker.py'),
    pythonCommand,
  });

  return {
    propertyRegistry,
    chunkWorkerManager,
  };
}

module.exports = {
  createWorldGenerationServices,
};
