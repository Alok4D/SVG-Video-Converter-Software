const path = require('path');
const fs = require('fs');
const childProcess = require('child_process');

function getRemotionCompositorFFmpegPath() {
  let baseAppDir = process.cwd();
  try {
    const { app } = require('electron');
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
        const os = require('os');
        fs.mkdirSync(newOpts.cwd, { recursive: true });
      } catch (e) {
        const os = require('os');
        newOpts.cwd = process.env.REMOTION_TMPDIR || os.tmpdir();
      }
    }
  }
  return newOpts;
}

if (!childProcess._asarMonkeyPatched) {
  childProcess._asarMonkeyPatched = true;
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
}

function getAppTempDir() {
  let tempDir;
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      tempDir = path.join(app.getPath('temp'), 'SVG-Video-Converter-Remotion');
    }
  } catch (e) {}

  if (!tempDir) {
    const baseAppData = process.env.LOCALAPPDATA || process.env.APPDATA || process.env.HOME;
    if (baseAppData) {
      tempDir = path.join(baseAppData, 'SVG Video Converter', 'temp');
    } else {
      const os = require('os');
      tempDir = path.join(os.tmpdir(), 'SVG-Video-Converter-Remotion');
    }
  }

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

const appTempDir = getAppTempDir();
try {
  process.chdir(appTempDir);
} catch (e) {}

process.env.REMOTION_TMPDIR = appTempDir;
process.env.TMPDIR = appTempDir;
process.env.TEMP = appTempDir;
process.env.TMP = appTempDir;

function getFFmpegExecutablePath() {
  let baseDir = process.cwd();
  try {
    const { app } = require('electron');
    if (app && typeof app.getAppPath === 'function') {
      baseDir = app.getAppPath();
    }
  } catch (e) {}

  const candidates = [
    path.join(baseDir, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe'),
    path.join(baseDir, 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'),
  ];

  for (let candidate of candidates) {
    if (candidate.includes('app.asar')) {
      candidate = candidate.replace('app.asar', 'app.asar.unpacked');
    }
    if (fs.existsSync(candidate)) {
      console.log('[Electron Renderer Engine] Resolved unpacked FFmpeg binary:', candidate);
      return candidate;
    }
  }

  try {
    let installerPath = require('@ffmpeg-installer/ffmpeg').path;
    if (installerPath && installerPath.includes('app.asar')) {
      installerPath = installerPath.replace('app.asar', 'app.asar.unpacked');
    }
    if (fs.existsSync(installerPath)) {
      return installerPath;
    }
  } catch (e) {}

  return undefined;
}

const ffmpegBinaryPath = getFFmpegExecutablePath();
if (ffmpegBinaryPath) {
  process.env.REMOTION_FFMPEG_PATH = ffmpegBinaryPath;
  process.env.FFMPEG_PATH = ffmpegBinaryPath;
  console.log('[Electron Renderer Engine] Set REMOTION_FFMPEG_PATH =', ffmpegBinaryPath);
}

let cachedBundleLocation = null;
let bundlingPromise = null;
let currentCancelController = null;

function cancelCurrentRender() {
  if (currentCancelController) {
    console.log('[Electron Renderer Engine] Aborting active render job...');
    currentCancelController.abort();
    currentCancelController = null;
    return true;
  }
  return false;
}

async function getOrBuildBundle() {
  if (cachedBundleLocation) {
    return cachedBundleLocation;
  }

  const port = process.env.PORT || '3000';
  const httpBundleUrl = `http://localhost:${port}/remotion-build`;
  console.log('[Electron Renderer Engine] Using HTTP static bundle URL:', httpBundleUrl);
  cachedBundleLocation = httpBundleUrl;
  return httpBundleUrl;
}

function getAppUploadsDir() {
  let uploadsDir;
  try {
    const { app } = require('electron');
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

async function renderVideoLocal(jobData, onProgress) {
  const {
    svgCode,
    fps = 30,
    duration = 5,
    width = 1920,
    height = 1080,
    codec = 'h264',
    outputPath,
  } = jobData;

  const { renderMedia, selectComposition } = require('@remotion/renderer');

  const compositionId = 'SvgVideo';
  const outDir = getAppUploadsDir();

  const fileExt = codec === 'prores' ? 'mov' : codec === 'vp8' || codec === 'vp9' ? 'webm' : 'mp4';
  const finalOutputPath = outputPath || path.join(outDir, `svg-video-${Date.now()}.${fileExt}`);
  const durationInFrames = Math.max(1, Math.round(duration * fps));

  currentCancelController = new AbortController();
  const signal = currentCancelController.signal;

  try {
    if (onProgress) onProgress({ progress: 10, status: 'Preparing Remotion renderer...' });

    const bundleLocation = await getOrBuildBundle();
    if (signal.aborted) throw new Error('AbortError');

    if (onProgress) onProgress({ progress: 30, status: 'Configuring composition settings...' });

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: compositionId,
      inputProps: {
        svgCode,
        duration,
        fps,
        width,
        height,
      },
    });

    if (signal.aborted) throw new Error('AbortError');

    if (onProgress) onProgress({ progress: 40, status: 'Rendering frames...' });

    let selectedCodec = 'h264';
    let pixelFormat = 'yuv420p';

    if (codec === 'prores') {
      selectedCodec = 'prores';
      pixelFormat = 'yuv422p10le';
    } else if (codec === 'vp8') {
      selectedCodec = 'vp8';
      pixelFormat = 'yuv420p';
    } else if (codec === 'vp9') {
      selectedCodec = 'vp9';
      pixelFormat = 'yuv420p';
    }

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: selectedCodec,
      pixelFormat,
      crf: selectedCodec === 'prores' ? undefined : 16,
      outputLocation: finalOutputPath,
      ffmpegExecutable: ffmpegBinaryPath,
      tmpDir: appTempDir,
      cancelSignal: () => signal.aborted,
      inputProps: {
        svgCode,
        duration,
        fps,
        width,
        height,
      },
      frameRange: [0, durationInFrames - 1],
      imageFormat: 'png',
      onProgress: ({ progress }) => {
        const currentProgress = 40 + Math.floor(progress * 55);
        const percentStr = Math.round(progress * 100);
        if (onProgress) {
          onProgress({
            progress: currentProgress,
            status: `Rendering frames (${percentStr}%)...`,
          });
        }
      },
    });

    if (onProgress) onProgress({ progress: 100, status: 'Video ready!' });

    let fileSize = '0 MB';
    if (fs.existsSync(finalOutputPath)) {
      const stats = fs.statSync(finalOutputPath);
      fileSize = `${(stats.size / (1024 * 1024)).toFixed(2)} MB`;
    }

    return {
      success: true,
      outputPath: finalOutputPath,
      fileSize,
    };
  } catch (err) {
    if (signal.aborted || err.message === 'AbortError' || err.name === 'AbortError') {
      console.log('[Electron Renderer Engine] Cleaned up aborted render job.');
      if (fs.existsSync(finalOutputPath)) {
        try { fs.unlinkSync(finalOutputPath); } catch(e) {}
      }
      return { success: false, canceled: true, error: 'Rendering cancelled by user' };
    }
    throw err;
  } finally {
    currentCancelController = null;
  }
}

module.exports = {
  renderVideoLocal,
  cancelCurrentRender,
};
