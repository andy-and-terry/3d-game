/**
 * src/preload.js – contextBridge preload script
 *
 * Exposes a minimal safe API (window.api) to the renderer process so that
 * renderer code never has direct access to Node.js / Electron internals.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /**
   * Request terrain generation from the main process.
   *
   * @param {{ seed: number, size: number }} opts
   * @returns {Promise<{ size: number, heights: number[] }>}
   */
  generateTerrain: (opts) => ipcRenderer.invoke('generate-terrain', opts)
});
