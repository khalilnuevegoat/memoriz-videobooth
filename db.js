/* Petit wrapper IndexedDB : réglages, images et vidéos restent sur la tablette, hors ligne. */
const DB = (() => {
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open('memoriz-videobooth', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('kv');
        d.createObjectStore('assets');
        const v = d.createObjectStore('videos', { keyPath: 'id' });
        v.createIndex('eventId', 'eventId');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbp;
  }
  function run(store, mode, fn) {
    return open().then(d => new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction annulée'));
    }));
  }
  return {
    get: (store, key) => run(store, 'readonly', s => s.get(key)),
    put: (store, val, key) => run(store, 'readwrite', s => key === undefined ? s.put(val) : s.put(val, key)),
    del: (store, key) => run(store, 'readwrite', s => s.delete(key)),
    byIndex: (store, idx, val) => run(store, 'readonly', s => s.index(idx).getAll(val)),
    countByIndex: (store, idx, val) => run(store, 'readonly', s => s.index(idx).count(val)),
    delByIndex: (store, idx, val) => run(store, 'readwrite', s => {
      const c = s.index(idx).openCursor(val);
      c.onsuccess = () => { const cur = c.result; if (cur) { cur.delete(); cur.continue(); } };
    }),
  };
})();
