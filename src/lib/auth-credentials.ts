import fs from 'fs';
import path from 'path';
import os from 'os';

interface IAuthCredentials {
  password: string;
  secret: string;
}

const BASE_DIR = path.join(os.homedir(), '.purplemux');
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');

const readConfigAuth = (): { password: string; secret: string } | null => {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    if (data.authPassword && data.authSecret) {
      return { password: data.authPassword, secret: data.authSecret };
    }
  } catch {
    // ignore
  }
  return null;
};

export const initAuthCredentials = (): (IAuthCredentials & { fixed: boolean }) | null => {
  // 1. Environment variables take priority
  if (process.env.AUTH_PASSWORD && process.env.NEXTAUTH_SECRET) {
    return { password: process.env.AUTH_PASSWORD, secret: process.env.NEXTAUTH_SECRET, fixed: true };
  }

  // 2. Stored credentials from config.json
  const stored = readConfigAuth();
  if (stored) {
    return { ...stored, fixed: true };
  }

  // 3. Password not set — will be configured during onboarding
  return null;
};
