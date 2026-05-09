const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const worldsManager = require('./worlds_manager');

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
  // Initialise the worlds manager — registers all worlds:* IPC handlers
  worldsManager.init(app);

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

// ---------- File dialog helpers ----------

ipcMain.handle('dialog:openFile', async (_event, opts) => {
  const result = await dialog.showOpenDialog(opts || {});
  return result;
});

ipcMain.handle('dialog:saveFile', async (_event, opts) => {
  const result = await dialog.showSaveDialog(opts || {});
  return result;
});
