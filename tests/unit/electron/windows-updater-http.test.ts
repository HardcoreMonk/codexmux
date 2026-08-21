import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildWindowsUpdaterPowerShellDownloadCommand,
  buildWindowsUpdaterRequestUrl,
  normalizeWindowsUpdaterHttpHeaders,
  verifyWindowsUpdaterFileChecksum,
} from '../../../electron/windows-updater-http';

describe('Windows updater HTTP executor helpers', () => {
  it('builds request URLs from electron-updater request options', () => {
    expect(buildWindowsUpdaterRequestUrl({
      protocol: 'https:',
      hostname: 'github.com',
      path: '/HardcoreMonk/codexmux/releases/download/v0.4.10/latest.yml',
    })).toBe('https://github.com/HardcoreMonk/codexmux/releases/download/v0.4.10/latest.yml');

    expect(buildWindowsUpdaterRequestUrl({
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: 17171,
      path: '/latest.yml',
    })).toBe('http://127.0.0.1:17171/latest.yml');
  });

  it('normalizes headers for PowerShell Invoke-WebRequest', () => {
    expect(normalizeWindowsUpdaterHttpHeaders({
      'User-Agent': 'electron-builder',
      Accept: ['application/yaml', 'text/plain'],
      Host: 'github.com',
      'Content-Length': 123,
      Empty: undefined,
    })).toEqual({
      'User-Agent': 'electron-builder',
      Accept: 'application/yaml, text/plain',
    });
  });

  it('keeps the PowerShell download command environment-driven', () => {
    const command = buildWindowsUpdaterPowerShellDownloadCommand();

    expect(command).toContain('CODEXMUX_UPDATER_HTTP_URL');
    expect(command).toContain('CODEXMUX_UPDATER_HTTP_DEST');
    expect(command).toContain('MaximumRedirection = 10');
    expect(command).toContain('Invoke-WebRequest @params');
  });

  it('validates sha512 checksums with electron-builder base64 metadata', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexmux-updater-http-'));
    const filePath = path.join(tempDir, 'payload.bin');
    fs.writeFileSync(filePath, 'codexmux');

    try {
      const sha512 = createHash('sha512').update('codexmux').digest('base64');
      expect(() => verifyWindowsUpdaterFileChecksum(filePath, { sha512 })).not.toThrow();
      expect(() => verifyWindowsUpdaterFileChecksum(filePath, { sha512: `${sha512.slice(0, -1)}A` }))
        .toThrow(/sha512 checksum mismatch/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
