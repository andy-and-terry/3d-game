(function () {
  'use strict';

  function getIpcRenderer() {
    if (window.require) {
      try {
        const electron = window.require('electron');
        if (electron && electron.ipcRenderer) {
          return electron.ipcRenderer;
        }
      } catch (_) {
        // ignore
      }
    }

    const chunksApi = window.api && window.api.chunks;
    if (!chunksApi) {
      return null;
    }

    return {
      invoke(channel, ...args) {
        if (channel === 'chunks:request' && typeof chunksApi.requestChunk === 'function') {
          return chunksApi.requestChunk(...args);
        }
        if (channel === 'chunks:pre-generate' && typeof chunksApi.preGenerate === 'function') {
          return chunksApi.preGenerate(...args);
        }
        if (channel === 'chunks:set-max-concurrency' && typeof chunksApi.setMaxConcurrency === 'function') {
          return chunksApi.setMaxConcurrency(...args);
        }
        return Promise.reject(new Error(`Unsupported chunk channel: ${channel}`));
      },
      on(channel, handler) {
        if (channel === 'chunks:ready' && typeof chunksApi.onReady === 'function') {
          chunksApi.onReady(handler);
        }
      },
      removeListener() {
        // optional with bridged API
      }
    };
  }

  async function loadControlsOverlay() {
    try {
      const response = await fetch('./gen_controls.html');
      const html = await response.text();
      const holder = document.createElement('div');
      holder.innerHTML = html;
      while (holder.firstChild) {
        document.body.appendChild(holder.firstChild);
      }
    } catch (_error) {
      // If overlay file cannot be loaded we continue without controls.
    }
  }

  function createScene(canvas) {
    if (!window.BABYLON || !canvas) {
      return null;
    }

    const engine = new BABYLON.Engine(canvas, true);
    const scene = new BABYLON.Scene(engine);

    const camera = new BABYLON.UniversalCamera('camera', new BABYLON.Vector3(0, 20, 0), scene);
    camera.attachControl(canvas, true);
    camera.speed = 0.8;

    const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.95;

    engine.runRenderLoop(() => scene.render());
    window.addEventListener('resize', () => engine.resize());

    return { engine, scene, camera };
  }

  function attachControls(loader) {
    const streamingCheckbox = document.getElementById('streaming-toggle');
    const maxJobsInput = document.getElementById('max-jobs');
    const pregenRadiusInput = document.getElementById('pregen-radius');
    const pregenButton = document.getElementById('pregen-btn');

    if (streamingCheckbox) {
      streamingCheckbox.checked = true;
      streamingCheckbox.addEventListener('change', () => {
        loader.setStreamingEnabled(streamingCheckbox.checked);
      });
    }

    if (maxJobsInput) {
      maxJobsInput.value = String(loader.maxConcurrentJobs);
      maxJobsInput.addEventListener('change', () => {
        loader.setMaxConcurrentJobs(maxJobsInput.value);
      });
    }

    if (pregenButton && pregenRadiusInput) {
      pregenButton.addEventListener('click', async () => {
        pregenButton.disabled = true;
        await loader.preGenerate(pregenRadiusInput.value);
        pregenButton.disabled = false;
      });
    }
  }

  function updateDebugOverlay(loader) {
    const loadedList = document.getElementById('loaded-chunks');
    const statusList = document.getElementById('generation-statuses');
    const state = loader.getDebugSnapshot();

    if (loadedList) {
      loadedList.textContent = state.loadedChunkKeys.join(', ') || '(none)';
    }

    if (statusList) {
      statusList.textContent = state.statuses.map((entry) => `${entry.key}=${entry.status}`).join('\n') || '(none)';
    }
  }

  async function init() {
    await loadControlsOverlay();

    const canvas = document.getElementById('renderCanvas');
    const sceneContext = createScene(canvas);
    if (!sceneContext || !window.ChunkLoader) {
      return;
    }

    const ipcRenderer = getIpcRenderer();
    const loader = new window.ChunkLoader({
      scene: sceneContext.scene,
      ipcRenderer,
      worldId: 'default',
      chunkSize: 64,
      viewRadius: 2,
      lod: 0,
      streamingEnabled: true,
      maxConcurrentJobs: 2
    });

    loader.start();
    attachControls(loader);

    sceneContext.scene.onBeforeRenderObservable.add(() => {
      loader.updatePlayerPosition(sceneContext.camera.position);
      updateDebugOverlay(loader);
    });

    window.addEventListener('beforeunload', () => loader.stop());
  }

  window.addEventListener('DOMContentLoaded', init);
})();
