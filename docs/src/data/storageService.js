function getDefaultStorage() {
    if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage;
    }

    const memoryStore = new Map();
    return {
        getItem(key) {
            return memoryStore.has(key) ? memoryStore.get(key) : null;
        },
        setItem(key, value) {
            memoryStore.set(key, value);
        },
        removeItem(key) {
            memoryStore.delete(key);
        },
        clear() {
            memoryStore.clear();
        }
    };
}

export class StorageService {
    constructor(storage = getDefaultStorage()) {
        this.storage = storage;
    }

    getItem(key) {
        try {
            return this.storage.getItem(key);
        } catch (error) {
            console.warn('StorageService#getItem failed', key, error);
            return null;
        }
    }

    setItem(key, value) {
        try {
            this.storage.setItem(key, value);
        } catch (error) {
            console.warn('StorageService#setItem failed', key, error);
        }
    }

    removeItem(key) {
        try {
            this.storage.removeItem(key);
        } catch (error) {
            console.warn('StorageService#removeItem failed', key, error);
        }
    }

    clear() {
        try {
            this.storage.clear();
        } catch (error) {
            console.warn('StorageService#clear failed', error);
        }
    }

    getJSON(key, fallback = null) {
        const value = this.getItem(key);
        if (!value) {
            return fallback;
        }
        try {
            return JSON.parse(value);
        } catch (error) {
            console.warn('StorageService#getJSON parse failed', key, error);
            return fallback;
        }
    }

    setJSON(key, value) {
        try {
            this.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn('StorageService#setJSON failed', key, error);
        }
    }
}
