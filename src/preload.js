const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Terrain generation
  generateTerrain: (opts) => ipcRenderer.invoke('generate-terrain', opts),

  // Worlds management
  worlds: {
    listWorlds:      ()                     => ipcRenderer.invoke('worlds:list'),
    createWorld:     (opts)                 => ipcRenderer.invoke('worlds:create', opts),
    deleteWorld:     (worldId)              => ipcRenderer.invoke('worlds:delete', worldId),
    renameWorld:     (worldId, newName)     => ipcRenderer.invoke('worlds:rename', { worldId, newName }),
    duplicateWorld:  (worldId)              => ipcRenderer.invoke('worlds:duplicate', worldId),
    getSettings:     (worldId)              => ipcRenderer.invoke('worlds:getSettings', worldId),
    setSettings:     (worldId, settings)    => ipcRenderer.invoke('worlds:setSettings', { worldId, settings }),
    exportWorld:     (worldId, outPath)     => ipcRenderer.invoke('worlds:export', { worldId, outPath }),
    importWorld:     (filePath)             => ipcRenderer.invoke('worlds:import', filePath)
  },

  // File dialogs
  dialog: {
    openFile: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
    saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts)
  }
});
