import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'server.ts',
    'workers/storage-worker': 'src/workers/storage-worker.ts',
    'workers/terminal-worker': 'src/workers/terminal-worker.ts',
  },
  format: ['cjs'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  external: ['next', 'react', 'react-dom', 'pino', 'pino-roll', 'pino-pretty', 'better-sqlite3', 'node-pty'],
  noExternal: ['web-push', 'jose', 'ws', 'nanoid', 'zod', 'diff'],
  esbuildOptions(options) {
    options.alias = {
      '@': './src',
    };
  },
});
