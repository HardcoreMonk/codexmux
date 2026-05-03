import { customAlphabet } from 'nanoid';
import { z } from 'zod';

export const RUNTIME_SESSION_PREFIX = 'rtv2-';
export const RUNTIME_SESSION_NAME_MAX_LENGTH = 120;

const runtimeSafeId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

export const runtimeSessionNameSchema = z.string()
  .min(RUNTIME_SESSION_PREFIX.length + 1)
  .max(RUNTIME_SESSION_NAME_MAX_LENGTH)
  .regex(
    /^rtv2-[a-z0-9][a-z0-9-]*$/,
    'runtime v2 terminal session names must be tmux-safe and start with rtv2-',
  );

export const createRuntimeId = (prefix: 'ws' | 'pane' | 'tab' | 'evt' | 'sub' | 'msg'): string =>
  `${prefix}-${runtimeSafeId()}`;

export const parseRuntimeSessionName = (sessionName: string): string =>
  runtimeSessionNameSchema.parse(sessionName);

export const createRuntimeSessionName = (input: {
  workspaceId: string;
  paneId: string;
  tabId: string;
}): string =>
  parseRuntimeSessionName(`${RUNTIME_SESSION_PREFIX}${input.workspaceId}-${input.paneId}-${input.tabId}`);
