const DATABASE = 'sutd-response-cache-v1';
const STORE = 'responses';
const STALE_MS = 24 * 60 * 60 * 1000;
const memory = new Map();
const pending = new Map();
let databasePromise;

function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  if (!databasePromise) {
    databasePromise = new Promise((resolve) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return databasePromise;
}

async function readStored(key) {
  try {
    const database = await openDatabase();
    if (!database) return null;
    return await new Promise((resolve) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function writeStored(key, entry) {
  try {
    const database = await openDatabase();
    if (!database) return;
    await new Promise((resolve) => {
      const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put(entry, key);
      request.onsuccess = resolve;
      request.onerror = resolve;
    });
  } catch { /* Browser storage can be unavailable or full. */ }
}

export function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Запрос отменён', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new DOMException('Запрос отменён', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    promise.then((value) => { signal.removeEventListener('abort', abort); resolve(value); }, (error) => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

export function cachedJson(key, loader, ttlMs, fallback) {
  if (!pending.has(key)) {
    const promise = (async () => {
      const saved = memory.get(key) || await readStored(key);
      if (saved && saved.expiresAt > Date.now()) { memory.set(key, saved); return saved.value; }
      if (saved?.retryAfter > Date.now() && saved.expiresAt + STALE_MS > Date.now()) return saved.value;
      try {
        const value = await loader();
        const entry = { value, expiresAt: Date.now() + ttlMs };
        memory.set(key, entry);
        await writeStored(key, entry);
        return value;
      } catch (error) {
        if (saved && saved.expiresAt + STALE_MS > Date.now()) {
          memory.set(key, { ...saved, retryAfter: Date.now() + 5 * 60 * 1000 });
          return saved.value;
        }
        if (!fallback) throw error;
        const value = await fallback();
        const entry = { value, expiresAt: Date.now() + 15 * 60 * 1000 };
        memory.set(key, entry);
        await writeStored(key, entry);
        return value;
      }
    })().finally(() => pending.delete(key));
    pending.set(key, promise);
  }
  return pending.get(key);
}

export async function pruneCache() {
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    const request = transaction.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if ((cursor.value?.expiresAt || 0) + STALE_MS < Date.now()) cursor.delete();
      cursor.continue();
    };
  } catch { /* Cache cleanup is best effort. */ }
}

function groupForKey(key) {
  if (key.startsWith('university:')) return 'university';
  if (/^sutd:\/(student-filter-catalog|teachers|institutes)\//.test(key)) return 'catalogs';
  if (key.startsWith('sutd:')) return 'schedules';
  return null;
}

export async function getCacheUsage() {
  const result = { university: { count: 0, bytes: 0 }, catalogs: { count: 0, bytes: 0 }, schedules: { count: 0, bytes: 0 } };
  const database = await openDatabase();
  if (!database) return result;
  await new Promise((resolve) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const group = groupForKey(String(cursor.key));
      if (group) {
        result[group].count += 1;
        result[group].bytes += new TextEncoder().encode(JSON.stringify(cursor.value?.value || null)).length;
      }
      cursor.continue();
    };
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });
  return result;
}

export async function clearCacheGroup(group) {
  for (const key of memory.keys()) if (groupForKey(key) === group) memory.delete(key);
  const database = await openDatabase();
  if (!database) return;
  await new Promise((resolve) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const request = transaction.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (groupForKey(String(cursor.key)) === group) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });
}
