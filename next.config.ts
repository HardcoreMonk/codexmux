import { execSync } from 'child_process';
import type { NextConfig } from "next";

const commitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
})();

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  env: {
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
  },
  output: 'standalone',
  bundlePagesRouterDependencies: true,
  outputFileTracingExcludes: {
    '/*': [
      './release/**',
      './AGENTS.md',
      './README*.md',
      './next.config.ts',
      './tsconfig.tsbuildinfo',
      './tsup.config.ts',
      './vitest.config.ts',
      './docs/**',
      './.specs/**',
      './tests/**',
      './android/**',
      './android-web/**',
      './_site/**',
      './dist/**',
      './dist-electron/**',
    ],
  },
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['react-icons'],
  },
  i18n: {
    locales: ['en', 'ko'],
    defaultLocale: 'en',
    localeDetection: false,
  },
  headers: async () => [
    {
      source: '/fonts/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
  ],
};

export default nextConfig;
