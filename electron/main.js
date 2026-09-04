const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const childProcess = require('child_process');
const { parse } = require('url');
const next = require('next');

function getRemotionCompositorFFmpegPath() {
  let baseAppDir = process.cwd();
  try {
    if (app && typeof app.getAppPath === 'function') {
      baseAppDir = app.getAppPath();
    }
  } catch (e) {}

  let candidate = path.join(baseAppDir, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
  if (candidate.includes('app.asar')) {
    candidate = candidate.replace('app.asar', 'app.asar.unpacked');
  }
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return null;
}

// Auto-redirect any executable spawn calls pointing inside app.asar to app.asar.unpacked
// AND ensure Remotion uses its custom compositor ffmpeg.exe (which supports libfdk_aac)
function fixAsarPath(file) {
  if (typeof file === 'string') {
    if (file.includes('app.asar')) {
      const unpacked = file.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(unpacked)) {
        return unpacked;
      }
    }

    if (file === 'ffmpeg' || file === 'ffmpeg.exe') {
      const compositorFmpeg = getRemotionCompositorFFmpegPath();
      if (compositorFmpeg && fs.existsSync(compositorFmpeg)) {
        return compositorFmpeg;
      }
    }
  }
  return file;
}

function fixArgs(args) {
  if (!Array.isArray(args)) return args;
  return args.map((arg) => {
    if (typeof arg === 'string' && arg.includes('app.asar')) {
      const unpacked = arg.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(unpacked)) {
        return unpacked;
      }
    }
    return arg;
  });
}

function fixOptions(options) {
  if (!options) return options;
  const newOpts = Object.assign({}, options);
  if (typeof newOpts.cwd === 'string') {
    if (newOpts.cwd.includes('app.asar')) {
      newOpts.cwd = newOpts.cwd.replace('app.asar', 'app.asar.unpacked');
    }
    if (!fs.existsSync(newOpts.cwd)) {
      try {
        fs.mkdirSync(newOpts.cwd, { recursive: true });
      } catch (e) {
        newOpts.cwd = process.env.REMOTION_TMPDIR || os.tmpdir();
      }
    }
  }
  return newOpts;
}

const originalSpawn = childProcess.spawn;
childProcess.spawn = function (command, args, options) {
  const fixedCommand = fixAsarPath(command);
  const fixedArgs = fixArgs(args);
  const fixedOptions = fixOptions(options);
  return originalSpawn.call(this, fixedCommand, fixedArgs, fixedOptions);
};

const originalSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = function (command, args, options) {
  const fixedCommand = fixAsarPath(command);
  const fixedArgs = fixArgs(args);
  const fixedOptions = fixOptions(options);
  return originalSpawnSync.call(this, fixedCommand, fixedArgs, fixedOptions);
};

const originalExecFile = childProcess.execFile;
childProcess.execFile = function (file, args, options, callback) {
  const fixedFile = fixAsarPath(file);
  const fixedArgs = fixArgs(args);
  const fixedOptions = fixOptions(options);
  return originalExecFile.call(this, fixedFile, fixedArgs, fixedOptions, callback);
};

function initWritableEnvironment() {
  let tempDir;
  try {
    if (app && typeof app.getPath === 'function') {
      tempDir = path.join(app.getPath('temp'), 'SVG-Video-Converter-Remotion');
    }
  } catch (e) {}

  if (!tempDir) {
    const baseAppData = process.env.LOCALAPPDATA || process.env.APPDATA || os.tmpdir();
    tempDir = path.join(baseAppData, 'SVG Video Converter', 'temp');
  }

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    process.chdir(tempDir);
  } catch (e) {
    console.warn('[Electron Main] Could not chdir to tempDir:', e);
  }

  process.env.REMOTION_TMPDIR = tempDir;
  process.env.TMPDIR = tempDir;
  process.env.TEMP = tempDir;
  process.env.TMP = tempDir;
  console.log('[Electron Main] Writable working directory initialized at:', tempDir);
}

function updatePathEnv() {
  let baseAppDir = process.cwd();
  try {
    if (app && typeof app.getAppPath === 'function') {
      baseAppDir = app.getAppPath();
    }
  } catch (e) {}

  let compositorDir = path.join(baseAppDir, 'node_modules', '@remotion', 'compositor-win32-x64-msvc');
  if (compositorDir.includes('app.asar')) {
    compositorDir = compositorDir.replace('app.asar', 'app.asar.unpacked');
  }
  let ffmpegInstDir = path.join(baseAppDir, 'node_modules', '@ffmpeg-installer', 'win32-x64');
  if (ffmpegInstDir.includes('app.asar')) {
    ffmpegInstDir = ffmpegInstDir.replace('app.asar', 'app.asar.unpacked');
  }

  const extraPaths = [compositorDir, ffmpegInstDir].filter(p => fs.existsSync(p));
  if (extraPaths.length > 0) {
    process.env.PATH = extraPaths.join(path.delimiter) + path.delimiter + (process.env.PATH || '');
    console.log('[Electron Main] Prepended unpacked binary directories to PATH:', extraPaths);
  }
}

initWritableEnvironment();
updatePathEnv();

const { renderVideoLocal, cancelCurrentRender } = require('./renderer-engine');

let mainWindow = null;
let integratedServer = null;

function checkServerReady(url, timeoutMs = 5000) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode < 500) {
          resolve(true);
        } else if (Date.now() - startTime < timeoutMs) {
          setTimeout(check, 300);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => {
        if (Date.now() - startTime < timeoutMs) {
          setTimeout(check, 300);
        } else {
          resolve(false);
        }
      });
    };
    check();
  });
}

function getAppUploadsDir() {
  let uploadsDir;
  try {
    if (app && typeof app.getPath === 'function') {
      uploadsDir = path.join(app.getPath('userData'), 'uploads');
    }
  } catch (e) {}

  if (!uploadsDir) {
    const baseAppData = process.env.APPDATA || process.env.HOME;
    if (baseAppData) {
      uploadsDir = path.join(baseAppData, 'SVG Video Converter', 'uploads');
    } else {
      uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
    }
  }

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

async function startIntegratedServer(port = 3000) {
  if (integratedServer) return;

  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
  const appDir = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..');

  const uploadsDir = getAppUploadsDir();

  console.log('[Electron Main] Preparing Next.js engine in-process (dev:', isDev, 'dir:', appDir, 'uploads:', uploadsDir, ')...');

  const nextApp = next({
    dev: isDev,
    dir: appDir,
    hostname: 'localhost',
    port,
  });

  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);

      // Serve /uploads/* requests directly from writable user AppData uploads folder
      if (parsedUrl.pathname && parsedUrl.pathname.startsWith('/uploads/')) {
        const filename = path.basename(parsedUrl.pathname);
        const filePath = path.join(getAppUploadsDir(), filename);

        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          const ext = path.extname(filename).toLowerCase();
          const contentType = ext === '.mov' ? 'video/quicktime' : ext === '.webm' ? 'video/webm' : 'video/mp4';

          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stat.size,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000, immutable',
          });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }

      // Serve /remotion-build/* static bundle files
      if (parsedUrl.pathname && parsedUrl.pathname.startsWith('/remotion-build')) {
        let relPath = parsedUrl.pathname.replace('/remotion-build', '');
        if (!relPath || relPath === '/') relPath = '/index.html';

        const baseAppDir = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..');
        let bundleDir = path.join(baseAppDir, 'remotion-build');
        if (bundleDir.includes('app.asar')) {
          const unpacked = bundleDir.replace('app.asar', 'app.asar.unpacked');
          if (fs.existsSync(unpacked)) {
            bundleDir = unpacked;
          }
        }
        if (!fs.existsSync(bundleDir)) {
          bundleDir = path.join(baseAppDir, 'public', 'remotion-build');
          if (bundleDir.includes('app.asar')) {
            const unpackedPublic = bundleDir.replace('app.asar', 'app.asar.unpacked');
            if (fs.existsSync(unpackedPublic)) {
              bundleDir = unpackedPublic;
            }
          }
        }

        const filePath = path.join(bundleDir, relPath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.wasm': 'application/wasm',
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
          });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('[Integrated Server] Error:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(port, 'localhost', (err) => {
      if (err) return reject(err);
      console.log(`[Integrated Server] Next.js HTTP server running on http://localhost:${port}`);
      resolve();
    });
  });

  integratedServer = server;
}

async function createWindow() {
  const logoPath = path.join(__dirname, '../public/logo.png');
  const appIcon = fs.existsSync(logoPath) ? logoPath : path.join(process.cwd(), 'public', 'logo.png');

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: 'SVG Video Converter Desktop',
    icon: appIcon,
    backgroundColor: '#090d16',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  let startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';

  const isReady = await checkServerReady(startUrl, 1000);
  if (!isReady) {
    console.log('[Electron Main] Starting integrated HTTP server...');
    await startIntegratedServer(3000);
  }

  console.log('[Electron Main] Loading URL:', startUrl);
  mainWindow.loadURL(startUrl).catch((err) => {
    console.error('[Electron Main] Failed to load URL, retrying in 2s...', err);
    setTimeout(() => {
      mainWindow.loadURL(startUrl);
    }, 2000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handler: Select local SVG file
ipcMain.handle('select-svg-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open SVG File',
    properties: ['openFile'],
    filters: [{ name: 'SVG Files', extensions: ['svg'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { canceled: false, filePath, content };
  } catch (err) {
    console.error('[IPC] Read file error:', err);
    return { canceled: true, error: err.message };
  }
});

// IPC Handler: Select output video destination path
ipcMain.handle('select-save-path', async (_event, defaultName = 'svg-video.mp4') => {
  const ext = path.extname(defaultName).replace('.', '') || 'mp4';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Rendered Video',
    defaultPath: defaultName,
    filters: [
      { name: 'Video Files', extensions: [ext, 'mp4', 'mov', 'webm'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  return { canceled: false, filePath: result.filePath };
});

// IPC Handler: Execute offline video render
ipcMain.handle('render-video-local', async (event, jobData) => {
  try {
    console.log('[IPC] Starting local render job for:', jobData.codec || 'h264');
    const result = await renderVideoLocal(jobData, ({ progress, status }) => {
      event.sender.send('render-progress', { progress, status });
    });
    return result;
  } catch (err) {
    console.error('[IPC] Render error:', err);
    return { success: false, error: err.message || 'Render failed' };
  }
});

ipcMain.handle('render-video', async (event, jobData) => {
  try {
    console.log('[IPC] Starting local render job for:', jobData.codec || 'h264');
    const result = await renderVideoLocal(jobData, ({ progress, status }) => {
      event.sender.send('render-progress', { progress, status });
    });
    return result;
  } catch (err) {
    console.error('[IPC] Render error:', err);
    return { success: false, error: err.message || 'Render failed' };
  }
});

// IPC Handler: Cancel active video render
ipcMain.handle('cancel-video-render', async () => {
  console.log('[IPC] Cancel render requested');
  const canceled = cancelCurrentRender();
  return { success: true, canceled };
});

// IPC Handler: Save rendered video file to user chosen path
ipcMain.handle('save-rendered-file', async (_event, { sourcePath, defaultName = 'svg-video.mp4' }) => {
  const ext = path.extname(defaultName).replace('.', '') || 'mp4';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Rendered Video File',
    defaultPath: defaultName,
    filters: [
      { name: 'Video Files', extensions: [ext, 'mp4', 'mov', 'webm'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  try {
    const filename = path.basename(sourcePath);
    let srcFile = path.isAbsolute(sourcePath) ? sourcePath : null;

    if (!srcFile || !fs.existsSync(srcFile)) {
      srcFile = path.join(getAppUploadsDir(), filename);
    }
    if (!fs.existsSync(srcFile)) {
      srcFile = path.resolve(process.cwd(), 'public', 'uploads', filename);
    }
    if (!fs.existsSync(srcFile)) {
      srcFile = path.resolve(process.cwd(), 'uploads', filename);
    }
    if (!fs.existsSync(srcFile)) {
      throw new Error(`Rendered file "${filename}" not found on disk.`);
    }

    fs.copyFileSync(srcFile, result.filePath);
    return { canceled: false, filePath: result.filePath };
  } catch (err) {
    console.error('[IPC] File save error:', err);
    return { canceled: true, error: err.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (integratedServer) {
    try { integratedServer.close(); } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (integratedServer) {
    try { integratedServer.close(); } catch (e) {}
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
