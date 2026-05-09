/**
 * renderer.js — Babylon.js scene bootstrap
 * Procedural terrain generation via the Python worker (IPC) or
 * a fallback JS noise generator when the IPC is unavailable.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------ //
  //  Quality profiles
  // ------------------------------------------------------------------ //
  const QUALITY_PROFILES = {
    low:    { shadowRes: 512,  viewDist: 200,  density: 0.2, fog: 0.03 },
    medium: { shadowRes: 1024, viewDist: 500,  density: 0.5, fog: 0.015 },
    high:   { shadowRes: 2048, viewDist: 900,  density: 0.8, fog: 0.008 },
    ultra:  { shadowRes: 4096, viewDist: 1500, density: 1.0, fog: 0.004 }
  };
  let currentQuality = 'medium';

  // ------------------------------------------------------------------ //
  //  Minimal fallback noise (Mulberry32 + value noise)
  // ------------------------------------------------------------------ //
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function generateHeightmapJS(seed, size) {
    const rand = mulberry32(seed);
    const base = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => rand())
    );
    // Smooth a few times for "hills" look
    function smooth(arr) {
      const out = arr.map(r => [...r]);
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          out[y][x] = (arr[y-1][x] + arr[y+1][x] + arr[y][x-1] + arr[y][x+1] +
                       arr[y][x] * 4) / 8;
        }
      }
      return out;
    }
    let hm = base;
    for (let i = 0; i < 4; i++) hm = smooth(hm);
    return hm;
  }

  // ------------------------------------------------------------------ //
  //  Hardware auto-detect quality
  // ------------------------------------------------------------------ //
  function detectQuality() {
    try {
      const gl = document.createElement('canvas').getContext('webgl2') ||
                 document.createElement('canvas').getContext('webgl');
      if (!gl) return 'low';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL).toLowerCase();
        if (/rtx|rx\s*[6-9]|radeon\s*rx\s*[6-9]/.test(renderer)) return 'ultra';
        if (/gtx\s*1[0-9]|rx\s*[56]/.test(renderer))               return 'high';
        if (/intel|iris/.test(renderer))                            return 'low';
      }
    } catch {}
    return 'medium';
  }

  // ------------------------------------------------------------------ //
  //  Scene globals
  // ------------------------------------------------------------------ //
  const canvas  = document.getElementById('renderCanvas');
  const fpsEl   = document.getElementById('fps');
  const seedEl  = document.getElementById('seed-display');

  let engine, scene, camera, light, shadowGenerator;
  let terrain = null;

  // ------------------------------------------------------------------ //
  //  Build Babylon scene
  // ------------------------------------------------------------------ //
  function initScene() {
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    scene  = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.05, 0.07, 0.12, 1);

    // Camera
    camera = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 40, -80), scene);
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.speed = 1.2;
    camera.minZ = 0.5;
    camera.attachControl(canvas, true);

    // Directional light + shadows
    light = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-1, -2, -1), scene);
    light.position = new BABYLON.Vector3(300, 400, 300);
    light.intensity = 1.2;

    const ambient = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
    ambient.intensity = 0.35;
    ambient.groundColor = new BABYLON.Color3(0.2, 0.2, 0.25);

    applyQuality(currentQuality);

    // Fog
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = QUALITY_PROFILES[currentQuality].fog;
    scene.fogColor = new BABYLON.Color3(0.12, 0.16, 0.25);

    // Skybox
    const skybox = BABYLON.MeshBuilder.CreateBox('skyBox', { size: 2000 }, scene);
    const skyMat = new BABYLON.StandardMaterial('skyMat', scene);
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true;
    skyMat.emissiveColor = new BABYLON.Color3(0.1, 0.14, 0.28);
    skybox.material = skyMat;
    skybox.infiniteDistance = true;

    engine.runRenderLoop(() => { scene.render(); });
    window.addEventListener('resize', () => engine.resize());

    // FPS counter
    let frames = 0, last = performance.now();
    scene.registerAfterRender(() => {
      frames++;
      const now = performance.now();
      if (now - last > 1000) {
        fpsEl.textContent = frames + ' fps';
        frames = 0; last = now;
      }
    });

    return scene;
  }

  // ------------------------------------------------------------------ //
  //  Quality
  // ------------------------------------------------------------------ //
  function applyQuality(q) {
    currentQuality = q;
    const prof = QUALITY_PROFILES[q];
    document.querySelectorAll('.q-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.q === q);
    });
    if (shadowGenerator) {
      shadowGenerator.mapSize = prof.shadowRes;
    }
    if (scene) {
      scene.fogDensity = prof.fog;
    }
  }

  document.querySelectorAll('.q-btn').forEach(btn => {
    btn.addEventListener('click', () => applyQuality(btn.dataset.q));
  });

  // ------------------------------------------------------------------ //
  //  Build terrain mesh from heightmap
  // ------------------------------------------------------------------ //
  function buildTerrain(hm, size, seed) {
    if (terrain) terrain.dispose();

    const scale = 200;
    const heightScale = 40;
    const subdiv = Math.min(size - 1, 127); // Babylon max subdivisions

    terrain = BABYLON.MeshBuilder.CreateGround('terrain', {
      width: scale, height: scale,
      subdivisions: subdiv,
      updatable: false
    }, scene);

    const positions = terrain.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const px = positions[i * 3];
      const pz = positions[i * 3 + 2];
      // Map world x,z -> heightmap index
      const gx = Math.floor(((px / scale) + 0.5) * (size - 1));
      const gz = Math.floor(((pz / scale) + 0.5) * (size - 1));
      const hx = Math.max(0, Math.min(size - 1, gx));
      const hz = Math.max(0, Math.min(size - 1, gz));
      positions[i * 3 + 1] = (hm[hz] ? (hm[hz][hx] || 0) : 0) * heightScale;
    }
    terrain.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
    terrain.createNormals(false);

    // Material
    const mat = new BABYLON.StandardMaterial('terrainMat', scene);
    mat.diffuseColor = new BABYLON.Color3(0.28, 0.42, 0.18);
    mat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
    terrain.material = mat;
    terrain.receiveShadows = true;

    // Shadows
    if (!shadowGenerator) {
      const prof = QUALITY_PROFILES[currentQuality];
      shadowGenerator = new BABYLON.ShadowGenerator(prof.shadowRes, light);
      shadowGenerator.useBlurExponentialShadowMap = true;
    }

    seedEl.textContent = 'seed: ' + seed;
  }

  // ------------------------------------------------------------------ //
  //  Load terrain (IPC → Python or JS fallback)
  // ------------------------------------------------------------------ //
  async function loadTerrain(seed) {
    const SIZE = 64;
    let hm;
    if (window.api && window.api.generateTerrain) {
      try {
        const result = await window.api.generateTerrain({ seed, size: SIZE, octaves: 6, scale: 4.0 });
        hm = result.heightmap;
      } catch (e) {
        console.warn('IPC terrain failed, using JS fallback:', e);
        hm = generateHeightmapJS(seed, SIZE);
      }
    } else {
      hm = generateHeightmapJS(seed, SIZE);
    }
    buildTerrain(hm, SIZE, seed);
  }

  // ------------------------------------------------------------------ //
  //  Entry point
  // ------------------------------------------------------------------ //
  window.addEventListener('DOMContentLoaded', () => {
    currentQuality = detectQuality();
    initScene();
    const seed = Math.floor(Math.random() * (2 ** 31 - 1));
    loadTerrain(seed);
  });

  // Expose for external use (e.g., worlds menu "Play" action)
  window.gameAPI = {
    loadTerrain,
    applyQuality,
    getScene: () => scene
  };
})();
