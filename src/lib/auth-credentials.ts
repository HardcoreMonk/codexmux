import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface IAuthCredentials {
  password: string;
  secret: string;
}

const BASE_DIR = path.join(os.homedir(), '.purple-terminal');
const WORKSPACES_FILE = path.join(BASE_DIR, 'workspaces.json');

const generateRandomString = (length: number): string =>
  crypto.randomBytes(length).toString('hex').slice(0, length);

const readWorkspacesAuth = (): { password: string; secret: string } | null => {
  try {
    const data = JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf-8'));
    if (data.authPassword && data.authSecret) {
      return { password: data.authPassword, secret: data.authSecret };
    }
  } catch {
    // ignore
  }
  return null;
};

const saveWorkspacesAuth = (credentials: IAuthCredentials): void => {
  try {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf-8'));
    } catch {
      // 파일 없으면 빈 객체
    }

    data.authPassword = credentials.password;
    data.authSecret = credentials.secret;
    data.updatedAt = new Date().toISOString();

    fs.mkdirSync(BASE_DIR, { recursive: true });

    const tmpFile = WORKSPACES_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, WORKSPACES_FILE);
  } catch (err) {
    console.error('[auth] workspaces.json 저장 실패:', err);
  }
};

export const initAuthCredentials = (): IAuthCredentials & { fixed: boolean } => {
  // 1. 환경변수 우선
  if (process.env.AUTH_PASSWORD && process.env.NEXTAUTH_SECRET) {
    return { password: process.env.AUTH_PASSWORD, secret: process.env.NEXTAUTH_SECRET, fixed: true };
  }

  // 2. workspaces.json에 저장된 인증 정보
  const stored = readWorkspacesAuth();
  if (stored) {
    return { ...stored, fixed: true };
  }

  // 3. 신규 생성 → workspaces.json에 영구 저장
  const credentials: IAuthCredentials = {
    password: generateRandomString(8),
    secret: generateRandomString(64),
  };

  saveWorkspacesAuth(credentials);
  return { ...credentials, fixed: false };
};
