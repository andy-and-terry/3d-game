/**
 * src/main.js – Electron main process
 *
 * Responsibilities:
 *  - Create the BrowserWindow with contextIsolation + preload
 *  - Handle the 'generate-terrain' IPC call by spawning the Python generator
 *    (gen/generator.py) and communicating via stdin/stdout JSON.
 *
 * python_embed note:
 *  If you use an embedded Python runtime, replace the `spawn('python', …)`
 *  call below with the path to your embedded interpreter, e.g.:
 *    spawn(path.join(process.resourcesPath, 'python_embed', 'python.exe'), […])
 */

'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const GENERATOR_TIMEOUT_MS = 30_000; // 30 s – increase for large worlds

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
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * IPC handler: 'generate-terrain'
 *
 * Expected opts: { seed: <number>, size: <number> }
 * Returns: { size: <number>, heights: <number[]> }
 *
 * The Python script reads one JSON line from stdin and writes one JSON line
 * to stdout. stderr is captured and surfaced in the rejection message.
 */
ipcMain.handle('generate-terrain', (_event, opts) => {
  return new Promise((resolve, reject) => {
    // --- swap this path / executable for python_embed ---
    const pythonExe = 'python';
    const scriptPath = path.join(__dirname, '..', 'gen', 'generator.py');

    const py = spawn(pythonExe, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        py.kill();
        reject(new Error(`generate-terrain timed out after ${GENERATOR_TIMEOUT_MS} ms`));
      }
    }, GENERATOR_TIMEOUT_MS);

    py.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    py.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    py.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to start Python: ${err.message}`));
      }
    });

    py.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`generator.py exited with code ${code}. stderr: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse generator output: ${e.message}. stdout: "${stdout}"`));
      }
    });

    // Send request to the generator via stdin
    py.stdin.write(JSON.stringify(opts) + '\n');
    py.stdin.end();
  });
});
