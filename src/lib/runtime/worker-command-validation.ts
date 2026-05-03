import { isRuntimeCommandType, type IRuntimeCommand } from '@/lib/runtime/ipc';

export interface IInvalidWorkerCommand {
  code: 'invalid-worker-command';
  message: string;
  retryable: false;
}

export interface IWorkerCommandValidationOptions {
  workerName: string;
  namespace: string;
}

export const validateWorkerCommandEnvelope = (
  command: IRuntimeCommand,
  options: IWorkerCommandValidationOptions,
): IInvalidWorkerCommand | null => {
  if (command.source !== 'supervisor') {
    return {
      code: 'invalid-worker-command',
      message: `Invalid command source: ${command.source}`,
      retryable: false,
    };
  }

  if (command.target !== options.workerName) {
    return {
      code: 'invalid-worker-command',
      message: `Invalid ${options.workerName} command target: ${command.target}`,
      retryable: false,
    };
  }

  if (!isRuntimeCommandType(command.type)) {
    return {
      code: 'invalid-worker-command',
      message: `Unregistered runtime command: ${command.type}`,
      retryable: false,
    };
  }

  if (!command.type.startsWith(`${options.namespace}.`)) {
    return {
      code: 'invalid-worker-command',
      message: `Invalid ${options.workerName} command namespace: ${command.type}`,
      retryable: false,
    };
  }

  return null;
};
