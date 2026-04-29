import type { TEventName } from '@/types/status';

const INPUT_REQUESTING_NOTIFICATION_TYPES = new Set(['permission_prompt', 'worker_permission_prompt']);

export const isInputRequestingNotificationType = (
  notificationType: string | null | undefined,
): boolean => !!notificationType && INPUT_REQUESTING_NOTIFICATION_TYPES.has(notificationType);

export const shouldProcessHookEvent = (
  eventName: TEventName,
  notificationType?: string,
): boolean => eventName !== 'notification'
  || !notificationType
  || isInputRequestingNotificationType(notificationType);

export const shouldSendReviewNotification = (
  newState: string,
  silent: boolean | undefined,
): boolean => newState === 'ready-for-review' && !silent;

export const shouldSendNeedsInputNotification = (
  newState: string,
  silent: boolean | undefined,
): boolean => newState === 'needs-input' && !silent;
