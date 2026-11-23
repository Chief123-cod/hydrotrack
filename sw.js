const SW_VERSION = 'hydrotrack-sw-v1';
const CACHE_NAME = 'hydrotrack-shell-v1';

const DEFAULT_TITLE = 'Waktunya Minum Air';
const DEFAULT_BODY = 'Ambil segelas air sekarang agar asupan cairan harianmu tetap terjaga.';
const DEFAULT_URL = './index.html?from=notification';

function resolveNotificationUrl(rawUrl) {
  const candidate = (typeof rawUrl === 'string' && rawUrl.trim()) ? rawUrl.trim() : DEFAULT_URL;
  try {
    // Strip leading slash when normalizing relative to scope so subpath deployments stay intact.
    const relative = candidate.startsWith('/') ? `.${candidate}` : candidate;
    const resolved = new URL(relative, self.registration.scope);
    if (!resolved.searchParams.has('from')) {
      resolved.searchParams.set('from', 'notification');
    }
    return resolved.href;
  } catch (err) {
    return new URL(DEFAULT_URL, self.registration.scope).href;
  }
}

function buildNotificationOptions(payload) {
  const nestedData = (payload.data && typeof payload.data === 'object') ? payload.data : {};
  const isSilent = Boolean(
    payload.silent ||
    nestedData.soundLabel === 'silent' ||
    payload.soundLabel === 'silent'
  );
  const isTest = Boolean(
    payload.isTest ||
    nestedData.type === 'test' ||
    payload.tag === 'hydrotrack-test'
  );
  const rawUrl = payload.url || nestedData.url || (isTest ? './pengaturan.html?from=notification' : DEFAULT_URL);
  const resolvedUrl = resolveNotificationUrl(rawUrl);
  const sentAt = payload.sentAt || nestedData.sentAt || Date.now();

  const options = {
    body: payload.body || DEFAULT_BODY,
    icon: './img/icon-192.png',
    badge: './img/icon-192.png',
    tag: payload.tag || (isTest ? 'hydrotrack-test' : 'hydrotrack-reminder'),
    renotify: true,
    requireInteraction: false,
    silent: isSilent,
    data: {
      url: resolvedUrl,
      isTest: isTest,
      sentAt: sentAt
    },
    actions: [
      { action: 'open', title: 'Catat Minum' },
      { action: 'dismiss', title: 'Nanti' }
    ]
  };

  // Avoid passing vibrate alongside silent:true, which some browsers reject.
  if (!isSilent) {
    options.vibrate = [180, 90, 180];
  }

  return options;
}

function parsePushPayload(eventData) {
  if (!eventData) return {};
  try {
    const parsed = eventData.json();
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (err) {
    try {
      const text = eventData.text();
      if (text) return { body: text };
    } catch (textErr) {
      return {};
    }
  }
  return {};
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('hydrotrack-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first fallback for same-origin static assets so deployments stay fresh while offline visits still load.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event.data);
  const title = payload.title || DEFAULT_TITLE;
  const options = buildNotificationOptions(payload);

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        clientList.forEach((client) => {
          try {
            client.postMessage({
              type: 'HYDRO_PUSH_RECEIVED',
              isTest: options.data.isTest,
              sentAt: options.data.sentAt,
              title: title,
              body: options.body
            });
          } catch (err) {
            // Ignore disconnected clients.
          }
        });
      })
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const isTest = Boolean(data.isTest);
  const rawUrl = data.url || DEFAULT_URL;
  const targetUrl = new URL(rawUrl, self.registration.scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      const appClients = clientList.filter((client) => client.url && client.url.startsWith(self.registration.scope));

      if (appClients.length > 0) {
        const preferred = appClients.find((client) => client.focused) || appClients[0];

        try {
          await preferred.focus();
        } catch (err) {
          // Focus can fail on restricted mobile contexts; continue to message or open.
        }

        try {
          preferred.postMessage({
            type: 'HYDRO_NOTIFICATION_CLICKED',
            isTest: isTest,
            sentAt: data.sentAt || null,
            url: targetUrl
          });
        } catch (err) {
          // Ignore postMessage failure.
        }

        let isDashboard = preferred.url.includes('index.html');
        if (!isDashboard) {
          try {
            const clientPath = new URL(preferred.url).pathname;
            const scopePath = new URL(self.registration.scope).pathname;
            isDashboard = clientPath === scopePath || clientPath === `${scopePath}index.html`;
          } catch (err) {
            // Keep default check on malformed URL.
          }
        }

        if (!isTest && event.action === 'open' && !isDashboard && 'navigate' in preferred) {
          try {
            await preferred.navigate(targetUrl);
          } catch (err) {
            // Keep focused tab if navigate is unsupported.
          }
        }
        return;
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SHOW_LOCAL_NOTIFICATION') {
    const payload = data.payload || data;
    const title = payload.title || DEFAULT_TITLE;
    const options = buildNotificationOptions(payload);
    event.waitUntil(self.registration.showNotification(title, options));
    return;
  }

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'PING' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ ok: true, version: SW_VERSION });
  }
});
