const DEFAULT_WORKER_PATH = './src/workers/offlineWorker.js';
const DEFAULT_SCOPE = './';

export class NotificationService {
    constructor(options = {}) {
        this.window = options.windowRef || (typeof window !== 'undefined' ? window : null);
        this.registrationPromise = options.registrationPromise || null;
        this.workerPath = options.workerPath || DEFAULT_WORKER_PATH;
        this.scope = options.scope || DEFAULT_SCOPE;
    }

    async ensureServiceWorker() {
        if (!this.window || !this.window.navigator?.serviceWorker) {
            return null;
        }
        if (!this.registrationPromise) {
            this.registrationPromise = this.window.navigator.serviceWorker.register(this.workerPath, { scope: this.scope });
        }
        try {
            return await this.registrationPromise;
        } catch (error) {
            console.warn('NotificationService#ensureServiceWorker failed', error);
            return null;
        }
    }

    async getRegistration() {
        if (this.registrationPromise) {
            return this.registrationPromise;
        }
        if (!this.window?.navigator?.serviceWorker) {
            return null;
        }
        this.registrationPromise = this.window.navigator.serviceWorker.ready.catch((error) => {
            console.warn('NotificationService#getRegistration ready failed', error);
            return this.ensureServiceWorker();
        });
        return this.registrationPromise;
    }

    async requestPermission() {
        if (typeof Notification === 'undefined') {
            return 'unsupported';
        }
        if (Notification.permission === 'default') {
            try {
                return await Notification.requestPermission();
            } catch (error) {
                console.warn('NotificationService#requestPermission failed', error);
                return 'denied';
            }
        }
        return Notification.permission;
    }

    async ensurePermission() {
        if (typeof Notification === 'undefined') {
            return 'unsupported';
        }
        if (Notification.permission === 'default') {
            return this.requestPermission();
        }
        return Notification.permission;
    }

    async scheduleReminder(options = {}) {
        const {
            id = `reminder-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title = 'Rappel de révision',
            body = 'Il est temps de réviser votre paquet.',
            delayMs = 0,
            data = {},
            requireInteraction = false,
            tag
        } = options;

        const permission = await this.ensurePermission();
        if (permission !== 'granted') {
            return { scheduled: false, reason: 'permission-denied', permission };
        }

        const registration = await this.getRegistration() || await this.ensureServiceWorker();
        const scheduleAt = Date.now() + Math.max(0, delayMs);
        const payload = {
            id,
            title,
            body,
            scheduledAt: scheduleAt,
            data,
            requireInteraction,
            tag
        };

        if (registration?.active) {
            registration.active.postMessage({ type: 'schedule-notification', payload });
            return { scheduled: true, via: 'service-worker', id, scheduleAt };
        }

        if (typeof setTimeout === 'function') {
            setTimeout(() => {
                this.displayImmediateNotification({ title, body, data, requireInteraction, tag });
            }, Math.max(0, delayMs));
            return { scheduled: true, via: 'timeout', id, scheduleAt };
        }

        this.displayImmediateNotification({ title, body, data, requireInteraction, tag });
        return { scheduled: true, via: 'immediate', id, scheduleAt };
    }

    async cancelReminder(id) {
        const registration = await this.getRegistration();
        if (registration?.active) {
            registration.active.postMessage({ type: 'cancel-notification', payload: { id } });
            return true;
        }
        return false;
    }

    displayImmediateNotification({ title, body, data, requireInteraction, tag }) {
        if (typeof Notification === 'undefined') {
            return false;
        }
        try {
            new Notification(title, { body, data, requireInteraction, tag });
            return true;
        } catch (error) {
            console.warn('NotificationService#displayImmediateNotification failed', error);
            return false;
        }
    }

    async scheduleBatch(reminders = []) {
        const results = [];
        for (const reminder of reminders) {
            // eslint-disable-next-line no-await-in-loop
            results.push(await this.scheduleReminder(reminder));
        }
        return results;
    }
}
