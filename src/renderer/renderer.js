/**
 * src/renderer/renderer.js – Babylon.js renderer entry-point
 *
 * What this does:
 *  1. Initialises a Babylon.js engine on the full-window canvas.
 *  2. Calls window.api.generateTerrain({ seed, size }) via the preload bridge.
 *  3. Builds a ground mesh displaced by the returned heightmap.
 *  4. Sets up a free camera with WASD + pointer-lock mouse look.
 *  5. Updates an FPS / position HUD overlay every frame.
 *  6. Wires up the quality-preset selector (currently adjusts a dummy variable
 *     – extend it to swap shadow/LOD settings as the project grows).
 *
 * HOW TO CHANGE THE GENERATOR:
 *  Edit gen/generator.py.  The contract is:
 *    stdin  ← JSON line:  { "seed": <int>, "size": <int> }
 *    stdout → JSON line:  { "size": <int>, "heights": [<float>, …] }
 *  heights must contain size*size values in row-major order.
 *
 * HOW TO CHANGE THE TERRAIN REQUEST:
 *  Find the generateTerrain() call below and change seed / size.
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const TERRAIN_SEED = 123;
const TERRAIN_SIZE = 64;     // tiles along one axis (64 → 64×64 = 4096 verts)
const HEIGHT_SCALE = 12;     // world-unit multiplier for heightmap values

// ── Quality preset definitions ───────────────────────────────────────────────
// Extend these as more rendering features are added.
const QUALITY_PRESETS = {
  low:    { shadowMapSize: 512,  fogEnd: 150 },
  medium: { shadowMapSize: 1024, fogEnd: 300 },
  high:   { shadowMapSize: 2048, fogEnd: 500 },
  ultra:  { shadowMapSize: 4096, fogEnd: 800 }
};

let currentQuality = 'medium';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('renderCanvas');
const fpsEl    = document.getElementById('fps');
const posEl    = document.getElementById('pos');
const statusEl = document.getElementById('status');
const qualSel  = document.getElementById('quality');

// ── Engine + Scene ────────────────────────────────────────────────────────────
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true });
const scene  = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.53, 0.81, 0.98, 1); // sky blue

// ── Camera ────────────────────────────────────────────────────────────────────
// UniversalCamera gives WASD + mouse-look; attach pointer-lock on canvas click.
const camera = new BABYLON.UniversalCamera(
  'cam',
  new BABYLON.Vector3(TERRAIN_SIZE / 2, HEIGHT_SCALE * 1.5, TERRAIN_SIZE / 2),
  scene
);
camera.setTarget(new BABYLON.Vector3(TERRAIN_SIZE / 2, 0, TERRAIN_SIZE / 2 - 1));
camera.attachControl(canvas, true);

// WASD + arrow keys
camera.keysUp    = [87, 38]; // W, ↑
camera.keysDown  = [83, 40]; // S, ↓
camera.keysLeft  = [65, 37]; // A, ←
camera.keysRight = [68, 39]; // D, →
camera.speed     = 0.5;
camera.minZ      = 0.1;

// Pointer lock on canvas click for FPS-style mouse look
canvas.addEventListener('click', () => { canvas.requestPointerLock?.(); });

// ── Lighting ──────────────────────────────────────────────────────────────────
const sun = new BABYLON.HemisphericLight('sun', new BABYLON.Vector3(0.4, 1, 0.2), scene);
sun.intensity = 1.0;
sun.diffuse   = new BABYLON.Color3(1, 0.98, 0.9);

// ── Fog ───────────────────────────────────────────────────────────────────────
scene.fogMode    = BABYLON.Scene.FOGMODE_LINEAR;
scene.fogColor   = new BABYLON.Color3(0.53, 0.81, 0.98);
scene.fogStart   = 50;
scene.fogEnd     = QUALITY_PRESETS[currentQuality].fogEnd;

// ── Skybox (simple solid-colour backdrop via background colour) ───────────────
// Replace with a CubeTexture skybox once you have assets.

// ── Terrain mesh builder ──────────────────────────────────────────────────────
/**
 * Build a flat grid mesh and displace each vertex Y by the heightmap.
 * @param {number}   size     grid resolution (e.g. 64 → 64×64 quads)
 * @param {number[]} heights  row-major float array of length size*size
 */
function buildTerrain(size, heights) {
  // Babylon's MeshBuilder.CreateGround builds a subdivided plane.
  // We then push each vertex Y using the heights array.
  const ground = BABYLON.MeshBuilder.CreateGround(
    'terrain',
    { width: size, height: size, subdivisions: size - 1, updatable: true },
    scene
  );

  const positions = ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);

  // The ground is centred at origin; shift so X/Z go 0…size
  for (let i = 0; i < positions.length; i += 3) {
    const wx = positions[i]     + size / 2; // world X → grid col
    const wz = positions[i + 2] + size / 2; // world Z → grid row
    const col = Math.round(wx * (size - 1) / size);
    const row = Math.round(wz * (size - 1) / size);
    const idx = Math.max(0, Math.min(size * size - 1, row * size + col));
    positions[i + 1] = (heights[idx] ?? 0) * HEIGHT_SCALE;
  }

  ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
  ground.bakeCurrentTransformIntoVertices();

  // Recompute normals for correct lighting after displacement
  const indices   = ground.getIndices();
  const normals   = [];
  BABYLON.VertexData.ComputeNormals(positions, indices, normals);
  ground.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals);

  // Simple green material
  const mat = new BABYLON.StandardMaterial('terrainMat', scene);
  mat.diffuseColor  = new BABYLON.Color3(0.3, 0.55, 0.2);
  mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
  ground.material   = mat;

  return ground;
}

// ── HUD update ────────────────────────────────────────────────────────────────
scene.registerBeforeRender(() => {
  fpsEl.textContent = engine.getFps().toFixed(1);
  const p = camera.position;
  posEl.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
});

// ── Quality selector ──────────────────────────────────────────────────────────
qualSel.addEventListener('change', () => {
  currentQuality  = qualSel.value;
  scene.fogEnd    = QUALITY_PRESETS[currentQuality].fogEnd;
  // TODO: swap shadow-map resolution, LOD distances, etc. as features are added
});

// ── Render loop ───────────────────────────────────────────────────────────────
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());

// ── Main: request terrain from Python generator ───────────────────────────────
(async () => {
  try {
    statusEl.textContent = 'Generating terrain…';

    // window.api is exposed by src/preload.js via contextBridge.
    // Change { seed, size } to alter the generated world.
    const data = await window.api.generateTerrain({ seed: TERRAIN_SEED, size: TERRAIN_SIZE });

    if (!data || !Array.isArray(data.heights)) {
      throw new Error('Generator returned unexpected payload: ' + JSON.stringify(data));
    }

    buildTerrain(data.size ?? TERRAIN_SIZE, data.heights);

    statusEl.textContent = 'Ready – click canvas for pointer lock';
    setTimeout(() => { statusEl.style.opacity = '0'; }, 3000);
  } catch (err) {
    console.error('[renderer] terrain generation failed:', err);
    statusEl.textContent = `Error: ${err.message}`;
    statusEl.style.background = 'rgba(160,0,0,0.8)';
  }
})();
