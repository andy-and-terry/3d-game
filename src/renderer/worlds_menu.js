/**
 * worlds_menu.js
 * Handles the Worlds Menu UI: list, create, import, export,
 * duplicate, rename, delete, settings/add-on management.
 *
 * Calls window.api.worlds.* (provided by preload.js).
 * Degrades gracefully if the API is not yet available.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ //
  //  API guard — show friendly message if core IPC is missing           //
  // ------------------------------------------------------------------ //
  const api = (typeof window !== 'undefined' && window.api && window.api.worlds)
    ? window.api.worlds
    : null;

  const dialogApi = (typeof window !== 'undefined' && window.api && window.api.dialog)
    ? window.api.dialog
    : null;

  if (!api) {
    // Show a banner but let the rest of the UI be visible
    const banner = document.createElement('div');
    banner.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:999;padding:10px 20px;' +
      'background:#4a1010;color:#ffaaaa;font-size:13px;text-align:center;';
    banner.textContent =
      '⚠ Core IPC API (window.api.worlds) is not available. ' +
      'Please ensure the main process is running with the worlds handlers. ' +
      'Operations will fail until the API is present.';
    document.body.prepend(banner);
  }

  // ------------------------------------------------------------------ //
  //  State                                                               //
  // ------------------------------------------------------------------ //
  let worlds = [];
  let selectedWorldId = null;

  // ------------------------------------------------------------------ //
  //  DOM refs                                                            //
  // ------------------------------------------------------------------ //
  const worldList       = document.getElementById('world-list');
  const emptyState      = document.getElementById('empty-state');
  const worldCount      = document.getElementById('world-count');
  const statusMsg       = document.getElementById('status-msg');

  // Toolbar buttons
  const btnNew          = document.getElementById('btn-new');
  const btnImport       = document.getElementById('btn-import');
  const btnExport       = document.getElementById('btn-export');
  const btnDuplicate    = document.getElementById('btn-duplicate');
  const btnRename       = document.getElementById('btn-rename');
  const btnSettings     = document.getElementById('btn-settings');
  const btnDelete       = document.getElementById('btn-delete');
  const btnRefresh      = document.getElementById('btn-refresh');

  // Modals
  const modalNew        = document.getElementById('modal-new');
  const modalRename     = document.getElementById('modal-rename');
  const modalSettings   = document.getElementById('modal-settings');

  // File import hidden input
  const fileImportInput = document.getElementById('file-import-input');

  // ------------------------------------------------------------------ //
  //  Status helpers                                                      //
  // ------------------------------------------------------------------ //
  let _statusTimer = null;
  function setStatus(msg, type, duration) {
    statusMsg.textContent = msg;
    statusMsg.className = type || '';
    clearTimeout(_statusTimer);
    if (duration !== 0) {
      _statusTimer = setTimeout(() => {
        statusMsg.textContent = 'Ready';
        statusMsg.className = '';
      }, duration || 4000);
    }
  }

  function setStatusOk(msg)  { setStatus(msg, 'ok'); }
  function setStatusErr(msg) { setStatus(msg, 'error', 6000); }

  // ------------------------------------------------------------------ //
  //  Selection                                                           //
  // ------------------------------------------------------------------ //
  function selectedWorld() {
    return worlds.find(w => w.id === selectedWorldId) || null;
  }

  function updateToolbar() {
    const hasSel = !!selectedWorldId;
    btnExport.disabled    = !hasSel;
    btnDuplicate.disabled = !hasSel;
    btnRename.disabled    = !hasSel;
    btnSettings.disabled  = !hasSel;
    btnDelete.disabled    = !hasSel;
  }

  function selectWorld(id) {
    selectedWorldId = id;
    document.querySelectorAll('.world-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === id);
    });
    updateToolbar();
  }

  // ------------------------------------------------------------------ //
  //  Emoji "thumbnail" based on seed                                     //
  // ------------------------------------------------------------------ //
  const THUMBS = ['🌲', '🏔', '🌊', '🌾', '🏜', '❄', '🌋', '🌿'];
  function seedEmoji(seed) { return THUMBS[Math.abs(seed || 0) % THUMBS.length]; }

  function formatDate(iso) {
    if (!iso) return 'Never';
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return iso; }
  }

  // ------------------------------------------------------------------ //
  //  Render world list                                                   //
  // ------------------------------------------------------------------ //
  function renderWorlds() {
    worldList.innerHTML = '';

    if (!worlds.length) {
      emptyState.classList.remove('hidden');
      worldCount.textContent = '0 worlds';
      return;
    }

    emptyState.classList.add('hidden');
    worldCount.textContent = worlds.length + ' world' + (worlds.length !== 1 ? 's' : '');

    worlds.forEach(w => {
      const card = document.createElement('div');
      card.className = 'world-card' + (w.id === selectedWorldId ? ' selected' : '');
      card.dataset.id = w.id;

      card.innerHTML = `
        <div class="world-thumb">${seedEmoji(w.seed)}</div>
        <div class="world-info">
          <div class="world-name" title="${escapeHtml(w.name)}">${escapeHtml(w.name)}</div>
          <div class="world-meta">
            <span>Seed: ${w.seed !== undefined ? w.seed : '—'}</span>
            <span>Last played: ${formatDate(w.lastPlayed)}</span>
            <span>Created: ${formatDate(w.createdAt)}</span>
          </div>
        </div>
        <div class="world-actions">
          <button class="btn-icon play" data-action="play"    title="Play">▶ Play</button>
          <button class="btn-icon"      data-action="dup"     title="Duplicate">⧉</button>
          <button class="btn-icon"      data-action="rename"  title="Rename">✏</button>
          <button class="btn-icon"      data-action="settings" title="Settings">⚙</button>
          <button class="btn-icon del"  data-action="delete"  title="Delete">🗑</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
        if (action) {
          e.stopPropagation();
          handleCardAction(action, w.id);
        } else {
          selectWorld(w.id);
        }
      });

      worldList.appendChild(card);
    });

    updateToolbar();
  }

  function handleCardAction(action, worldId) {
    selectWorld(worldId);
    switch (action) {
      case 'play':     playWorld(worldId);           break;
      case 'dup':      duplicateWorld(worldId);       break;
      case 'rename':   openRenameModal(worldId);      break;
      case 'settings': openSettingsModal(worldId);    break;
      case 'delete':   confirmDeleteWorld(worldId);   break;
    }
  }

  // ------------------------------------------------------------------ //
  //  Load / refresh worlds                                               //
  // ------------------------------------------------------------------ //
  async function loadWorlds() {
    setStatus('Loading worlds…', '', 0);
    try {
      if (!api) throw new Error('window.api.worlds not available');
      worlds = await api.listWorlds();
    } catch (err) {
      worlds = [];
      setStatusErr('Failed to load worlds: ' + err.message);
    }
    selectedWorldId = null;
    renderWorlds();
    updateToolbar();
    if (api) setStatus('Ready');
  }

  // ------------------------------------------------------------------ //
  //  Play a world                                                        //
  // ------------------------------------------------------------------ //
  function playWorld(worldId) {
    const w = worlds.find(x => x.id === worldId);
    if (!w) return;
    // If opened from the game window (opener), trigger terrain load there
    if (window.opener && window.opener.gameAPI) {
      window.opener.gameAPI.loadTerrain(w.seed);
      window.close();
    } else {
      setStatusOk(`▶ Playing "${w.name}" (seed: ${w.seed})`);
    }
  }

  // ------------------------------------------------------------------ //
  //  New World modal                                                     //
  // ------------------------------------------------------------------ //
  function openNewModal() {
    document.getElementById('new-world-name').value = '';
    randomizeSeed();
    modalNew.classList.remove('hidden');
    document.getElementById('new-world-name').focus();
  }
  function closeNewModal() { modalNew.classList.add('hidden'); }

  function randomizeSeed() {
    document.getElementById('new-world-seed').value =
      Math.floor(Math.random() * 2147483647);
  }

  async function createWorld() {
    const name = document.getElementById('new-world-name').value.trim() || 'New World';
    const seedVal = document.getElementById('new-world-seed').value;
    const seed = seedVal !== '' ? parseInt(seedVal, 10) : Math.floor(Math.random() * 2147483647);

    closeNewModal();
    setStatus('Creating world…', '', 0);
    try {
      if (!api) throw new Error('window.api.worlds not available');
      const w = await api.createWorld({ name, seed, settings: {} });
      worlds.push(w);
      renderWorlds();
      selectWorld(w.id);
      setStatusOk(`✓ Created "${w.name}"`);
    } catch (err) {
      setStatusErr('Failed to create world: ' + err.message);
    }
  }

  // ------------------------------------------------------------------ //
  //  Import                                                              //
  // ------------------------------------------------------------------ //
  async function importWorld() {
    // Try native file dialog (Electron) first
    if (dialogApi) {
      try {
        const result = await dialogApi.openFile({
          title: 'Import World',
          filters: [{ name: 'World Files', extensions: ['world', 'json'] }],
          properties: ['openFile']
        });
        if (result.canceled || !result.filePaths.length) return;
        const filePath = result.filePaths[0];
        await doImport(filePath);
        return;
      } catch (err) {
        console.warn('Dialog API failed, falling back to file input:', err);
      }
    }
    // Fallback: use a hidden <input type="file">
    fileImportInput.click();
  }

  async function doImport(filePath) {
    setStatus('Importing…', '', 0);
    try {
      if (!api) throw new Error('window.api.worlds not available');
      const w = await api.importWorld(filePath);
      worlds.push(w);
      renderWorlds();
      selectWorld(w.id);
      setStatusOk(`✓ Imported "${w.name}"`);
    } catch (err) {
      setStatusErr('Import failed: ' + err.message);
    }
  }

  // File input fallback for import
  fileImportInput.addEventListener('change', async () => {
    const file = fileImportInput.files[0];
    if (!file) return;
    fileImportInput.value = '';

    // Read file contents and pass the path (Electron exposes .path on File objects)
    const filePath = file.path || file.name;
    if (file.path) {
      await doImport(file.path);
    } else {
      // Browser fallback: read content and use the import API with a temp approach
      setStatusErr('Cannot import: file system path unavailable. Please run in Electron.');
    }
  });

  // ------------------------------------------------------------------ //
  //  Export                                                              //
  // ------------------------------------------------------------------ //
  async function exportWorld(worldId) {
    const w = worlds.find(x => x.id === worldId);
    if (!w) return;

    let outPath;

    if (dialogApi) {
      try {
        const result = await dialogApi.saveFile({
          title: 'Export World',
          defaultPath: w.name.replace(/[^a-z0-9_\-]/gi, '_') + '.world',
          filters: [{ name: 'World Files', extensions: ['world'] }]
        });
        if (result.canceled) return;
        outPath = result.filePath;
      } catch (err) {
        setStatusErr('Could not open save dialog: ' + err.message);
        return;
      }
    } else {
      outPath = prompt('Enter output file path:', w.name + '.world');
      if (!outPath) return;
    }

    setStatus('Exporting…', '', 0);
    try {
      if (!api) throw new Error('window.api.worlds not available');
      await api.exportWorld(worldId, outPath);
      setStatusOk(`✓ Exported "${w.name}" → ${outPath}`);
    } catch (err) {
      setStatusErr('Export failed: ' + err.message);
    }
  }

  // ------------------------------------------------------------------ //
  //  Duplicate                                                           //
  // ------------------------------------------------------------------ //
  async function duplicateWorld(worldId) {
    setStatus('Duplicating…', '', 0);
    try {
      if (!api) throw new Error('window.api.worlds not available');
      const w = await api.duplicateWorld(worldId);
      worlds.push(w);
      renderWorlds();
      selectWorld(w.id);
      setStatusOk(`✓ Duplicated as "${w.name}"`);
    } catch (err) {
      setStatusErr('Duplicate failed: ' + err.message);
    }
  }

  // ------------------------------------------------------------------ //
  //  Rename modal                                                        //
  // ------------------------------------------------------------------ //
  function openRenameModal(worldId) {
    const w = worlds.find(x => x.id === worldId);
    if (!w) return;
    document.getElementById('rename-input').value = w.name;
    modalRename.classList.remove('hidden');
    document.getElementById('rename-input').focus();
    modalRename._worldId = worldId;
  }
  function closeRenameModal() { modalRename.classList.add('hidden'); }

  async function renameWorld() {
    const worldId = modalRename._worldId;
    const newName = document.getElementById('rename-input').value.trim();
    if (!newName) { setStatusErr('Name cannot be empty.'); return; }
    closeRenameModal();
    setStatus('Renaming…', '', 0);
    try {
      if (!api) throw new Error('window.api.worlds not available');
      const updated = await api.renameWorld(worldId, newName);
      const idx = worlds.findIndex(x => x.id === worldId);
      if (idx !== -1) worlds[idx] = updated;
      renderWorlds();
      selectWorld(worldId);
      setStatusOk(`✓ Renamed to "${newName}"`);
    } catch (err) {
      setStatusErr('Rename failed: ' + err.message);
    }
  }

  // ------------------------------------------------------------------ //
  //  Delete                                                              //
  // ------------------------------------------------------------------ //
  async function confirmDeleteWorld(worldId) {
    const w = worlds.find(x => x.id === worldId);
    if (!w) return;
    if (!confirm(`Delete world "${w.name}"?\n\nThis action cannot be undone.`)) return;
    setStatus('Deleting…', '', 0);
    try {
      if (!api) throw new Error('window.api.worlds not available');
      await api.deleteWorld(worldId);
      worlds = worlds.filter(x => x.id !== worldId);
      if (selectedWorldId === worldId) selectedWorldId = null;
      renderWorlds();
      updateToolbar();
      setStatusOk(`✓ Deleted "${w.name}"`);
    } catch (err) {
      setStatusErr('Delete failed: ' + err.message);
    }
  }

  // ------------------------------------------------------------------ //
  //  Settings modal                                                      //
  // ------------------------------------------------------------------ //
  async function openSettingsModal(worldId) {
    const w = worlds.find(x => x.id === worldId);
    if (!w) return;

    document.querySelector('#modal-settings .modal h2').textContent =
      `⚙ Settings — ${w.name}`;

    let settings = {};
    let addons   = [];

    try {
      if (!api) throw new Error('window.api.worlds not available');
      const result = await api.getSettings(worldId);
      settings = result.settings || {};
      addons   = result.addons   || [];
    } catch (err) {
      setStatusErr('Could not load settings: ' + err.message);
    }

    // Populate fields
    const viewDist = settings.viewDistance ?? 500;
    const viewDistInput = document.getElementById('setting-view-dist');
    viewDistInput.value = viewDist;
    document.getElementById('setting-view-dist-val').textContent = viewDist;

    document.getElementById('setting-shadows').checked   = settings.shadows   !== false;
    document.getElementById('setting-fog').checked       = settings.fog       !== false;
    document.getElementById('setting-difficulty').value  = settings.difficulty || 'normal';
    document.getElementById('setting-cheats').checked    = !!settings.cheats;

    // Addons
    const addonsList = document.getElementById('addons-list');
    if (!addons.length) {
      addonsList.innerHTML = '<p class="no-addons">No add-ons installed for this world.</p>';
    } else {
      addonsList.innerHTML = addons.map((addon, i) => `
        <div class="addon-row" data-addon-index="${i}">
          <div>
            <div class="addon-name">${escapeHtml(addon.name || addon.file || 'Unknown Add-on')}</div>
            <div class="addon-meta">${escapeHtml(addon.file || '')} ${addon.version ? 'v' + addon.version : ''}</div>
          </div>
          <input type="checkbox" class="addon-toggle" data-index="${i}"
            ${addon.enabled !== false ? 'checked' : ''} />
        </div>
      `).join('');
    }

    modalSettings.classList.remove('hidden');
    modalSettings._worldId = worldId;
    modalSettings._addons  = addons;
  }

  function closeSettingsModal() { modalSettings.classList.add('hidden'); }

  async function saveSettings() {
    const worldId = modalSettings._worldId;
    const addons  = modalSettings._addons || [];

    // Read toggle states for addons
    document.querySelectorAll('.addon-toggle').forEach(cb => {
      const idx = parseInt(cb.dataset.index, 10);
      if (addons[idx]) addons[idx].enabled = cb.checked;
    });

    const viewDist = parseInt(document.getElementById('setting-view-dist').value, 10);
    const settings = {
      viewDistance: viewDist,
      shadows:      document.getElementById('setting-shadows').checked,
      fog:          document.getElementById('setting-fog').checked,
      difficulty:   document.getElementById('setting-difficulty').value,
      cheats:       document.getElementById('setting-cheats').checked,
      addons
    };

    closeSettingsModal();
    setStatus('Saving settings…', '', 0);
    try {
      if (!api) throw new Error('window.api.worlds not available');
      await api.setSettings(worldId, settings);
      const idx = worlds.findIndex(x => x.id === worldId);
      if (idx !== -1) worlds[idx].settings = settings;
      setStatusOk('✓ Settings saved');
    } catch (err) {
      setStatusErr('Failed to save settings: ' + err.message);
    }
  }

  // ------------------------------------------------------------------ //
  //  Utility                                                             //
  // ------------------------------------------------------------------ //
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ------------------------------------------------------------------ //
  //  Event wiring                                                        //
  // ------------------------------------------------------------------ //

  // Toolbar
  btnNew.addEventListener('click',       openNewModal);
  btnImport.addEventListener('click',    importWorld);
  btnExport.addEventListener('click',    () => { if (selectedWorldId) exportWorld(selectedWorldId); });
  btnDuplicate.addEventListener('click', () => { if (selectedWorldId) duplicateWorld(selectedWorldId); });
  btnRename.addEventListener('click',    () => { if (selectedWorldId) openRenameModal(selectedWorldId); });
  btnSettings.addEventListener('click',  () => { if (selectedWorldId) openSettingsModal(selectedWorldId); });
  btnDelete.addEventListener('click',    () => { if (selectedWorldId) confirmDeleteWorld(selectedWorldId); });
  btnRefresh.addEventListener('click',   loadWorlds);

  // New world modal
  document.getElementById('btn-new-cancel').addEventListener('click',   closeNewModal);
  document.getElementById('btn-new-create').addEventListener('click',   createWorld);
  document.getElementById('btn-randomize-seed').addEventListener('click', randomizeSeed);

  // Rename modal
  document.getElementById('btn-rename-cancel').addEventListener('click', closeRenameModal);
  document.getElementById('btn-rename-ok').addEventListener('click',     renameWorld);

  // Settings modal
  document.getElementById('btn-settings-cancel').addEventListener('click', closeSettingsModal);
  document.getElementById('btn-settings-save').addEventListener('click',   saveSettings);

  // View distance slider live update
  document.getElementById('setting-view-dist').addEventListener('input', function () {
    document.getElementById('setting-view-dist-val').textContent = this.value;
  });

  // Close modals on backdrop click
  [modalNew, modalRename, modalSettings].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });

  // Enter key submits forms
  document.getElementById('new-world-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createWorld();
  });
  document.getElementById('rename-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') renameWorld();
  });

  // Escape closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      [modalNew, modalRename, modalSettings].forEach(m => m.classList.add('hidden'));
    }
  });

  // ------------------------------------------------------------------ //
  //  Init                                                                //
  // ------------------------------------------------------------------ //
  loadWorlds();
})();
