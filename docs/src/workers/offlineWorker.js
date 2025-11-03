const CACHE_VERSION = 'leitner-offline-cache-v2';
const CACHE_NAME = `${CACHE_VERSION}`;
const BASE_URL = new URL('../..', self.location);
const OFFLINE_FALLBACK_PAGE = 'index.html';
const PRECACHE_PATHS = [
    './',
    'index.html',
    'style.css',
    'csv-files.json',
    'src/main.js',
    'src/core/leitnerApp.js',
    'src/core/leitnerEngine.js',
    'src/core/historyService.js',
    'src/data/storageService.js',
    'src/data/crud.js',
    'src/ui/uiManager.js',
    'mordor-2340048_1280.png'
];

function resolveAsset(path) {
    if (/^https?:/i.test(path)) {
        return path;
    }
    return new URL(path, BASE_URL).toString();
}

const DB_NAME = 'leitner-offline';
const STORE_PENDING = 'pendingRequests';
const STORE_NOTIFICATIONS = 'scheduledNotifications';

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_PENDING)) {
                db.createObjectStore(STORE_PENDING, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(STORE_NOTIFICATIONS)) {
                db.createObjectStore(STORE_NOTIFICATIONS, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function withStore(storeName, mode, callback) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = callback(store, tx);
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = () => reject(tx.error);
    });
}

function cacheRequest(event) {
    const { request } = event;
    if (request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME)
            .then((cache) => fetch(request)
                .then((response) => {
                    const responseClone = response.clone();
                    cache.put(request, responseClone);
                    return response;
                })
                .catch(() => cache.match(request).then((cached) => {
                    if (cached) {
                        return cached;
                    }
                    if (request.mode === 'navigate') {
                        return cache.match(resolveAsset(OFFLINE_FALLBACK_PAGE));
                    }
                    return caches.match(resolveAsset(OFFLINE_FALLBACK_PAGE));
                })))
    );
}

async function queueRequest(payload) {
    if (!payload?.url) {
        throw new Error('Deferred request requires a URL.');
    }
    let body = payload.body || null;
    const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
    const isArrayBuffer = typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView?.(body));
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body && typeof body !== 'string' && !isBlob && !isArrayBuffer && !isFormData) {
        body = JSON.stringify(body);
    }

    const headers = { ...(payload.headers || {}) };
    if (body && typeof body === 'string' && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
    }

    const normalized = {
        url: payload.url,
        method: payload.method || 'POST',
        headers,
        body,
        id: payload.id || `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
    };
    await withStore(STORE_PENDING, 'readwrite', (store) => store.put(normalized));
    if (self.registration && self.registration.sync) {
        try {
            await self.registration.sync.register('leitner-sync:pending');
        } catch (error) {
            console.warn('Failed to register background sync', error);
        }
    }
    return normalized.id;
}

async function flushQueue() {
    const pending = await withStore(STORE_PENDING, 'readonly', (store) => store.getAll());
    if (!Array.isArray(pending) || pending.length === 0) {
        return [];
    }
    const completedIds = [];
    for (const item of pending) {
        try {
            const options = {
                method: item.method,
                headers: item.headers
            };
            if (item.body && !['GET', 'HEAD'].includes(item.method)) {
                options.body = item.body;
            }
            const response = await fetch(item.url, options);
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            completedIds.push(item.id);
        } catch (error) {
            console.warn('Deferred request failed', item, error);
        }
    }
    if (completedIds.length > 0) {
        await withStore(STORE_PENDING, 'readwrite', (store) => {
            completedIds.forEach((id) => store.delete(id));
        });
    }
    return completedIds;
}

async function storeNotification(notification) {
    const payload = {
        ...notification,
        id: notification.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        scheduledAt: notification.scheduledAt || Date.now(),
        createdAt: Date.now()
    };
    await withStore(STORE_NOTIFICATIONS, 'readwrite', (store) => store.put(payload));
    if (self.registration && self.registration.sync) {
        try {
            await self.registration.sync.register(`leitner-notification:${payload.id}`);
        } catch (error) {
            console.warn('Failed to register notification sync', error);
        }
    }
    const delay = Math.max(0, payload.scheduledAt - Date.now());
    if (typeof setTimeout === 'function') {
        setTimeout(() => {
            deliverNotifications([payload.id]).catch((error) => console.warn('Notification delivery failed', error));
        }, delay);
    }
    return payload.id;
}

async function cancelNotification(id) {
    await withStore(STORE_NOTIFICATIONS, 'readwrite', (store) => store.delete(id));
}

async function getDueNotifications(ids) {
    const now = Date.now();
    const notifications = await withStore(STORE_NOTIFICATIONS, 'readonly', (store) => store.getAll());
    return notifications.filter((notification) => {
        if (Array.isArray(ids) && ids.length > 0) {
            return ids.includes(notification.id) && notification.scheduledAt <= now;
        }
        return notification.scheduledAt <= now;
    });
}

async function deliverNotifications(ids) {
    const due = await getDueNotifications(ids);
    if (due.length === 0) {
        return [];
    }
    const delivered = [];
    await Promise.all(due.map(async (notification) => {
        const options = {
            body: notification.body,
            data: notification.data,
            requireInteraction: Boolean(notification.requireInteraction),
            tag: notification.tag || notification.id,
            icon: notification.icon ? resolveAsset(notification.icon) : resolveAsset('mordor-2340048_1280.png')
        };
        try {
            await self.registration.showNotification(notification.title || 'Leitner Reminder', options);
            delivered.push(notification.id);
        } catch (error) {
            console.warn('Notification display failed', error);
        }
    }));
    if (delivered.length > 0) {
        await withStore(STORE_NOTIFICATIONS, 'readwrite', (store) => {
            delivered.forEach((id) => store.delete(id));
        });
    }
    return delivered;
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_PATHS.map((path) => resolveAsset(path))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method === 'GET' && event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const cloned = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                    return response;
                })
                .catch(() => caches.match(event.request).then((cached) => cached || caches.match(resolveAsset(OFFLINE_FALLBACK_PAGE))))
        );
        return;
    }
    cacheRequest(event);
});

self.addEventListener('sync', (event) => {
    if (event.tag === 'leitner-sync:pending') {
        event.waitUntil(flushQueue());
    }
    if (event.tag && event.tag.startsWith('leitner-notification:')) {
        const id = event.tag.split(':')[1];
        event.waitUntil(deliverNotifications(id ? [id] : []));
    }
});

self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (error) {
        payload = { title: 'Leitner', body: event.data?.text() || 'Nouvelle notification' };
    }
    const notificationOptions = {
        body: payload.body || 'Nouvelle révision vous attend.',
        data: payload.data || {},
        tag: payload.tag,
        icon: payload.icon ? resolveAsset(payload.icon) : resolveAsset('mordor-2340048_1280.png')
    };
    const promise = self.registration.showNotification(payload.title || 'Leitner Codex', notificationOptions);
    event.waitUntil(promise);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if ('focus' in client) {
                        client.postMessage({ type: 'notification-click', data: event.notification.data });
                        return client.focus();
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow(targetUrl);
                }
                return null;
            })
    );
});

self.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};
    switch (type) {
    case 'queue-sync':
        event.waitUntil(queueRequest(payload).then((id) => {
            event.ports?.[0]?.postMessage?.({ id });
        }));
        break;
    case 'schedule-notification':
        event.waitUntil(storeNotification(payload).then((id) => {
            event.ports?.[0]?.postMessage?.({ id });
        }));
        break;
    case 'cancel-notification':
        event.waitUntil(cancelNotification(payload?.id));
        break;
    case 'flush-queue':
        event.waitUntil(flushQueue());
        break;
    case 'deliver-notifications':
        event.waitUntil(deliverNotifications(payload?.ids));
        break;
    default:
        break;
    }
});
