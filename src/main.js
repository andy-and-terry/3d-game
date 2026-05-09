const { app, ipcMain } = require('electron');
const worldsManager = require('./worlds_manager');

const DAY_SECONDS = 24 * 60 * 60;
const MORNING_SECONDS = 6 * 60 * 60;
const NIGHT_SECONDS = 20 * 60 * 60;

const tickState = {
  paused: false,
  timeMultiplier: 50,
  timeOfDaySeconds: MORNING_SECONDS,
  lastUpdateMs: Date.now(),
};

function advanceTickClock(nowMs = Date.now()) {
  if (!tickState.paused) {
    const elapsedSeconds = Math.max(0, (nowMs - tickState.lastUpdateMs) / 1000);
    tickState.timeOfDaySeconds = (tickState.timeOfDaySeconds + elapsedSeconds * tickState.timeMultiplier) % DAY_SECONDS;
  }

  tickState.lastUpdateMs = nowMs;
}

function getTickSnapshot() {
  advanceTickClock();
  return {
    paused: tickState.paused,
    timeMultiplier: tickState.timeMultiplier,
    timeOfDaySeconds: tickState.timeOfDaySeconds,
  };
}

function setTickTime(seconds) {
  advanceTickClock();
  tickState.timeOfDaySeconds = ((Number(seconds) || 0) % DAY_SECONDS + DAY_SECONDS) % DAY_SECONDS;
  return getTickSnapshot();
}

function hashText(value) {
  const input = String(value || '');
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function evaluateRabbitPlan(payload) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const entityId = payload && payload.entityId ? payload.entityId : 'rabbit';
  const cycle = (nowSeconds + hashText(entityId)) % 4;
  const tickSnapshot = getTickSnapshot();
  const isNight = tickSnapshot.timeOfDaySeconds >= NIGHT_SECONDS || tickSnapshot.timeOfDaySeconds < MORNING_SECONDS;

  if (isNight) {
    return {
      state: 'resting',
      action: 'idle',
      durationMs: 2600,
    };
  }

  if (cycle === 0) {
    return {
      state: 'foraging',
      action: 'move',
      direction: { x: 1, z: 0.4 },
      speed: 1.4,
      durationMs: 1800,
    };
  }

  if (cycle === 1) {
    return {
      state: 'foraging',
      action: 'move',
      direction: { x: -0.7, z: 0.9 },
      speed: 1.2,
      durationMs: 1800,
    };
  }

  if (cycle === 2) {
    return {
      state: 'observing',
      action: 'idle',
      durationMs: 1200,
    };
  }

  return {
    state: 'hopping',
    action: 'move',
    direction: { x: 0.1, z: -1 },
    speed: 1.5,
    durationMs: 1500,
  };
}

function registerSimulationIpcHandlers(worldsService) {
  ipcMain.handle('ai:evaluate', async (_event, payload) => evaluateRabbitPlan(payload || {}));

  ipcMain.handle('tick:get-state', async () => getTickSnapshot());
  ipcMain.handle('tick:pause', async () => {
    advanceTickClock();
    tickState.paused = true;
    return getTickSnapshot();
  });
  ipcMain.handle('tick:resume', async () => {
    advanceTickClock();
    tickState.paused = false;
    return getTickSnapshot();
  });
  ipcMain.handle('tick:set-paused', async (_event, paused) => {
    advanceTickClock();
    tickState.paused = Boolean(paused);
    return getTickSnapshot();
  });
  ipcMain.handle('tick:jump-to-morning', async () => setTickTime(MORNING_SECONDS));
  ipcMain.handle('tick:jump-to-night', async () => setTickTime(NIGHT_SECONDS));
  ipcMain.handle('tick:sleep-to-morning', async (_event, payload = {}) => {
    const worldId = typeof payload.worldId === 'string' ? payload.worldId.trim() : '';
    const sleptAt = new Date().toISOString();
    const state = setTickTime(MORNING_SECONDS);

    let persisted = false;
    if (worldId && worldsService) {
      try {
        const currentSettings = worldsService.getWorldSettings(worldId);
        const nextSettings = { ...currentSettings, last_slept: sleptAt };
        worldsService.setWorldSettings(worldId, nextSettings);
        persisted = true;
      } catch (_) {
        persisted = false;
      }
    }

    return {
      ok: true,
      persisted,
      worldId: worldId || null,
      lastSlept: sleptAt,
      state,
    };
  });
}

app.whenReady().then(() => {
  const worldsService = worldsManager.init(app);
  registerSimulationIpcHandlers(worldsService);
});
