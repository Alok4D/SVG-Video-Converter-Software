import { bundle } from '@remotion/bundler';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const entryPoint = path.resolve(__dirname, '../src/lib/video/remotion/index.ts');
  const tempOutDir = path.resolve(__dirname, '../remotion-build');
  const publicOutDir = path.resolve(__dirname, '../public/remotion-build');

  console.log('[Remotion Bundle] Building static production bundle into:', tempOutDir);

  if (fs.existsSync(tempOutDir)) {
    fs.rmSync(tempOutDir, { recursive: true, force: true });
  }
  if (fs.existsSync(publicOutDir)) {
    fs.rmSync(publicOutDir, { recursive: true, force: true });
  }

  // 1. Bundle to temporary root directory outside public/
  await bundle({
    entryPoint,
    outDir: tempOutDir,
    webpackOverride: (config) => {
      config.devtool = false;
      return config;
    },
  });

  // 2. Copy compiled static files into public/remotion-build for Next.js static file serving
  fs.cpSync(tempOutDir, publicOutDir, { recursive: true });

  console.log('[Remotion Bundle] Pre-built bundle generated successfully at:', tempOutDir, 'and', publicOutDir);
}

main().catch((err) => {
  console.error('[Remotion Bundle] Error during bundling:', err);
  process.exit(1);
});
