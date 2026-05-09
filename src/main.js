const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

// ---------- World Registry helpers ----------

function getWorldsDir() {
  return path.join(app.getPath('userData'), 'worlds');
}

function getRegistryPath() {
  return path.join(app.getPath('userData'), 'worlds_registry.json');
}

function loadRegistry() {
  const rp = getRegistryPath();
  if (!fs.existsSync(rp)) return { worlds: [] };
  try {
    return JSON.parse(fs.readFileSync(rp, 'utf8'));
  } catch {
    return { worlds: [] };
  }
}

function saveRegistry(reg) {
  fs.writeFileSync(getRegistryPath(), JSON.stringify(reg, null, 2), 'utf8');
}

function ensureWorldsDir() {
  const d = getWorldsDir();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

// ---------- Window creation ----------

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- Terrain generation IPC ----------

ipcMain.handle('generate-terrain', async (_event, opts) => {
  return new Promise((resolve, reject) => {
    // Determine python executable (supports python_embed layout)
    const pyExec = process.env.PYTHON_EXEC || 'python';
    const genScript = path.join(__dirname, '..', 'gen', 'generator.py');
    const py = spawn(pyExec, [genScript], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (d) => { stdout += d.toString(); });
    py.stderr.on('data', (d) => { stderr += d.toString(); });
    py.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || `Python exited ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error('Invalid JSON from generator: ' + stdout.slice(0, 200)));
      }
    });
    py.on('error', (err) => reject(err));
    py.stdin.write(JSON.stringify(opts));
    py.stdin.end();
  });
});

// ---------- Worlds IPC API ----------

ipcMain.handle('worlds:list', async () => {
  const reg = loadRegistry();
  return reg.worlds;
});

ipcMain.handle('worlds:create', async (_event, { name, seed, settings }) => {
  const reg = loadRegistry();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const worldDir = path.join(ensureWorldsDir(), id);
  fs.mkdirSync(worldDir, { recursive: true });

  const world = {
    id,
    name: name || 'New World',
    seed: seed ?? Math.floor(Math.random() * 2 ** 31),
    settings: settings || {},
    addons: [],
    createdAt: now,
    lastPlayed: null
  };
  // Write world meta
  fs.writeFileSync(path.join(worldDir, 'meta.json'), JSON.stringify(world, null, 2));
  reg.worlds.push(world);
  saveRegistry(reg);
  return world;
});

ipcMain.handle('worlds:delete', async (_event, worldId) => {
  const reg = loadRegistry();
  const idx = reg.worlds.findIndex((w) => w.id === worldId);
  if (idx === -1) throw new Error('World not found: ' + worldId);
  const worldDir = path.join(ensureWorldsDir(), worldId);
  if (fs.existsSync(worldDir)) fs.rmSync(worldDir, { recursive: true, force: true });
  reg.worlds.splice(idx, 1);
  saveRegistry(reg);
  return { ok: true };
});

ipcMain.handle('worlds:rename', async (_event, { worldId, newName }) => {
  const reg = loadRegistry();
  const world = reg.worlds.find((w) => w.id === worldId);
  if (!world) throw new Error('World not found: ' + worldId);
  world.name = newName;
  saveRegistry(reg);
  const metaPath = path.join(ensureWorldsDir(), worldId, 'meta.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.name = newName;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
  return world;
});

ipcMain.handle('worlds:duplicate', async (_event, worldId) => {
  const reg = loadRegistry();
  const src = reg.worlds.find((w) => w.id === worldId);
  if (!src) throw new Error('World not found: ' + worldId);

  const newId = crypto.randomUUID();
  const now = new Date().toISOString();
  const newWorld = { ...src, id: newId, name: src.name + ' (copy)', createdAt: now, lastPlayed: null };

  const srcDir = path.join(ensureWorldsDir(), worldId);
  const dstDir = path.join(ensureWorldsDir(), newId);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, dstDir, { recursive: true });
  } else {
    fs.mkdirSync(dstDir, { recursive: true });
  }
  fs.writeFileSync(path.join(dstDir, 'meta.json'), JSON.stringify(newWorld, null, 2));

  reg.worlds.push(newWorld);
  saveRegistry(reg);
  return newWorld;
});

ipcMain.handle('worlds:getSettings', async (_event, worldId) => {
  const reg = loadRegistry();
  const world = reg.worlds.find((w) => w.id === worldId);
  if (!world) throw new Error('World not found: ' + worldId);
  return { settings: world.settings || {}, addons: world.addons || [] };
});

ipcMain.handle('worlds:setSettings', async (_event, { worldId, settings }) => {
  const reg = loadRegistry();
  const world = reg.worlds.find((w) => w.id === worldId);
  if (!world) throw new Error('World not found: ' + worldId);
  world.settings = settings;
  saveRegistry(reg);
  const metaPath = path.join(ensureWorldsDir(), worldId, 'meta.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.settings = settings;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
  return world;
});

ipcMain.handle('worlds:export', async (_event, { worldId, outPath }) => {
  const reg = loadRegistry();
  const world = reg.worlds.find((w) => w.id === worldId);
  if (!world) throw new Error('World not found: ' + worldId);

  const worldDir = path.join(ensureWorldsDir(), worldId);
  // Build a simple payload: JSON meta + optional binary data as base64
  const payload = { meta: world, files: {} };

  if (fs.existsSync(worldDir)) {
    const entries = fs.readdirSync(worldDir);
    for (const entry of entries) {
      const full = path.join(worldDir, entry);
      if (fs.statSync(full).isFile()) {
        payload.files[entry] = fs.readFileSync(full).toString('base64');
      }
    }
  }

  const json = JSON.stringify(payload);
  fs.writeFileSync(outPath, json, 'utf8');
  return { ok: true, outPath };
});

ipcMain.handle('worlds:import', async (_event, filePath) => {
  if (!fs.existsSync(filePath)) throw new Error('File not found: ' + filePath);
  const raw = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw);

  const reg = loadRegistry();
  const newId = crypto.randomUUID();
  const now = new Date().toISOString();
  const world = {
    ...payload.meta,
    id: newId,
    name: (payload.meta.name || 'Imported World') + ' (imported)',
    createdAt: now,
    lastPlayed: null
  };

  const worldDir = path.join(ensureWorldsDir(), newId);
  fs.mkdirSync(worldDir, { recursive: true });

  if (payload.files) {
    for (const [name, b64] of Object.entries(payload.files)) {
      fs.writeFileSync(path.join(worldDir, name), Buffer.from(b64, 'base64'));
    }
  }
  fs.writeFileSync(path.join(worldDir, 'meta.json'), JSON.stringify(world, null, 2));

  reg.worlds.push(world);
  saveRegistry(reg);
  return world;
});

// File dialog helpers for import/export
ipcMain.handle('dialog:openFile', async (_event, opts) => {
  const result = await dialog.showOpenDialog(opts || {});
  return result;
});

ipcMain.handle('dialog:saveFile', async (_event, opts) => {
  const result = await dialog.showSaveDialog(opts || {});
  return result;
});
