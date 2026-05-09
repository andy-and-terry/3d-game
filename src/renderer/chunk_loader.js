(function (globalScope) {
  'use strict';

  const DEFAULT_CHUNK_SIZE = 64;
  const DEFAULT_VIEW_RADIUS = 2;
  const DEFAULT_LOD = 0;

  function chunkKey(cx, cz, lod) {
    return `${cx}:${cz}:${lod}`;
  }

  function resolveHeight(chunkPayload) {
    const chunk = chunkPayload && chunkPayload.chunk ? chunkPayload.chunk : chunkPayload;
    return {
      cx: Number(chunk.cx ?? chunk.x ?? 0),
      cz: Number(chunk.cz ?? chunk.z ?? 0),
      lod: Number(chunk.lod ?? 0),
      heightmap: chunk.heightmap || chunk.heights || [],
      chunkSize: Number(chunk.chunkSize || chunk.size || DEFAULT_CHUNK_SIZE)
    };
  }

  class ChunkLoader {
    constructor(options) {
      const opts = options || {};
      this.scene = opts.scene;
      this.ipcRenderer = opts.ipcRenderer;
      this.worldId = opts.worldId || 'default';
      this.chunkSize = Number(opts.chunkSize || DEFAULT_CHUNK_SIZE);
      this.viewRadius = Number(opts.viewRadius || DEFAULT_VIEW_RADIUS);
      this.lod = Number(opts.lod || DEFAULT_LOD);
      this.streamingEnabled = opts.streamingEnabled !== false;
      this.maxConcurrentJobs = Number(opts.maxConcurrentJobs || 2);

      this.chunkMeshes = new Map();
      this.chunkStatuses = new Map();
      this.pending = new Set();
      this.inFlightCount = 0;
      this.lastCenterKey = null;
      this._readyHandler = null;
    }

    start() {
      if (!this.ipcRenderer || typeof this.ipcRenderer.on !== 'function') {
        return;
      }

      this._readyHandler = (_event, payload) => {
        this._onChunkReady(payload);
      };

      this.ipcRenderer.on('chunks:ready', this._readyHandler);
    }

    stop() {
      if (this._readyHandler && this.ipcRenderer && typeof this.ipcRenderer.removeListener === 'function') {
        this.ipcRenderer.removeListener('chunks:ready', this._readyHandler);
      }

      this._readyHandler = null;
      for (const mesh of this.chunkMeshes.values()) {
        mesh.dispose();
      }
      this.chunkMeshes.clear();
      this.pending.clear();
      this.chunkStatuses.clear();
      this.inFlightCount = 0;
    }

    setStreamingEnabled(enabled) {
      this.streamingEnabled = Boolean(enabled);
      if (!this.streamingEnabled) {
        this.pending.clear();
      }
      return this.streamingEnabled;
    }

    async setMaxConcurrentJobs(value) {
      const parsed = Math.max(1, Number(value) || 1);
      this.maxConcurrentJobs = parsed;
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        return parsed;
      }

      try {
        await this.ipcRenderer.invoke('chunks:set-max-concurrency', this.worldId, parsed);
      } catch (_) {
        // Optional IPC endpoint.
      }

      return parsed;
    }

    async preGenerate(radius) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        return { ok: false, reason: 'ipc unavailable' };
      }

      const parsedRadius = Math.max(0, Number(radius) || 0);
      try {
        return await this.ipcRenderer.invoke('chunks:pre-generate', this.worldId, parsedRadius);
      } catch (_error) {
        // Fallback: request chunk ring manually.
        const requests = [];
        for (let cz = -parsedRadius; cz <= parsedRadius; cz += 1) {
          for (let cx = -parsedRadius; cx <= parsedRadius; cx += 1) {
            requests.push(this._requestChunk(cx, cz, this.lod));
          }
        }
        await Promise.allSettled(requests);
        return { ok: true, fallback: true, requested: requests.length };
      }
    }

    updatePlayerPosition(position) {
      if (!this.streamingEnabled || !position) {
        return;
      }

      const cx = Math.floor((position.x || 0) / this.chunkSize);
      const cz = Math.floor((position.z || 0) / this.chunkSize);
      const centerKey = `${cx}:${cz}`;

      if (centerKey === this.lastCenterKey) {
        return;
      }

      this.lastCenterKey = centerKey;
      this._requestAround(cx, cz);
      this._disposeFarChunks(cx, cz);
    }

    getDebugSnapshot() {
      const loadedChunkKeys = Array.from(this.chunkMeshes.keys()).sort();
      const statuses = Array.from(this.chunkStatuses.entries())
        .map(([key, status]) => ({ key, status }))
        .sort((a, b) => a.key.localeCompare(b.key));

      return {
        loadedChunkKeys,
        statuses,
        pendingCount: this.pending.size,
        inFlightCount: this.inFlightCount,
        streamingEnabled: this.streamingEnabled,
        maxConcurrentJobs: this.maxConcurrentJobs
      };
    }

    _requestAround(cx, cz) {
      for (let dz = -this.viewRadius; dz <= this.viewRadius; dz += 1) {
        for (let dx = -this.viewRadius; dx <= this.viewRadius; dx += 1) {
          this._requestChunk(cx + dx, cz + dz, this.lod);
        }
      }
    }

    _requestChunk(cx, cz, lod) {
      if (!this.ipcRenderer || typeof this.ipcRenderer.invoke !== 'function') {
        return Promise.resolve(null);
      }

      const key = chunkKey(cx, cz, lod);
      if (this.chunkMeshes.has(key) || this.pending.has(key)) {
        return Promise.resolve(null);
      }

      if (this.inFlightCount >= this.maxConcurrentJobs) {
        return Promise.resolve(null);
      }

      this.pending.add(key);
      this.inFlightCount += 1;
      this.chunkStatuses.set(key, 'requested');

      return this.ipcRenderer
        .invoke('chunks:request', this.worldId, cx, cz, lod)
        .then((response) => {
          // Support direct request/response managers without ready events.
          if (response && response.heightmap) {
            this._onChunkReady(response);
          }
          return response;
        })
        .catch(() => {
          this.chunkStatuses.set(key, 'error');
        })
        .finally(() => {
          this.pending.delete(key);
          this.inFlightCount = Math.max(0, this.inFlightCount - 1);
        });
    }

    _onChunkReady(payload) {
      if (!this.scene || !globalScope.BABYLON || !payload) {
        return;
      }

      const chunk = resolveHeight(payload);
      const key = chunkKey(chunk.cx, chunk.cz, chunk.lod);

      if (this.chunkMeshes.has(key)) {
        this.chunkStatuses.set(key, 'loaded');
        return;
      }

      const heightmap = chunk.heightmap;
      if (!Array.isArray(heightmap) || heightmap.length === 0) {
        this.chunkStatuses.set(key, 'invalid');
        return;
      }

      const mapSize = heightmap.length;
      const worldSize = chunk.chunkSize;
      const subdivisions = Math.max(1, mapSize - 1);

      const mesh = globalScope.BABYLON.MeshBuilder.CreateGround(
        `chunk-${key}`,
        {
          width: worldSize,
          height: worldSize,
          subdivisions
        },
        this.scene
      );

      const positions = mesh.getVerticesData(globalScope.BABYLON.VertexBuffer.PositionKind) || [];
      for (let i = 0; i < positions.length; i += 3) {
        const px = positions[i];
        const pz = positions[i + 2];
        const nx = Math.max(0, Math.min(mapSize - 1, Math.round(((px / worldSize) + 0.5) * (mapSize - 1))));
        const nz = Math.max(0, Math.min(mapSize - 1, Math.round(((pz / worldSize) + 0.5) * (mapSize - 1))));
        const h = Number(heightmap[nz] && heightmap[nz][nx]) || 0;
        positions[i + 1] = h;
      }

      mesh.updateVerticesData(globalScope.BABYLON.VertexBuffer.PositionKind, positions);
      mesh.position.x = chunk.cx * worldSize;
      mesh.position.z = chunk.cz * worldSize;

      if (!mesh.material) {
        const mat = new globalScope.BABYLON.StandardMaterial(`mat-${key}`, this.scene);
        mat.diffuseColor = new globalScope.BABYLON.Color3(0.29, 0.45, 0.27);
        mat.specularColor = new globalScope.BABYLON.Color3(0.02, 0.02, 0.02);
        mesh.material = mat;
      }

      this.chunkMeshes.set(key, mesh);
      this.chunkStatuses.set(key, 'loaded');
    }

    _disposeFarChunks(centerCx, centerCz) {
      const maxDistance = this.viewRadius + 1;

      for (const [key, mesh] of this.chunkMeshes.entries()) {
        const [cxStr, czStr] = key.split(':');
        const cx = Number(cxStr);
        const cz = Number(czStr);

        if (Math.abs(cx - centerCx) > maxDistance || Math.abs(cz - centerCz) > maxDistance) {
          mesh.dispose();
          this.chunkMeshes.delete(key);
          this.chunkStatuses.set(key, 'disposed');
        }
      }
    }
  }

  globalScope.ChunkLoader = ChunkLoader;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChunkLoader };
  }
})(typeof window !== 'undefined' ? window : globalThis);
