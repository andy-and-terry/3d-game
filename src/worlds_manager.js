const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ipcMain } = require('electron');

function init(app) {
  if (!app || typeof app.getPath !== 'function') {
    throw new Error('init(app) requires a valid Electron app instance');
  }

  const userDataPath = app.getPath('userData');
  const worldsDir = path.join(userDataPath, 'worlds');
  const registryPath = path.join(worldsDir, 'registry.json');

  ensureDir(worldsDir);
  ensureRegistry(registryPath);

  ipcMain.handle('worlds:list', async () => listWorlds());
  ipcMain.handle('worlds:create', async (_event, opts) => createWorld(opts));
  ipcMain.handle('worlds:import', async (_event, filePath) => importWorld(filePath));
  ipcMain.handle('worlds:export', async (_event, worldId, outPath) => exportWorld(worldId, outPath));
  ipcMain.handle('worlds:duplicate', async (_event, worldId) => duplicateWorld(worldId));
  ipcMain.handle('worlds:rename', async (_event, worldId, newName) => renameWorld(worldId, newName));
  ipcMain.handle('worlds:delete', async (_event, worldId) => deleteWorld(worldId));
  ipcMain.handle('worlds:get-settings', async (_event, worldId) => getWorldSettings(worldId));
  ipcMain.handle('worlds:set-settings', async (_event, worldId, settings) => setWorldSettings(worldId, settings));

  function listWorlds() {
    return loadRegistry();
  }

  function createWorld(opts = {}) {
    if (!isPlainObject(opts)) {
      throw new Error('createWorld options must be an object');
    }

    const name = normalizeWorldName(opts.name);
    const seed = normalizeSeed(opts.seed);
    const settings = isPlainObject(opts.settings) ? opts.settings : {};
    const addons = Array.isArray(opts.addons) ? opts.addons : [];
    const thumbnailBase64 = typeof opts.thumbnail_base64 === 'string' ? opts.thumbnail_base64 : undefined;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const world = {
      version: 1,
      id,
      name,
      seed,
      settings,
      addons,
      created_at: now,
      last_played: null,
    };

    if (thumbnailBase64) {
      world.thumbnail_base64 = thumbnailBase64;
    }

    writeWorldFile(id, world);
    writeSettingsFile(id, settings);

    const registry = loadRegistry();
    const metadata = buildMetadataFromWorld(world);
    registry.push(metadata);
    saveRegistry(registry);

    return { world: metadata };
  }

  function importWorld(filePath) {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
      throw new Error('filePath is required');
    }

    const inputPath = path.resolve(filePath);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`World file does not exist: ${inputPath}`);
    }

    const importedWorld = parseWorld(fs.readFileSync(inputPath, 'utf8'));
    validateWorldDocument(importedWorld);

    const registry = loadRegistry();
    const existingIds = new Set(registry.map((w) => w.id));

    let id = importedWorld.id;
    if (existingIds.has(id)) {
      id = crypto.randomUUID();
    }

    const now = new Date().toISOString();
    const world = {
      ...importedWorld,
      id,
      name: normalizeWorldName(importedWorld.name),
      created_at: importedWorld.created_at || now,
      last_played: importedWorld.last_played || null,
      settings: isPlainObject(importedWorld.settings) ? importedWorld.settings : {},
      addons: Array.isArray(importedWorld.addons) ? importedWorld.addons : [],
    };

    writeWorldFile(id, world);
    writeSettingsFile(id, world.settings);

    const metadata = buildMetadataFromWorld(world);
    registry.push(metadata);
    saveRegistry(registry);

    return { world: metadata };
  }

  function exportWorld(worldId, outPath) {
    const id = normalizeWorldId(worldId);
    if (typeof outPath !== 'string' || outPath.trim().length === 0) {
      throw new Error('outPath is required');
    }

    const world = readWorldById(id);
    const targetPath = path.resolve(outPath);
    ensureDir(path.dirname(targetPath));
    writeAtomicJson(targetPath, world);

    return { worldId: id, outPath: targetPath };
  }

  function duplicateWorld(worldId) {
    const sourceId = normalizeWorldId(worldId);
    const sourceWorld = readWorldById(sourceId);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const duplicatedWorld = {
      ...sourceWorld,
      id,
      name: `${sourceWorld.name} (Copy)`,
      created_at: now,
      last_played: null,
    };

    writeWorldFile(id, duplicatedWorld);
    const settings = getWorldSettings(sourceId);
    writeSettingsFile(id, settings);

    const registry = loadRegistry();
    const metadata = buildMetadataFromWorld(duplicatedWorld);
    registry.push(metadata);
    saveRegistry(registry);

    return { world: metadata };
  }

  function renameWorld(worldId, newName) {
    const id = normalizeWorldId(worldId);
    const normalizedName = normalizeWorldName(newName);
    const world = readWorldById(id);
    world.name = normalizedName;

    writeWorldFile(id, world);

    const registry = loadRegistry();
    const entry = registry.find((item) => item.id === id);
    entry.name = normalizedName;
    saveRegistry(registry);

    return { world: entry };
  }

  function deleteWorld(worldId) {
    const id = normalizeWorldId(worldId);
    const registry = loadRegistry();
    const nextRegistry = registry.filter((entry) => entry.id !== id);

    if (nextRegistry.length === registry.length) {
      throw new Error(`World not found: ${id}`);
    }

    const worldPath = getWorldFilePath(id);
    const settingsPath = getSettingsFilePath(id);

    safeDelete(worldPath);
    safeDelete(settingsPath);
    saveRegistry(nextRegistry);

    return { worldId: id, deleted: true };
  }

  function getWorldSettings(worldId) {
    const id = normalizeWorldId(worldId);
    ensureWorldExists(id);

    const settingsPath = getSettingsFilePath(id);
    if (!fs.existsSync(settingsPath)) {
      return {};
    }

    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      throw new Error(`Invalid settings document for world ${id}`);
    }

    return parsed;
  }

  function setWorldSettings(worldId, settings) {
    const id = normalizeWorldId(worldId);
    if (!isPlainObject(settings)) {
      throw new Error('settings must be an object');
    }

    const world = readWorldById(id);
    world.settings = settings;

    writeSettingsFile(id, settings);
    writeWorldFile(id, world);

    return { worldId: id, settings };
  }

  function loadRegistry() {
    const raw = fs.readFileSync(registryPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`worlds registry must be an array: ${registryPath}`);
    }
    return parsed;
  }

  function saveRegistry(registry) {
    writeAtomicJson(registryPath, registry);
  }

  function getWorldFilePath(worldId) {
    return path.join(worldsDir, `${worldId}.world`);
  }

  function getSettingsFilePath(worldId) {
    return path.join(worldsDir, `${worldId}.settings.json`);
  }

  function readWorldById(worldId) {
    ensureWorldExists(worldId);
    const worldPath = getWorldFilePath(worldId);
    if (!fs.existsSync(worldPath)) {
      throw new Error(`World file not found: ${worldPath}`);
    }
    const world = parseWorld(fs.readFileSync(worldPath, 'utf8'));
    validateWorldDocument(world);
    return world;
  }

  function writeWorldFile(worldId, world) {
    validateWorldDocument(world);
    writeAtomicJson(getWorldFilePath(worldId), world);
  }

  function writeSettingsFile(worldId, settings) {
    if (!isPlainObject(settings)) {
      throw new Error('settings must be an object');
    }
    writeAtomicJson(getSettingsFilePath(worldId), settings);
  }

  function ensureWorldExists(worldId) {
    const exists = loadRegistry().some((entry) => entry.id === worldId);
    if (!exists) {
      throw new Error(`World not found: ${worldId}`);
    }
  }

  function buildMetadataFromWorld(world) {
    return {
      id: world.id,
      name: world.name,
      seed: world.seed,
      created_at: world.created_at,
      last_played: world.last_played || null,
    };
  }

  return {
    listWorlds,
    createWorld,
    importWorld,
    exportWorld,
    duplicateWorld,
    renameWorld,
    deleteWorld,
    getWorldSettings,
    setWorldSettings,
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) {
    writeAtomicJson(registryPath, []);
    return;
  }

  const raw = fs.readFileSync(registryPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`worlds registry must be an array: ${registryPath}`);
  }
}

function writeAtomicJson(filePath, data) {
  const directory = path.dirname(filePath);
  ensureDir(directory);

  const tmpPath = path.join(
    directory,
    `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );

  const payload = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(tmpPath, payload, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function safeDelete(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function parseWorld(raw) {
  return JSON.parse(raw);
}

function validateWorldDocument(world) {
  if (!isPlainObject(world)) {
    throw new Error('World document must be an object');
  }

  if (world.version !== 1) {
    throw new Error(`Unsupported world version: expected 1, got ${world.version}`);
  }

  if (typeof world.id !== 'string' || world.id.trim().length === 0) {
    throw new Error('World id is required');
  }

  if (typeof world.name !== 'string' || world.name.trim().length === 0) {
    throw new Error('World name is required');
  }

  if (typeof world.seed !== 'string' && typeof world.seed !== 'number') {
    throw new Error(`World seed must be a string or number, got ${typeof world.seed}`);
  }

  if (!isPlainObject(world.settings)) {
    throw new Error('World settings must be an object');
  }

  if (!Array.isArray(world.addons)) {
    throw new Error('World addons must be an array');
  }

  if (typeof world.created_at !== 'string' || world.created_at.trim().length === 0) {
    throw new Error('World created_at is required');
  }

  if (world.last_played !== null && typeof world.last_played !== 'string') {
    throw new Error('World last_played must be null or ISO date string');
  }

  if (
    world.thumbnail_base64 !== undefined &&
    (
      typeof world.thumbnail_base64 !== 'string' ||
      world.thumbnail_base64.trim().length === 0
    )
  ) {
    throw new Error('thumbnail_base64 must be a non-empty base64 string when present');
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeWorldName(name) {
  if (typeof name !== 'string') {
    throw new Error('World name must be a string');
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('World name cannot be empty');
  }

  return trimmed;
}

function normalizeWorldId(worldId) {
  if (typeof worldId !== 'string' || worldId.trim().length === 0) {
    throw new Error('worldId is required');
  }

  return worldId.trim();
}

function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed;
  }

  if (typeof seed === 'string' && seed.trim().length > 0) {
    return seed.trim();
  }

  // Default to a timestamp seed when an explicit usable seed is not provided.
  return Date.now();
}

module.exports = {
  init,
};
