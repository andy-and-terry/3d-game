(function () {
  const PRESETS = {
    low: { shadows: false, ssao: false, ssr: false, bloom: false },
    medium: { shadows: true, ssao: true, ssr: false, bloom: true },
    high: { shadows: true, ssao: true, ssr: true, bloom: true }
  };

  function safeCall(fn, ...args) {
    try {
      if (typeof fn === 'function') fn(...args);
    } catch (_) {
      // noop: panel should never crash renderer if host API is unavailable
    }
  }

  function syncGraphicsApi(state) {
    const graphics = window.api && window.api.graphics;
    if (!graphics) return;

    safeCall(graphics.setPreset, state.preset);

    const featureSetters = {
      shadows: graphics.setShadows,
      ssao: graphics.setSSAO,
      ssr: graphics.setSSR,
      bloom: graphics.setBloom
    };

    for (const [feature, enabled] of Object.entries(state.features)) {
      const setter = featureSetters[feature];
      if (typeof setter === 'function') {
        safeCall(setter, enabled);
        continue;
      }

      if (typeof graphics.setFeatureEnabled === 'function') {
        safeCall(graphics.setFeatureEnabled, feature, enabled);
      }
    }

    if (typeof graphics.setSkyboxEnabled === 'function') {
      safeCall(graphics.setSkyboxEnabled, state.scene.skybox);
    }
    if (typeof graphics.setMoonLightEnabled === 'function') {
      safeCall(graphics.setMoonLightEnabled, state.scene.moonLight);
    }
  }

  function emitChange(state) {
    window.dispatchEvent(
      new CustomEvent('visuals-settings-changed', {
        detail: JSON.parse(JSON.stringify(state))
      })
    );
  }

  function applyVisualsToScene(scene, options, state) {
    if (!scene) return;

    if (options && options.skybox) {
      options.skybox.setEnabled(Boolean(state.scene.skybox));
    }

    if (options && options.moonLight) {
      options.moonLight.setEnabled(Boolean(state.scene.moonLight));
      options.moonLight.intensity = state.scene.moonLight ? 0.2 : 0;
    }

    if (options && options.sunLight) {
      options.sunLight.setEnabled(true);
      options.sunLight.intensity = state.scene.moonLight ? 0.85 : 1.0;
    }

    if (scene.imageProcessingConfiguration) {
      scene.imageProcessingConfiguration.bloomEnabled = Boolean(state.features.bloom);
    }

    if (scene.postProcessRenderPipelineManager && options && options.pipelineName) {
      const manager = scene.postProcessRenderPipelineManager;
      const cameras = scene.cameras || [];
      if (cameras.length > 0) {
        if (state.features.ssao) manager.attachCamerasToRenderPipeline(options.pipelineName + '-ssao', cameras, true);
        else manager.detachCamerasFromRenderPipeline(options.pipelineName + '-ssao', cameras);

        if (state.features.ssr) manager.attachCamerasToRenderPipeline(options.pipelineName + '-ssr', cameras, true);
        else manager.detachCamerasFromRenderPipeline(options.pipelineName + '-ssr', cameras);
      }
    }

    if (options && options.shadowGenerator) {
      options.shadowGenerator.usePoissonSampling = Boolean(state.features.shadows);
      options.shadowGenerator.bias = state.features.shadows ? 0.0005 : 0.02;
    }
  }

  function createState() {
    const preset = 'medium';
    return {
      preset,
      features: { ...PRESETS[preset] },
      scene: {
        skybox: true,
        moonLight: true
      }
    };
  }

  function initVisualsPanel(root) {
    if (!root) return null;

    const state = createState();

    const els = {
      preset: root.querySelector('#visuals-preset'),
      shadows: root.querySelector('#toggle-shadows'),
      ssao: root.querySelector('#toggle-ssao'),
      ssr: root.querySelector('#toggle-ssr'),
      bloom: root.querySelector('#toggle-bloom'),
      skybox: root.querySelector('#toggle-skybox'),
      moonLight: root.querySelector('#toggle-moon-light')
    };

    function syncFormFromState() {
      els.preset.value = state.preset;
      els.shadows.checked = state.features.shadows;
      els.ssao.checked = state.features.ssao;
      els.ssr.checked = state.features.ssr;
      els.bloom.checked = state.features.bloom;
      els.skybox.checked = state.scene.skybox;
      els.moonLight.checked = state.scene.moonLight;
    }

    function update() {
      syncGraphicsApi(state);
      emitChange(state);
    }

    els.preset.addEventListener('change', () => {
      state.preset = els.preset.value;
      state.features = { ...PRESETS[state.preset] };
      syncFormFromState();
      update();
    });

    els.shadows.addEventListener('change', () => {
      state.features.shadows = els.shadows.checked;
      update();
    });
    els.ssao.addEventListener('change', () => {
      state.features.ssao = els.ssao.checked;
      update();
    });
    els.ssr.addEventListener('change', () => {
      state.features.ssr = els.ssr.checked;
      update();
    });
    els.bloom.addEventListener('change', () => {
      state.features.bloom = els.bloom.checked;
      update();
    });
    els.skybox.addEventListener('change', () => {
      state.scene.skybox = els.skybox.checked;
      update();
    });
    els.moonLight.addEventListener('change', () => {
      state.scene.moonLight = els.moonLight.checked;
      update();
    });

    syncFormFromState();
    update();

    return {
      getState: () => JSON.parse(JSON.stringify(state))
    };
  }

  function bindSceneVisuals(scene, options) {
    const handler = (event) => applyVisualsToScene(scene, options || {}, event.detail || createState());
    window.addEventListener('visuals-settings-changed', handler);
    return () => window.removeEventListener('visuals-settings-changed', handler);
  }

  window.visualsPanel = {
    initVisualsPanel,
    bindSceneVisuals,
    applyVisualsToScene
  };
})();
