(function (globalScope) {
  'use strict';

  const DAY_SECONDS = 24 * 60 * 60;
  const MIN_REFRESH_INTERVAL_MS = 250;
  const TICK_INTERVAL_HANDLE = '__simulationPanelTickInterval';

  function toSafeNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function formatTimeOfDay(seconds) {
    const wrapped = ((toSafeNumber(seconds, 0) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
    const hours = Math.floor(wrapped / 3600);
    const minutes = Math.floor((wrapped % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  function normalizeAiStates(states) {
    if (!Array.isArray(states) || states.length === 0) {
      return ['(none)'];
    }

    return states.map((entry, index) => {
      if (typeof entry === 'string') {
        return entry;
      }

      if (entry && typeof entry === 'object') {
        const id = entry.id || `entity-${index + 1}`;
        const state = entry.state || 'unknown';
        const action = entry.action || 'unknown';
        return `${id}: ${state} (${action})`;
      }

      return `entity-${index + 1}: unknown`;
    });
  }

  function initSimulationPanel(root, options = {}) {
    if (!root) return null;

    const tickApi = options.tickApi || (globalScope.api && globalScope.api.tick) || null;
    const state = {
      paused: false,
      timeMultiplier: 50,
      timeOfDaySeconds: 6 * 3600,
      aiStates: ['(none)'],
      statusText: 'Simulation running',
    };

    const els = {
      playPause: root.querySelector('#sim-play-pause-btn'),
      jumpMorning: root.querySelector('#sim-jump-morning-btn'),
      jumpNight: root.querySelector('#sim-jump-night-btn'),
      timeMultiplier: root.querySelector('#sim-time-multiplier'),
      timeOfDay: root.querySelector('#sim-time-of-day'),
      aiStates: root.querySelector('#sim-ai-states'),
      status: root.querySelector('#sim-status'),
    };

    function render() {
      if (els.playPause) {
        els.playPause.textContent = state.paused ? 'Play' : 'Pause';
      }

      if (els.timeMultiplier) {
        els.timeMultiplier.textContent = String(state.timeMultiplier);
      }

      if (els.timeOfDay) {
        els.timeOfDay.textContent = formatTimeOfDay(state.timeOfDaySeconds);
      }

      if (els.aiStates) {
        els.aiStates.textContent = state.aiStates.join('\n');
      }

      if (els.status) {
        els.status.textContent = state.statusText;
      }
    }

    async function refreshTickState() {
      if (!tickApi || typeof tickApi.getState !== 'function') {
        render();
        return state;
      }

      try {
        const remote = await tickApi.getState();
        state.paused = Boolean(remote && remote.paused);
        state.timeMultiplier = toSafeNumber(remote && remote.timeMultiplier, state.timeMultiplier);
        state.timeOfDaySeconds = toSafeNumber(remote && remote.timeOfDaySeconds, state.timeOfDaySeconds);
      } catch (_) {
        state.statusText = 'Simulation controls unavailable';
      }

      render();
      return state;
    }

    async function setPaused(paused) {
      if (!tickApi) {
        state.paused = Boolean(paused);
        render();
        return;
      }

      if (typeof tickApi.setPaused === 'function') {
        await tickApi.setPaused(Boolean(paused));
      } else if (paused && typeof tickApi.pause === 'function') {
        await tickApi.pause();
      } else if (!paused && typeof tickApi.resume === 'function') {
        await tickApi.resume();
      }

      await refreshTickState();
    }

    async function jumpToTime(target) {
      if (!tickApi) return;
      if (target === 'morning' && typeof tickApi.jumpToMorning === 'function') {
        await tickApi.jumpToMorning();
      }
      if (target === 'night' && typeof tickApi.jumpToNight === 'function') {
        await tickApi.jumpToNight();
      }
      await refreshTickState();
    }

    if (els.playPause) {
      els.playPause.addEventListener('click', async () => setPaused(!state.paused));
    }

    if (els.jumpMorning) {
      els.jumpMorning.addEventListener('click', async () => jumpToTime('morning'));
    }

    if (els.jumpNight) {
      els.jumpNight.addEventListener('click', async () => jumpToTime('night'));
    }

    const refreshIntervalMs = Math.max(MIN_REFRESH_INTERVAL_MS, toSafeNumber(options.refreshIntervalMs, 1000));
    if (root[TICK_INTERVAL_HANDLE]) {
      clearInterval(root[TICK_INTERVAL_HANDLE]);
    }

    const tickInterval = setInterval(() => {
      refreshTickState();
    }, refreshIntervalMs);
    root[TICK_INTERVAL_HANDLE] = tickInterval;

    render();
    refreshTickState();

    return {
      getState: () => ({ ...state, aiStates: [...state.aiStates] }),
      refreshTickState,
      setAiStates(nextStates) {
        state.aiStates = normalizeAiStates(nextStates);
        render();
      },
      setStatus(text) {
        state.statusText = typeof text === 'string' && text.trim() ? text.trim() : 'Simulation running';
        render();
      },
      destroy() {
        clearInterval(tickInterval);
        if (root[TICK_INTERVAL_HANDLE] === tickInterval) {
          root[TICK_INTERVAL_HANDLE] = null;
        }
      },
    };
  }

  const api = {
    initSimulationPanel,
    formatTimeOfDay,
    normalizeAiStates,
  };

  globalScope.simulationPanel = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
