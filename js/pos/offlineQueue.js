/**
 * Offline settle queue — IndexedDB primary, localStorage fallback, in-memory cache.
 */
(function (root) {
  "use strict";

  const DB_NAME = "kg_pos_offline";
  const STORE = "queue";
  const LS_KEY = "kg_pos_offline_queue_v1";
  let memory = null;
  let dbPromise = null;

  function lsRead() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function lsWrite(arr) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    } catch (_) {}
  }

  function openDb() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function idbGetAll() {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function idbReplaceAll(items) {
    const db = await openDb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        store.clear();
        (items || []).forEach((it) => store.put(it));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function hydrate() {
    if (memory) return memory;
    const fromIdb = await idbGetAll();
    if (fromIdb) {
      memory = fromIdb;
      lsWrite(memory); // keep LS mirror for emergency
      return memory;
    }
    memory = lsRead();
    return memory;
  }

  function peekSync() {
    return memory ? memory.slice() : lsRead();
  }

  async function peek() {
    await hydrate();
    return memory.slice();
  }

  async function setAll(items) {
    memory = Array.isArray(items) ? items.slice() : [];
    lsWrite(memory);
    await idbReplaceAll(memory);
    return memory.length;
  }

  async function enqueue(job) {
    await hydrate();
    const row = Object.assign(
      {
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        queuedAt: Date.now()
      },
      job
    );
    memory.push(row);
    lsWrite(memory);
    await idbReplaceAll(memory);
    return memory.length;
  }

  const api = {
    LS_KEY,
    hydrate,
    peek,
    peekSync,
    setAll,
    enqueue,
    /** Test helper */
    async _reset() {
      memory = [];
      lsWrite([]);
      await idbReplaceAll([]);
    }
  };

  root.KG = root.KG || {};
  root.KG.offlineQueue = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
