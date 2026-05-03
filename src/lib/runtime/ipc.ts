import { nanoid } from 'nanoid';
import { z } from 'zod';
import { runtimeSessionNameSchema } from '@/lib/runtime/session-name';

const RUNTIME_TERMINAL_MAX_COLS = 500;
const RUNTIME_TERMINAL_MAX_ROWS = 200;
const emptyPayloadSchema = z.object({}).strict();
const runtimeHealthReplySchema = z.object({ ok: z.boolean() }).passthrough();
const runtimeWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  defaultCwd: z.string(),
  active: z.union([z.boolean(), z.number()]),
  groupId: z.string().nullable().optional(),
  orderIndex: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const runtimeCreateWorkspaceResultSchema = z.object({
  id: z.string(),
  rootPaneId: z.string(),
});
const runtimePendingTerminalTabSchema = z.object({
  id: z.string(),
  sessionName: runtimeSessionNameSchema,
  workspaceId: z.string(),
  paneId: z.string(),
  cwd: z.string(),
  lifecycleState: z.literal('pending_terminal'),
  createdAt: z.string(),
});
const runtimeTerminalTabSchema = z.object({
  id: z.string(),
  sessionName: runtimeSessionNameSchema,
  name: z.string(),
  order: z.number(),
  cwd: z.string().optional(),
  panelType: z.literal('terminal'),
  lifecycleState: z.union([z.literal('pending_terminal'), z.literal('ready'), z.literal('failed')]),
});
const runtimeTerminalSessionSchema = z.object({
  sessionName: runtimeSessionNameSchema,
});
const rawTerminalSessionSchema = z.object({
  sessionName: z.string(),
});
const runtimeDeleteWorkspaceStorageResultSchema = z.object({
  deleted: z.boolean(),
  sessions: z.array(rawTerminalSessionSchema),
});
const runtimeLayoutTabSchema = z.object({
  id: z.string(),
  sessionName: runtimeSessionNameSchema,
  name: z.string(),
  order: z.number(),
  title: z.string().optional(),
  cwd: z.string().optional(),
  panelType: z.union([
    z.literal('terminal'),
    z.literal('codex'),
    z.literal('web-browser'),
    z.literal('diff'),
  ]).optional(),
});

type TRuntimeLayoutNode = {
  type: 'pane' | 'split';
  id?: string;
  tabs?: unknown[];
  activeTabId?: string | null;
  orientation?: 'horizontal' | 'vertical';
  ratio?: number;
  children?: unknown[];
};

const runtimeLayoutNodeSchema: z.ZodType<TRuntimeLayoutNode> = z.lazy(() => z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pane'),
    id: z.string(),
    tabs: z.array(runtimeLayoutTabSchema),
    activeTabId: z.string().nullable(),
  }),
  z.object({
    type: z.literal('split'),
    orientation: z.union([z.literal('horizontal'), z.literal('vertical')]),
    ratio: z.number(),
    children: z.tuple([runtimeLayoutNodeSchema, runtimeLayoutNodeSchema]),
  }),
]));
const runtimeLayoutSchema = z.object({
  root: runtimeLayoutNodeSchema,
  activePaneId: z.string().nullable(),
  updatedAt: z.string(),
}).nullable();
const workspaceIdPayloadSchema = z.object({ workspaceId: z.string().min(1) });
const createWorkspacePayloadSchema = z.object({
  name: z.string().min(1),
  defaultCwd: z.string().min(1),
});
const createPendingTerminalTabPayloadSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  paneId: z.string().min(1),
  sessionName: runtimeSessionNameSchema,
  cwd: z.string().min(1),
});
const tabIdPayloadSchema = z.object({ id: z.string().min(1) });
const failPendingTerminalTabPayloadSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
});
const terminalCreatePayloadSchema = z.object({
  sessionName: runtimeSessionNameSchema,
  cols: z.number().int().min(1).max(RUNTIME_TERMINAL_MAX_COLS),
  rows: z.number().int().min(1).max(RUNTIME_TERMINAL_MAX_ROWS),
  cwd: z.string().optional(),
});
const terminalResizePayloadSchema = z.object({
  sessionName: runtimeSessionNameSchema,
  cols: z.number().int().min(1).max(RUNTIME_TERMINAL_MAX_COLS),
  rows: z.number().int().min(1).max(RUNTIME_TERMINAL_MAX_ROWS),
});
const terminalWritePayloadSchema = z.object({
  sessionName: runtimeSessionNameSchema,
  data: z.string(),
});
const terminalStdoutEventPayloadSchema = z.object({
  sessionName: runtimeSessionNameSchema,
  data: z.string(),
});
const terminalBackpressureEventPayloadSchema = z.object({
  sessionName: runtimeSessionNameSchema,
  pendingBytes: z.number().int().nonnegative(),
  maxPendingStdoutBytes: z.number().int().positive(),
});

export const runtimeCommandRegistry = {
  'storage.health': { payload: emptyPayloadSchema, reply: runtimeHealthReplySchema },
  'storage.create-workspace': { payload: createWorkspacePayloadSchema, reply: runtimeCreateWorkspaceResultSchema },
  'storage.create-pending-terminal-tab': { payload: createPendingTerminalTabPayloadSchema, reply: runtimePendingTerminalTabSchema },
  'storage.finalize-terminal-tab': { payload: tabIdPayloadSchema, reply: runtimeTerminalTabSchema },
  'storage.fail-pending-terminal-tab': { payload: failPendingTerminalTabPayloadSchema, reply: z.object({ ok: z.boolean() }) },
  'storage.list-pending-terminal-tabs': { payload: emptyPayloadSchema, reply: z.array(runtimePendingTerminalTabSchema) },
  'storage.get-ready-terminal-tab-by-session': { payload: runtimeTerminalSessionSchema, reply: runtimeTerminalTabSchema.nullable() },
  'storage.delete-workspace': { payload: workspaceIdPayloadSchema, reply: runtimeDeleteWorkspaceStorageResultSchema },
  'storage.list-workspaces': { payload: emptyPayloadSchema, reply: z.array(runtimeWorkspaceSchema) },
  'storage.get-layout': { payload: workspaceIdPayloadSchema, reply: runtimeLayoutSchema },
  'terminal.health': { payload: emptyPayloadSchema, reply: runtimeHealthReplySchema },
  'terminal.create-session': { payload: terminalCreatePayloadSchema, reply: runtimeTerminalSessionSchema },
  'terminal.attach': { payload: terminalResizePayloadSchema, reply: runtimeTerminalSessionSchema.extend({ attached: z.boolean() }) },
  'terminal.detach': { payload: runtimeTerminalSessionSchema, reply: runtimeTerminalSessionSchema.extend({ detached: z.boolean() }) },
  'terminal.kill-session': { payload: runtimeTerminalSessionSchema, reply: runtimeTerminalSessionSchema.extend({ killed: z.boolean() }) },
  'terminal.write-stdin': { payload: terminalWritePayloadSchema, reply: z.object({ written: z.number().int().nonnegative() }) },
  'terminal.write-web-stdin': { payload: terminalWritePayloadSchema, reply: z.object({ written: z.number().int().nonnegative() }) },
  'terminal.resize': { payload: terminalResizePayloadSchema, reply: terminalResizePayloadSchema },
} as const satisfies Record<string, { payload: z.ZodTypeAny; reply: z.ZodTypeAny }>;

export const runtimeEventRegistry = {
  'terminal.stdout': {
    source: 'terminal',
    target: 'supervisor',
    delivery: 'realtime',
    payload: terminalStdoutEventPayloadSchema,
  },
  'terminal.backpressure': {
    source: 'terminal',
    target: 'supervisor',
    delivery: 'realtime',
    payload: terminalBackpressureEventPayloadSchema,
  },
} as const satisfies Record<string, {
  source: string;
  target: string;
  delivery: 'realtime' | 'durable';
  payload: z.ZodTypeAny;
}>;

export type TRuntimeCommandType = keyof typeof runtimeCommandRegistry;
export type TRuntimeEventType = keyof typeof runtimeEventRegistry;
export type TRuntimeCommandPayload<TType extends TRuntimeCommandType> = z.infer<(typeof runtimeCommandRegistry)[TType]['payload']>;
export type TRuntimeCommandReplyPayload<TType extends TRuntimeCommandType> = z.infer<(typeof runtimeCommandRegistry)[TType]['reply']>;
export type TRuntimeEventPayload<TType extends TRuntimeEventType> = z.infer<(typeof runtimeEventRegistry)[TType]['payload']>;

const runtimeErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().optional(),
});

const baseEnvelopeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.string().min(1),
  sentAt: z.string().min(1),
  payload: z.unknown(),
});

const commandSchema = baseEnvelopeSchema.extend({
  kind: z.literal('command'),
});

const successReplySchema = baseEnvelopeSchema.extend({
  kind: z.literal('reply'),
  commandId: z.string().min(1),
  ok: z.literal(true),
}).strict();

const failedReplySchema = baseEnvelopeSchema.extend({
  kind: z.literal('reply'),
  commandId: z.string().min(1),
  ok: z.literal(false),
  payload: z.null(),
  error: runtimeErrorSchema,
}).strict();

const replySchema = z.discriminatedUnion('ok', [successReplySchema, failedReplySchema]);

const eventSchema = baseEnvelopeSchema.extend({
  kind: z.literal('event'),
  delivery: z.union([z.literal('realtime'), z.literal('durable')]),
});

const messageSchema = z.union([commandSchema, replySchema, eventSchema]);

export const isRuntimeCommandType = (type: string): type is TRuntimeCommandType =>
  type in runtimeCommandRegistry;

export const isRuntimeEventType = (type: string): type is TRuntimeEventType =>
  type in runtimeEventRegistry;

export const parseRuntimeCommandPayload = <TType extends TRuntimeCommandType>(
  type: TType,
  value: unknown,
): TRuntimeCommandPayload<TType> => {
  const parsed = runtimeCommandRegistry[type].payload.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid runtime IPC payload for ${type}: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`);
  }
  return parsed.data as TRuntimeCommandPayload<TType>;
};

export const parseRuntimeReplyPayload = <TType extends TRuntimeCommandType>(
  type: TType,
  value: unknown,
): TRuntimeCommandReplyPayload<TType> => {
  const parsed = runtimeCommandRegistry[type].reply.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid runtime IPC reply for ${type}: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`);
  }
  return parsed.data as TRuntimeCommandReplyPayload<TType>;
};

export const parseRuntimeEventPayload = <TType extends TRuntimeEventType>(
  type: TType,
  value: unknown,
): TRuntimeEventPayload<TType> => {
  const parsed = runtimeEventRegistry[type].payload.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid runtime IPC event for ${type}: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`);
  }
  return parsed.data as TRuntimeEventPayload<TType>;
};

export interface IRuntimeError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface IRuntimeEnvelope<TPayload = unknown> {
  id: string;
  source: string;
  target: string;
  type: string;
  sentAt: string;
  payload: TPayload;
}

export interface IRuntimeCommand<TPayload = unknown> extends IRuntimeEnvelope<TPayload> {
  kind: 'command';
}

export interface IRuntimeReply<TPayload = unknown> extends IRuntimeEnvelope<TPayload> {
  kind: 'reply';
  commandId: string;
  ok: boolean;
  error?: IRuntimeError;
}

export interface IRuntimeEvent<TPayload = unknown> extends IRuntimeEnvelope<TPayload> {
  kind: 'event';
  delivery: 'realtime' | 'durable';
}

export type TRuntimeMessage<TPayload = unknown> =
  | IRuntimeCommand<TPayload>
  | IRuntimeReply<TPayload>
  | IRuntimeEvent<TPayload>;

export interface ICreateCommandInput<TPayload> {
  id?: string;
  source: string;
  target: string;
  type: string;
  payload: TPayload;
}

export interface ICreateReplyBaseInput {
  id?: string;
  commandId: string;
  source: string;
  target: string;
  type: string;
}

export type TCreateReplyInput<TPayload = null> =
  | (ICreateReplyBaseInput & { ok: true; payload: TPayload; error?: never })
  | (ICreateReplyBaseInput & { ok: false; payload: null; error: IRuntimeError });

export interface ICreateEventInput<TPayload> {
  id?: string;
  source: string;
  target: string;
  type: string;
  delivery: 'realtime' | 'durable';
  payload: TPayload;
}

const nowIso = (): string => new Date().toISOString();
const nextId = (): string => `msg-${nanoid(10)}`;

export const createRuntimeCommand = <TPayload>(input: ICreateCommandInput<TPayload>): IRuntimeCommand<TPayload> => ({
  kind: 'command',
  id: input.id ?? nextId(),
  source: input.source,
  target: input.target,
  type: input.type,
  sentAt: nowIso(),
  payload: input.payload,
});

const getReplyCommandType = (replyType: string): TRuntimeCommandType | null => {
  if (!replyType.endsWith('.reply')) return null;
  const commandType = replyType.slice(0, -'.reply'.length);
  return isRuntimeCommandType(commandType) ? commandType : null;
};

export const createRuntimeReply = <TPayload = null>(input: TCreateReplyInput<TPayload>): IRuntimeReply<TPayload> => {
  const msg = {
    kind: 'reply' as const,
    id: input.id ?? nextId(),
    commandId: input.commandId,
    source: input.source,
    target: input.target,
    type: input.type,
    sentAt: nowIso(),
    ok: input.ok,
    payload: input.payload,
    ...('error' in input ? { error: input.error } : {}),
  };
  const parsed = parseRuntimeMessage(msg) as IRuntimeReply<TPayload>;
  if (!parsed.ok) return parsed;
  const commandType = getReplyCommandType(parsed.type);
  if (!commandType) return parsed;
  return {
    ...parsed,
    payload: parseRuntimeReplyPayload(commandType, parsed.payload),
  } as IRuntimeReply<TPayload>;
};

export const createRuntimeEvent = <TPayload>(input: ICreateEventInput<TPayload>): IRuntimeEvent<TPayload> => {
  const msg = parseRuntimeMessage({
    kind: 'event' as const,
    id: input.id ?? nextId(),
    source: input.source,
    target: input.target,
    type: input.type,
    sentAt: nowIso(),
    delivery: input.delivery,
    payload: input.payload,
  }) as IRuntimeEvent<TPayload>;

  if (!isRuntimeEventType(msg.type)) return msg;
  const expected = runtimeEventRegistry[msg.type];
  if (
    msg.source !== expected.source
    || msg.target !== expected.target
    || msg.delivery !== expected.delivery
  ) {
    throw new Error(`Invalid runtime IPC event for ${msg.type}: envelope mismatch`);
  }
  return { ...msg, payload: parseRuntimeEventPayload(msg.type, msg.payload) } as IRuntimeEvent<TPayload>;
};

export const parseRuntimeMessage = (value: unknown): TRuntimeMessage => {
  const parsed = messageSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid runtime IPC message: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`);
  }
  return parsed.data as TRuntimeMessage;
};
