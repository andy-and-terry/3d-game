const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  worlds: {
    listWorlds: async () => ipcRenderer.invoke('worlds:list'),
    createWorld: async (opts) => ipcRenderer.invoke('worlds:create', opts),
    importWorld: async (filePath) => ipcRenderer.invoke('worlds:import', filePath),
    exportWorld: async (worldId, outPath) => ipcRenderer.invoke('worlds:export', worldId, outPath),
    duplicateWorld: async (worldId) => ipcRenderer.invoke('worlds:duplicate', worldId),
    renameWorld: async (worldId, newName) => ipcRenderer.invoke('worlds:rename', worldId, newName),
    deleteWorld: async (worldId) => ipcRenderer.invoke('worlds:delete', worldId),
    getSettings: async (worldId) => ipcRenderer.invoke('worlds:get-settings', worldId),
    setSettings: async (worldId, settings) => ipcRenderer.invoke('worlds:set-settings', worldId, settings),
  },
  ai: {
    evaluate: async (payload) => ipcRenderer.invoke('ai:evaluate', payload),
  },
  tick: {
    getState: async () => ipcRenderer.invoke('tick:get-state'),
    pause: async () => ipcRenderer.invoke('tick:pause'),
    resume: async () => ipcRenderer.invoke('tick:resume'),
    setPaused: async (paused) => ipcRenderer.invoke('tick:set-paused', paused),
    jumpToMorning: async () => ipcRenderer.invoke('tick:jump-to-morning'),
    jumpToNight: async () => ipcRenderer.invoke('tick:jump-to-night'),
    sleepToMorning: async (payload) => ipcRenderer.invoke('tick:sleep-to-morning', payload),
  },
});
