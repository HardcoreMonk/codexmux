import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface IAuthCredentials {
  password: string;
  token: string;
  parentPid: number;
}

const CREDENTIALS_PATH = path.join(os.homedir(), '.purple-terminal', '.auth-credentials');

const generateRandomString = (length: number): string =>
  crypto.randomBytes(length).toString('hex').slice(0, length);

export const initAuthCredentials = (): IAuthCredentials => {
  const parentPid = process.ppid;

  try {
    const existing: IAuthCredentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    if (existing.parentPid === parentPid) {
      return existing;
    }
  } catch {
    // ignore
  }

  const credentials: IAuthCredentials = {
    password: generateRandomString(8),
    token: generateRandomString(32),
    parentPid,
  };

  const dir = path.dirname(CREDENTIALS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials));
  return credentials;
};
