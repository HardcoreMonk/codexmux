import { useEffect, useRef } from 'react';
import useConfigStore from '@/hooks/use-config-store';
import { navigateToTab } from '@/hooks/use-layout';
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

const sendVisibility = (endpoint: string, visible: boolean) => {
  fetch('/api/push/visibility', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, visible }),
    keepalive: true,
  }).catch(() => {});
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

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === 'notification-click' && data.tabId && data.workspaceId) {
        navigateToTab(data.workspaceId, data.tabId);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);

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
            return;
          }
          if (!useConfigStore.getState().notificationsEnabled) return;
          getEndpoint().then((ep) => {
            if (!ep) return;
            cleanupVisibility?.();
            cleanupVisibility = startVisibilityTracking(ep);
          });
        });
      } else {
        cleanupVisibility?.();
        cleanupVisibility = null;
        unsubscribe();
      }
    });

    // Visibility tracking
    let visibilityEndpoint: string | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const startVisibilityTracking = (ep: string) => {
      visibilityEndpoint = ep;
      sendVisibility(ep, !document.hidden);

      const handleVisChange = () => {
        if (!visibilityEndpoint) return;
        sendVisibility(visibilityEndpoint, !document.hidden);
      };
      document.addEventListener('visibilitychange', handleVisChange);

      pingTimer = setInterval(() => {
        if (visibilityEndpoint && !document.hidden) {
          sendVisibility(visibilityEndpoint, true);
        }
      }, 30_000);

      return () => {
        document.removeEventListener('visibilitychange', handleVisChange);
        if (pingTimer) clearInterval(pingTimer);
        if (visibilityEndpoint) sendVisibility(visibilityEndpoint, false);
      };
    };

    let cleanupVisibility: (() => void) | null = null;
    getEndpoint().then((ep) => {
      if (ep) cleanupVisibility = startVisibilityTracking(ep);
    });

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      unsub();
      cleanupVisibility?.();
    };
  }, []);
};

export default useWebPush;
