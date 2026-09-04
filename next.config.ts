import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: [
    '@remotion/renderer',
    '@remotion/bundler',
    'puppeteer',
  ],
};

export default nextConfig;

