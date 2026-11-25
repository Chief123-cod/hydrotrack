const SW_VERSION = 'hydrotrack-sw-v14';
const CACHE_NAME = 'hydrotrack-shell-v14';
const NOTIF_STATE_CACHE = 'hydrotrack-notif-state';
const LAST_REMINDER_STATE_URL = '/__hydrotrack_last_reminder_slot__';

const DEFAULT_TITLE = 'Waktunya Minum Air';
const DEFAULT_BODY = 'Ambil segelas air sekarang agar asupan cairan harianmu tetap terjaga.';
const DEFAULT_URL = './index.html?from=notification';

let lastTestNotificationShownAt = 0;
let lastReminderSlotMem = { slotKey: '', shownAt: 0 };

async function readLastReminderState() {
  try {
    const cache = await caches.open(NOTIF_STATE_CACHE);
    const res = await cache.match(LAST_REMINDER_STATE_URL);
    if (res) {
      const parsed = await res.json();
      if (parsed && typeof parsed === 'object') {
        if ((parsed.shownAt || 0) >= (lastReminderSlotMem.shownAt || 0)) {
          lastReminderSlotMem = {
            slotKey: String(parsed.slotKey || ''),
            shownAt: Number(parsed.shownAt) || 0
          };
        }
      }
    }
  } catch (err) {
    // Fall back to in-memory state if Cache API is unavailable.
  }
  return lastReminderSlotMem;
}

async function recordLastReminderState(slotKey, shownAt) {
  lastReminderSlotMem = {
    slotKey: String(slotKey || ''),
    shownAt: Number(shownAt) || Date.now()
  };
  try {
    const cache = await caches.open(NOTIF_STATE_CACHE);
    await cache.put(
      LAST_REMINDER_STATE_URL,
      new Response(JSON.stringify(lastReminderSlotMem), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
  } catch (err) {
    // Ignore cache persistence errors.
  }
}

async function isDuplicateReminderSlot(slotKey, nowMs = Date.now()) {
  const prev = await readLastReminderState();
  if (slotKey && prev.slotKey === slotKey && (nowMs - prev.shownAt) < 10 * 60 * 1000) {
    return true;
  }
  if (prev.shownAt && (nowMs - prev.shownAt) < 45 * 1000) {
    return true;
  }
  return false;
}

function resolveScopeAssetUrl(relativePath) {
  try {
    return new URL(relativePath, self.registration.scope).href;
  } catch (err) {
    return relativePath;
  }
}

function resolveNotificationUrl(rawUrl) {
  const candidate = (typeof rawUrl === 'string' && rawUrl.trim()) ? rawUrl.trim() : DEFAULT_URL;
  try {
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
  const soundLabel = payload.soundLabel || nestedData.soundLabel || 'default';
  const isSilent = Boolean(
    payload.silent ||
    soundLabel === 'silent'
  );
  const isTest = Boolean(
    payload.isTest ||
    nestedData.type === 'test' ||
    payload.tag === 'hydrotrack-test'
  );
  const rawUrl = payload.url || nestedData.url || (isTest ? './pengaturan.html?from=notification' : DEFAULT_URL);
  const resolvedUrl = resolveNotificationUrl(rawUrl);
  const sentAt = payload.sentAt || nestedData.sentAt || Date.now();
  const iconUrl = resolveScopeAssetUrl('./img/icon-192.png');

  const options = {
    body: payload.body || DEFAULT_BODY,
    icon: iconUrl,
    badge: iconUrl,
    tag: payload.tag || (isTest ? 'hydrotrack-test' : 'hydrotrack-reminder'),
    renotify: true,
    requireInteraction: true,
    timestamp: typeof sentAt === 'number' ? sentAt : Date.now(),
    data: {
      url: resolvedUrl,
      isTest: isTest,
      sentAt: sentAt,
      slotKey: payload.slotKey || nestedData.slotKey || '',
      soundLabel: soundLabel
    },
    actions: [
      { action: 'open', title: 'Catat Minum' },
      { action: 'dismiss', title: 'Nanti' }
    ]
  };

  if (isSilent) {
    options.silent = true;
  } else {
    options.vibrate = [250, 120, 250, 120, 400];
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

async function broadcastToClients(messageObj) {
  try {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clientList.forEach((client) => {
      try {
        client.postMessage(messageObj);
      } catch (err) {
        // Ignore disconnected clients.
      }
    });
  } catch (err) {
    // Ignore matchAll errors.
  }
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

// Network-first with cache-busting for HTML/JS/CSS so installed PWAs always run the latest deployed code.
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

  const isCodeOrHtml =
    req.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.json');

  const fetchReq = isCodeOrHtml
    ? new Request(req.url, {
        method: 'GET',
        headers: req.headers,
        mode: req.mode === 'navigate' ? 'same-origin' : req.mode,
        credentials: req.credentials,
        redirect: req.redirect,
        cache: 'no-cache'
      })
    : req;

  event.respondWith(
    fetch(fetchReq)
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
  const isTest = Boolean(options.data && options.data.isTest);
  const slotKey = (options.data && options.data.slotKey) || '';

  if (isTest) {
    lastTestNotificationShownAt = Date.now();
  }

  event.waitUntil((async () => {
    const nowMs = Date.now();
    if (!isTest) {
      const duplicate = await isDuplicateReminderSlot(slotKey, nowMs);
      if (duplicate) {
        // Satisfy Chrome's userVisibleOnly policy silently in-place without re-alerting or ringing again.
        const quietOptions = { ...options, renotify: false, silent: true };
        delete quietOptions.vibrate;
        await self.registration.showNotification(title, quietOptions);
        return;
      }
      await recordLastReminderState(slotKey, nowMs);
    }

    await Promise.all([
      self.registration.showNotification(title, options),
      broadcastToClients({
        type: 'HYDRO_PUSH_RECEIVED',
        isTest: isTest,
        slotKey: slotKey,
        sentAt: options.data.sentAt,
        soundLabel: options.data.soundLabel,
        silent: Boolean(options.silent),
        title: title,
        body: options.body
      })
    ]);
  })());
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
            soundLabel: data.soundLabel || 'default',
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
    const isTest = Boolean(options.data && options.data.isTest);
    const slotKey = (options.data && options.data.slotKey) || '';
    if (isTest) {
      lastTestNotificationShownAt = Date.now();
    }
    event.waitUntil((async () => {
      const nowMs = Date.now();
      if (!isTest) {
        const duplicate = await isDuplicateReminderSlot(slotKey, nowMs);
        if (duplicate) return;
        await recordLastReminderState(slotKey, nowMs);
      }
      await Promise.all([
        self.registration.showNotification(title, options),
        broadcastToClients({
          type: 'HYDRO_PUSH_RECEIVED',
          isTest: isTest,
          slotKey: slotKey,
          sentAt: options.data.sentAt,
          soundLabel: options.data.soundLabel,
          silent: Boolean(options.silent),
          title: title,
          body: options.body
        })
      ]);
    })());
    return;
  }

  // Service-Worker-level background timer backup for 15s test push (survives tab/app minimize without freezing like page setTimeout).
  if (data.type === 'SCHEDULE_SW_DELAYED_TEST') {
    const delayMs = Math.max(1000, Math.min(30000, (Number(data.delaySeconds) || 15) * 1000));
    const scheduledAt = Date.now();
    const payload = data.payload || {};
    const title = payload.title || 'Tes Push Latar Belakang Berhasil';
    const options = buildNotificationOptions({
      ...payload,
      isTest: true,
      tag: 'hydrotrack-test'
    });

    event.waitUntil(
      new Promise((resolve) => setTimeout(resolve, delayMs + 1500)).then(async () => {
        // If the real Cloudflare Web Push already arrived and showed the test notification, do not duplicate it.
        if (lastTestNotificationShownAt >= scheduledAt) {
          return;
        }
        lastTestNotificationShownAt = Date.now();
        await Promise.all([
          self.registration.showNotification(title, options),
          broadcastToClients({
            type: 'HYDRO_PUSH_RECEIVED',
            isTest: true,
            sentAt: Date.now(),
            soundLabel: options.data.soundLabel,
            silent: Boolean(options.silent),
            title: title,
            body: options.body
          })
        ]);
      })
    );
    return;
  }

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'PING' && event.source && typeof event.source.postMessage === 'function') {
    event.source.postMessage({ type: 'PONG', version: SW_VERSION });
  }
});
