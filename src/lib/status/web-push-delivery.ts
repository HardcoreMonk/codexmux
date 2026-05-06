import type {
  IStatusSendWebPushInput,
  IStatusSendWebPushResult,
} from '@/lib/runtime/status/web-push-actions';

interface IDeliverStatusWebPushInput extends IStatusSendWebPushInput {
  useRuntimeDefault: boolean;
  sendRuntime: (input: IStatusSendWebPushInput) => Promise<IStatusSendWebPushResult>;
  sendLegacy: (input: IStatusSendWebPushInput) => Promise<IStatusSendWebPushResult>;
  recordCounter?: (name: string, delta?: number) => void;
  warn?: (message: string) => void;
}

const recordRuntimeResult = (
  result: IStatusSendWebPushResult,
  recordCounter?: (name: string, delta?: number) => void,
): void => {
  recordCounter?.('runtime_v2.status_web_push.sent', result.sent);
  recordCounter?.('runtime_v2.status_web_push.failed', result.failed);
  recordCounter?.('runtime_v2.status_web_push.removed', result.removed);
  if (result.skippedVisible) recordCounter?.('runtime_v2.status_web_push.skipped_visible');
};

export const deliverStatusWebPush = async ({
  anyDeviceVisible,
  payload,
  useRuntimeDefault,
  sendRuntime,
  sendLegacy,
  recordCounter,
  warn,
}: IDeliverStatusWebPushInput): Promise<IStatusSendWebPushResult> => {
  const input: IStatusSendWebPushInput = { anyDeviceVisible, payload };
  if (useRuntimeDefault) {
    try {
      const result = await sendRuntime(input);
      recordRuntimeResult(result, recordCounter);
      return result;
    } catch (err) {
      recordCounter?.('runtime_v2.status_web_push.fallback');
      warn?.(`runtime v2 Web Push send failed, falling back: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return sendLegacy(input);
};
