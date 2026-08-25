// Simple IndexedDB Wrapper
const DB_NAME = 'pt_tracker_db';
const DB_VERSION = 1;

let db;

export function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => reject('IndexedDB error: ' + event.target.error);

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Exercises store
            if (!db.objectStoreNames.contains('exercises')) {
                const exerciseStore = db.createObjectStore('exercises', { keyPath: 'id' });
                exerciseStore.createIndex('categories', 'categories', { multiEntry: true });
            }

            // Templates store
            if (!db.objectStoreNames.contains('templates')) {
                db.createObjectStore('templates', { keyPath: 'id' });
            }

            // Workout logs store
            if (!db.objectStoreNames.contains('workout_logs')) {
                const logStore = db.createObjectStore('workout_logs', { keyPath: 'id' });
                logStore.createIndex('date', 'date');
                logStore.createIndex('workout_kind', 'workout_kind');
            }
        };
    });
}

export function getAll(storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function get(storeName, id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function put(storeName, item) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function putAll(storeName, items) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        let completed = 0;
        let hasError = false;

        if (items.length === 0) {
            resolve();
            return;
        }

        items.forEach(item => {
            const request = store.put(item);
            request.onsuccess = () => {
                completed++;
                if (completed === items.length && !hasError) resolve();
            };
            request.onerror = () => {
                hasError = true;
                reject(request.error);
            };
        });
    });
}
