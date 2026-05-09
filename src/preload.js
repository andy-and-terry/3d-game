const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Terrain generation
  generateTerrain: (opts) => ipcRenderer.invoke('generate-terrain', opts),

  // Worlds management (channel names and arg order match worlds_manager.js)
  worlds: {
    listWorlds:     async ()                     => ipcRenderer.invoke('worlds:list'),
    createWorld:    async (opts)                 => ipcRenderer.invoke('worlds:create', opts),
    importWorld:    async (filePath)             => ipcRenderer.invoke('worlds:import', filePath),
    exportWorld:    async (worldId, outPath)     => ipcRenderer.invoke('worlds:export', worldId, outPath),
    duplicateWorld: async (worldId)              => ipcRenderer.invoke('worlds:duplicate', worldId),
    renameWorld:    async (worldId, newName)     => ipcRenderer.invoke('worlds:rename', worldId, newName),
    deleteWorld:    async (worldId)              => ipcRenderer.invoke('worlds:delete', worldId),
    getSettings:    async (worldId)              => ipcRenderer.invoke('worlds:get-settings', worldId),
    setSettings:    async (worldId, settings)    => ipcRenderer.invoke('worlds:set-settings', worldId, settings),
  },

  // File dialogs
  dialog: {
    openFile: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
    saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  },
});
