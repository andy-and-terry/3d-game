const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

class ChunkGeneratorWorkerManager {
  constructor({ userDataPath, workerScriptPath, pythonCommand = 'python3', maxConcurrentJobs = 1 }) {
    this.userDataPath = userDataPath;
    this.workerScriptPath = workerScriptPath;
    this.pythonCommand = pythonCommand;
    this.maxConcurrentJobs = Math.max(1, maxConcurrentJobs);
    this.cacheDir = path.join(userDataPath, 'chunks');

    this.queue = [];
    this.activeJobs = 0;
    this.inFlight = new Map();
  }

  async getChunk({ x, y, seed = 0 }) {
    const key = this.#chunkKey(x, y, seed);
    const cachePath = this.#cachePath(key);

    const cached = await this.#readCache(cachePath);
    if (cached) {
      return cached;
    }

    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    const jobPromise = new Promise((resolve, reject) => {
      this.queue.push({ key, cachePath, x, y, seed, resolve, reject });
      this.#drainQueue();
    }).finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, jobPromise);
    return jobPromise;
  }

  async #readCache(cachePath) {
    try {
      const raw = await fs.readFile(cachePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async #writeCache(cachePath, chunk) {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(chunk), 'utf8');
  }

  #chunkKey(x, y, seed) {
    return `${x}_${y}_${seed}`;
  }

  #cachePath(key) {
    return path.join(this.cacheDir, `${key}.json`);
  }

  #drainQueue() {
    while (this.activeJobs < this.maxConcurrentJobs && this.queue.length > 0) {
      const job = this.queue.shift();
      this.activeJobs += 1;
      this.#runJob(job)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.activeJobs -= 1;
          this.#drainQueue();
        });
    }
  }

  async #runJob(job) {
    const chunk = await this.#invokeGenerator({ x: job.x, y: job.y, seed: job.seed });
    await this.#writeCache(job.cachePath, chunk);
    return chunk;
  }

  #invokeGenerator(payload) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonCommand, [this.workerScriptPath]);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', reject);

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Chunk worker exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(new Error(`Failed to parse chunk worker output: ${error.message}`));
        }
      });

      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    });
  }
}

module.exports = {
  ChunkGeneratorWorkerManager,
};
