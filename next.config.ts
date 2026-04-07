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
  env: {
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
  },
  output: 'standalone',
  outputFileTracingExcludes: {
    '*': ['./release/**'],
  },
  reactStrictMode: true,
  i18n: {
    locales: ['en', 'ko', 'ja', 'zh-CN', 'es', 'de', 'fr', 'pt-BR', 'zh-TW', 'ru', 'tr'],
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
