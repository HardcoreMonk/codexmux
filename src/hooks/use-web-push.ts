import { useEffect, useRef } from 'react';
import useConfigStore from '@/hooks/use-config-store';
import { navigateToTab, navigateToTabOrCreate } from '@/hooks/use-layout';
import isElectron from '@/hooks/use-is-electron';

const urlBase64ToUint8Array = (base64String: string): ArrayBuffer => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output.buffer as ArrayBuffer;
};

const subscribe = async (): Promise<boolean> => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existing.toJSON()),
      });
      return true;
    }

    const res = await fetch('/api/push/vapid-key');
    const { publicKey } = await res.json();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });

    return true;
  } catch {
    return false;
  }
};

const unsubscribe = async (): Promise<void> => {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    await sub.unsubscribe();
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch {
    // 실패해도 무시
  }
};

const hasExistingSubscription = async (): Promise<boolean> => {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
};

const getEndpoint = async (): Promise<string | null> => {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
};

const DEVICE_ID_KEY = 'purplemux-device-id';

const getDeviceId = (): string => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

const sendVisibility = (visible: boolean) => {
  fetch('/api/push/visibility', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: getDeviceId(), visible }),
    keepalive: true,
  }).catch(() => {});
};

const PUSH_NAV_CACHE = 'push-nav';
const PUSH_NAV_KEY = '/_push-pending';

const consumePushNavCache = async (): Promise<Record<string, string | null> | null> => {
  try {
    const cache = await caches.open(PUSH_NAV_CACHE);
    const res = await cache.match(PUSH_NAV_KEY);
    if (!res) return null;
    await cache.delete(PUSH_NAV_KEY);
    return await res.json();
  } catch {
    return null;
  }
};

export const registerPushTarget = async (sessionId: string): Promise<void> => {
  const endpoint = await getEndpoint();
  fetch('/api/push/register-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, sessionId }),
    keepalive: true,
  }).catch(() => {});
};

const useWebPush = () => {
  const initialized = useRef(false);

  useEffect(() => {
    if (isElectron) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const handlePushNavigation = (params: {
      workspaceId: string;
      tabId?: string;
      claudeSessionId?: string | null;
      workspaceName?: string;
      workspaceDir?: string | null;
    }) => {
      if (params.claudeSessionId) {
        navigateToTabOrCreate(
          params.workspaceId,
          params.tabId ?? '',
          params.claudeSessionId,
          params.workspaceName ?? '',
          params.workspaceDir ?? null,
        );
      } else if (params.tabId) {
        navigateToTab(params.workspaceId, params.tabId);
      }
    };

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === 'notification-click' && data.workspaceId) {
        consumePushNavCache();
        handlePushNavigation(data);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);

    // Cache API 폴백: iOS에서 postMessage 유실 시 (background → foreground 복귀 포함)
    const checkPushNavCache = () => {
      consumePushNavCache().then((data) => {
        if (data?.workspaceId) {
          handlePushNavigation({
            workspaceId: data.workspaceId,
            tabId: data.tabId ?? undefined,
            claudeSessionId: data.claudeSessionId,
            workspaceName: data.workspaceName ?? '',
            workspaceDir: data.workspaceDir,
          });
        }
      });
    };
    checkPushNavCache();

    const clearNotifications = () => {
      navigator.serviceWorker.ready.then((reg) => {
        reg.active?.postMessage({ type: 'clear-notifications' });
      });
      navigator.clearAppBadge?.();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkPushNavCache();
        clearNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handlePageShow = () => {
      checkPushNavCache();
      clearNotifications();
    };
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handlePageShow);

    // 초기 로드: 기존 구독이 없으면 토글 OFF로 동기화
    hasExistingSubscription().then((exists) => {
      if (!exists) {
        const { notificationsEnabled } = useConfigStore.getState();
        if (notificationsEnabled) {
          useConfigStore.setState({ notificationsEnabled: false });
        }
      }
      initialized.current = true;
    });

    const unsub = useConfigStore.subscribe((state, prev) => {
      if (!initialized.current) return;
      if (state.notificationsEnabled === prev.notificationsEnabled) return;

      if (state.notificationsEnabled) {
        subscribe().then((ok) => {
          if (!ok) {
            useConfigStore.getState().setNotificationsEnabled(false);
          }
        });
      } else {
        unsubscribe();
      }
    });

    // Visibility tracking (push 구독 여부와 무관하게 항상 실행)
    sendVisibility(!document.hidden);

    const handleDeviceVisChange = () => {
      sendVisibility(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleDeviceVisChange);

    const pingTimer = setInterval(() => {
      if (!document.hidden) sendVisibility(true);
    }, 30_000);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handlePageShow);
      unsub();
      document.removeEventListener('visibilitychange', handleDeviceVisChange);
      clearInterval(pingTimer);
      sendVisibility(false);
    };
  }, []);
};

export default useWebPush;
