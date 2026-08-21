#!/usr/bin/env node
import { runElectronBuilder } from './pack-electron-windows-lib.mjs';

const args = process.argv.slice(2);
const dir = args.includes('--dir');
const extraArgs = args.filter((arg) => arg !== '--dir');

const result = await runElectronBuilder({ dir, extraArgs });

if (result.signal) {
  console.error(`[pack-electron-windows] electron-builder exited from signal ${result.signal}`);
  process.exit(1);
}

process.exit(result.exitCode ?? 1);
