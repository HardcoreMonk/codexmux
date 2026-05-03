import {
  createRuntimeReply,
  parseRuntimeCommandPayload,
  type IRuntimeCommand,
  type IRuntimeReply,
} from '@/lib/runtime/ipc';
import { validateWorkerCommandEnvelope, type IInvalidWorkerCommand } from '@/lib/runtime/worker-command-validation';
import { reduceCodexState, reduceHookState } from '@/lib/status-state-machine';
import {
  shouldProcessHookEvent,
  shouldSendNeedsInputNotification,
  shouldSendReviewNotification,
} from '@/lib/status-notification-policy';

export const createStatusWorkerService = () => {
  const ok = <TPayload>(command: IRuntimeCommand, payload: TPayload): IRuntimeReply<TPayload> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'status',
      target: command.source,
      type: `${command.type}.reply`,
      ok: true,
      payload,
    });

  const fail = (command: IRuntimeCommand, code: string, message: string, retryable = false): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'status',
      target: command.source,
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error: { code, message, retryable },
    });

  const invalidCommand = (command: IRuntimeCommand, error: IInvalidWorkerCommand): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'status',
      target: 'supervisor',
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error,
    });

  return {
    async handleCommand(command: IRuntimeCommand): Promise<IRuntimeReply> {
      const invalid = validateWorkerCommandEnvelope(command, { workerName: 'status', namespace: 'status' });
      if (invalid) return invalidCommand(command, invalid);
      try {
        if (command.type === 'status.health') {
          return ok(command, { ok: true });
        }
        if (command.type === 'status.reduce-hook-state') {
          const input = parseRuntimeCommandPayload('status.reduce-hook-state', command.payload);
          return ok(command, reduceHookState(input));
        }
        if (command.type === 'status.reduce-codex-state') {
          const input = parseRuntimeCommandPayload('status.reduce-codex-state', command.payload);
          return ok(command, reduceCodexState(input));
        }
        if (command.type === 'status.evaluate-notification-policy') {
          const input = parseRuntimeCommandPayload('status.evaluate-notification-policy', command.payload);
          return ok(command, {
            processHookEvent: shouldProcessHookEvent(input.eventName, input.notificationType),
            sendReviewNotification: shouldSendReviewNotification(input.newState, input.silent),
            sendNeedsInputNotification: shouldSendNeedsInputNotification(input.newState, input.silent),
          });
        }
        return invalidCommand(command, {
          code: 'invalid-worker-command',
          message: `Unsupported status command: ${command.type}`,
          retryable: false,
        });
      } catch (err) {
        const maybeStructured = err as { code?: string; retryable?: boolean } | null;
        return fail(
          command,
          maybeStructured?.code ?? 'command-failed',
          err instanceof Error ? err.message : String(err),
          maybeStructured?.retryable ?? false,
        );
      }
    },

    close(): void {
      // no persistent resources in policy-only foundation
    },
  };
};
