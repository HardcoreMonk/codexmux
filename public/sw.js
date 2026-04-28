self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const sessionId = data.agentSessionId || null;
  const title = data.title || 'Task Complete';
  const options = {
    body: data.body || '',
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-32x32.png',
    tag: sessionId ? `session:${sessionId}` : undefined,
    renotify: !!sessionId,
    silent: !!data.silent,
    data: {
      tabId: data.tabId,
      workspaceId: data.workspaceId,
      agentSessionId: sessionId,
      workspaceName: data.workspaceName || '',
      workspaceDir: data.workspaceDir || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-notifications') {
    event.waitUntil(
      self.registration.getNotifications().then((notifications) => {
        notifications.forEach((n) => n.close());
      })
    );
  }
});

const PUSH_NAV_CACHE = 'push-nav';
const PUSH_NAV_KEY = '/_push-pending';

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { tabId, workspaceId, agentSessionId, workspaceName, workspaceDir } = event.notification.data || {};
  const navData = { tabId, workspaceId, agentSessionId, workspaceName, workspaceDir };

  event.waitUntil(
    caches.open(PUSH_NAV_CACHE).then((cache) =>
      cache.put(PUSH_NAV_KEY, new Response(JSON.stringify(navData)))
    ).then(() =>
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    ).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.postMessage({ type: 'notification-click', ...navData });
          return client.focus();
        }
      }
      return self.clients.openWindow('/');
    })
  );
});
