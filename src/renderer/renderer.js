(function () {
  'use strict';

  const MIN_PLAN_DURATION_MS = 500;
  const DEFAULT_PLAN_DURATION_MS = 1800;
  const RABBIT_PLAN_CHECK_INTERVAL_MS = 250;
  const RABBIT_BOUNDARY_LIMIT = 15;
  const BED_INTERACTION_RANGE = 4;

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

  async function appendOverlay(fileName) {
    try {
      const response = await fetch(`./${fileName}`);
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

  async function loadOverlays() {
    await Promise.all([
      appendOverlay('gen_controls.html'),
      appendOverlay('simulation_panel.html'),
    ]);
  }

  async function ensureScriptLoaded(scriptPath, markerPath) {
    const markerParts = markerPath.split('.');
    let marker = window;
    for (const part of markerParts) {
      marker = marker && marker[part];
    }
    if (marker) return;

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptPath;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${scriptPath}`));
      document.head.appendChild(script);
    });
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

  function normalizePlan(rawPlan) {
    const safePlan = rawPlan && typeof rawPlan === 'object' ? rawPlan : {};
    const action = safePlan.action === 'move' ? 'move' : 'idle';
    const speed = Math.max(0, Number(safePlan.speed) || 0);
    const durationMs = Math.max(MIN_PLAN_DURATION_MS, Number(safePlan.durationMs) || DEFAULT_PLAN_DURATION_MS);
    let direction = { x: 0, z: 0 };

    if (action === 'move') {
      const x = Number(safePlan.direction && safePlan.direction.x) || 0;
      const z = Number(safePlan.direction && safePlan.direction.z) || 0;
      const magnitude = Math.hypot(x, z);
      direction = magnitude > 0 ? { x: x / magnitude, z: z / magnitude } : { x: 0, z: 0 };
    }

    return {
      state: safePlan.state || (action === 'move' ? 'moving' : 'idle'),
      action,
      speed,
      durationMs,
      direction,
    };
  }

  async function getOrCreateWorldId(worldsApi) {
    if (!worldsApi || typeof worldsApi.listWorlds !== 'function') return null;

    try {
      const worlds = await worldsApi.listWorlds();
      if (Array.isArray(worlds) && worlds.length > 0 && worlds[0].id) {
        return worlds[0].id;
      }

      if (typeof worldsApi.createWorld === 'function') {
        const created = await worldsApi.createWorld({
          name: 'Starter World',
          seed: 1337,
          settings: {},
          addons: [],
        });
        return created && created.world && created.world.id ? created.world.id : null;
      }
    } catch (_) {
      return null;
    }

    return null;
  }

  function createRabbitController(scene, aiApi) {
    if (!window.BABYLON || !scene) {
      return null;
    }

    const rabbits = [];
    const rabbitMaterial = new BABYLON.StandardMaterial('rabbit-material', scene);
    rabbitMaterial.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
    rabbitMaterial.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);

    let rabbitSpeedMultiplier = 1;
    let targetRabbitCount = 3;

    function spawnRabbit() {
      const index = rabbits.length;
      const mesh = BABYLON.MeshBuilder.CreateCapsule(
        `rabbit-${index + 1}`,
        { height: 0.85, radius: 0.24, tessellation: 8 },
        scene,
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.position = new BABYLON.Vector3(-4 + (index * 2.4), 0.55, 5 - (index * 0.8));
      mesh.material = rabbitMaterial;
      rabbits.push({
        id: mesh.name,
        mesh,
        plan: normalizePlan({ action: 'idle', durationMs: 1000 }),
        planExpiresAt: 0,
        planRequestInFlight: false,
      });
      return rabbits[rabbits.length - 1];
    }

    function syncRabbitCount() {
      while (rabbits.length < targetRabbitCount) {
        const rabbit = spawnRabbit();
        requestPlan(rabbit);
      }

      while (rabbits.length > targetRabbitCount) {
        const rabbit = rabbits.pop();
        if (rabbit && rabbit.mesh) {
          rabbit.mesh.dispose();
        }
      }
    }

    async function requestPlan(rabbit) {
      if (rabbit.planRequestInFlight) {
        return;
      }

      rabbit.planRequestInFlight = true;
      try {
        let nextPlan = null;
        if (aiApi && typeof aiApi.evaluate === 'function') {
          try {
            nextPlan = await aiApi.evaluate({
              entityId: rabbit.id,
              entityType: 'rabbit',
              position: {
                x: rabbit.mesh.position.x,
                y: rabbit.mesh.position.y,
                z: rabbit.mesh.position.z,
              },
            });
          } catch (_) {
            nextPlan = null;
          }
        }

        rabbit.plan = normalizePlan(nextPlan);
        rabbit.planExpiresAt = Date.now() + rabbit.plan.durationMs;
      } finally {
        rabbit.planRequestInFlight = false;
      }
    }

    for (let index = 0; index < targetRabbitCount; index += 1) {
      spawnRabbit();
    }

    const requestInterval = setInterval(() => {
      rabbits.forEach((rabbit) => {
        if (Date.now() >= rabbit.planExpiresAt) {
          requestPlan(rabbit);
        }
      });
    }, RABBIT_PLAN_CHECK_INTERVAL_MS);

    rabbits.forEach((rabbit) => {
      requestPlan(rabbit);
    });

    const observer = scene.onBeforeRenderObservable.add(() => {
      const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
      rabbits.forEach((rabbit) => {
        if (rabbit.plan.action !== 'move') return;

        rabbit.mesh.position.x += rabbit.plan.direction.x * rabbit.plan.speed * rabbitSpeedMultiplier * deltaSeconds;
        rabbit.mesh.position.z += rabbit.plan.direction.z * rabbit.plan.speed * rabbitSpeedMultiplier * deltaSeconds;

        if (
          Math.abs(rabbit.mesh.position.x) > RABBIT_BOUNDARY_LIMIT ||
          Math.abs(rabbit.mesh.position.z) > RABBIT_BOUNDARY_LIMIT
        ) {
          rabbit.planExpiresAt = 0;
        }
      });
    });

    return {
      getDebugStates() {
        return rabbits.map((rabbit) => ({
          id: rabbit.id,
          state: rabbit.plan.state,
          action: rabbit.plan.action,
        }));
      },
      applyUpgradeEffects(effects) {
        const safe = effects && typeof effects === 'object' ? effects : {};
        rabbitSpeedMultiplier = Math.max(0.5, Number(safe.rabbitSpeedMultiplier) || 1);
        targetRabbitCount = Math.max(1, Math.floor(Number(safe.rabbitCount) || 3));
        syncRabbitCount();
      },
      dispose() {
        clearInterval(requestInterval);
        scene.onBeforeRenderObservable.remove(observer);
        rabbits.forEach((rabbit) => rabbit.mesh.dispose());
      },
    };
  }

  function attachBedInteraction(scene, camera, tickApi, worldId, simulationUi, getInteractionRange) {
    if (!window.BABYLON || !scene || !camera) {
      return null;
    }

    const bed = BABYLON.MeshBuilder.CreateBox('bed', { width: 2.2, depth: 3.4, height: 0.6 }, scene);
    bed.position = new BABYLON.Vector3(6, 0.3, 6);
    const bedMaterial = new BABYLON.StandardMaterial('bed-material', scene);
    bedMaterial.diffuseColor = new BABYLON.Color3(0.6, 0.2, 0.2);
    bed.material = bedMaterial;

    let isNearby = false;
    let promptVisible = false;

    const proximityObserver = scene.onBeforeRenderObservable.add(() => {
      const interactionRange = Math.max(
        0.5,
        typeof getInteractionRange === 'function' ? Number(getInteractionRange()) || BED_INTERACTION_RANGE : BED_INTERACTION_RANGE,
      );
      const distance = BABYLON.Vector3.Distance(camera.position, bed.position);
      const nextNearby = distance <= interactionRange;
      if (nextNearby && !promptVisible && simulationUi) {
        simulationUi.setStatus('Press E near the bed to sleep until morning');
        promptVisible = true;
      } else if (!nextNearby && promptVisible && simulationUi) {
        simulationUi.setStatus('Simulation running');
        promptVisible = false;
      }
      isNearby = nextNearby;
    });

    const keydownHandler = async (event) => {
      if (!event || typeof event.key !== 'string' || event.key.toLowerCase() !== 'e' || !isNearby) {
        return;
      }

      if (!tickApi || typeof tickApi.sleepToMorning !== 'function') {
        if (simulationUi) simulationUi.setStatus('Sleep unavailable');
        return;
      }

      try {
        const result = await tickApi.sleepToMorning({ worldId });
        const persisted = result && result.persisted ? 'saved' : 'unsaved';
        if (simulationUi) {
          simulationUi.setStatus(`Slept until morning (${persisted})`);
          await simulationUi.refreshTickState();
        }
      } catch (_) {
        if (simulationUi) simulationUi.setStatus('Sleep failed');
      }
    };

    window.addEventListener('keydown', keydownHandler);

    return {
      dispose() {
        window.removeEventListener('keydown', keydownHandler);
        scene.onBeforeRenderObservable.remove(proximityObserver);
        bed.dispose();
      },
    };
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

  function updateDebugOverlay(loader, rabbitController, simulationUi) {
    const loadedList = document.getElementById('loaded-chunks');
    const statusList = document.getElementById('generation-statuses');
    const state = loader.getDebugSnapshot();

    if (loadedList) {
      loadedList.textContent = state.loadedChunkKeys.join(', ') || '(none)';
    }

    if (statusList) {
      statusList.textContent = state.statuses.map((entry) => `${entry.key}=${entry.status}`).join('\n') || '(none)';
    }

    if (simulationUi && rabbitController) {
      simulationUi.setAiStates(rabbitController.getDebugStates());
    }
  }

  async function init() {
    await loadOverlays();
    try {
      await ensureScriptLoaded('./simulation_panel.js', 'simulationPanel');
    } catch (_) {
      // Rendering can continue with chunk streaming even if simulation controls are unavailable.
    }

    const canvas = document.getElementById('renderCanvas');
    const sceneContext = createScene(canvas);
    if (!sceneContext || !window.ChunkLoader || !window.BABYLON) {
      return;
    }

    const rendererApi = window.api || {};
    const ipcRenderer = getIpcRenderer();
    const worldId = await getOrCreateWorldId(rendererApi.worlds);

    const loader = new window.ChunkLoader({
      scene: sceneContext.scene,
      ipcRenderer,
      worldId: worldId || 'default',
      chunkSize: 64,
      viewRadius: 2,
      lod: 0,
      streamingEnabled: true,
      maxConcurrentJobs: 2
    });

    loader.start();
    attachControls(loader);

    let upgradeEffects = {
      rabbitSpeedMultiplier: 1,
      rabbitCount: 3,
      sleepRangeBonus: 0,
    };

    const rabbitController = createRabbitController(sceneContext.scene, rendererApi.ai);
    if (rabbitController) {
      rabbitController.applyUpgradeEffects(upgradeEffects);
    }

    const simulationRoot = document.getElementById('simulation-panel');
    const simulationUi = window.simulationPanel && simulationRoot
      ? window.simulationPanel.initSimulationPanel(simulationRoot, {
        tickApi: rendererApi.tick,
        onUpgradesChanged(nextEffects) {
          upgradeEffects = { ...upgradeEffects, ...(nextEffects || {}) };
          if (rabbitController) {
            rabbitController.applyUpgradeEffects(upgradeEffects);
          }
        },
      })
      : null;
    if (simulationUi) {
      simulationUi.setStatus('Simulation running');
    }

    const bedInteraction = attachBedInteraction(
      sceneContext.scene,
      sceneContext.camera,
      rendererApi.tick,
      worldId,
      simulationUi,
      () => BED_INTERACTION_RANGE + (Number(upgradeEffects.sleepRangeBonus) || 0),
    );

    sceneContext.scene.onBeforeRenderObservable.add(() => {
      loader.updatePlayerPosition(sceneContext.camera.position);
      updateDebugOverlay(loader, rabbitController, simulationUi);
    });

    window.addEventListener('beforeunload', () => {
      loader.stop();
      if (rabbitController) rabbitController.dispose();
      if (bedInteraction) bedInteraction.dispose();
      if (simulationUi) simulationUi.destroy();
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
