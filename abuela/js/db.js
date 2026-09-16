/* ==========================================================================
   db.js — Capa de datos (modo LOCAL con IndexedDB)
   Expone window.Store con métodos async. Más adelante se puede crear una
   implementación equivalente con Supabase sin tocar app.js.
   ========================================================================== */
(function () {
  const DB_NAME = 'cuidado-abue';
  const DB_VERSION = 1;
  const STORES = ['meds', 'turnos', 'estudios', 'logs', 'config', 'fotos'];

  let _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function tx(store, mode) {
    return openDB().then((db) => db.transaction(store, mode).objectStore(store));
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll(store) {
    const os = await tx(store, 'readonly');
    return reqToPromise(os.getAll());
  }
  async function get(store, id) {
    const os = await tx(store, 'readonly');
    return reqToPromise(os.get(id));
  }
  async function put(store, value) {
    const os = await tx(store, 'readwrite');
    await reqToPromise(os.put(value));
    return value;
  }
  async function del(store, id) {
    const os = await tx(store, 'readwrite');
    return reqToPromise(os.delete(id));
  }

  const uid = () =>
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  const nowISO = () => new Date().toISOString();

  const Store = {
    uid,
    mode: 'local',

    /* ---- Medicamentos ---- */
    async listMeds() {
      const all = await getAll('meds');
      return all.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    },
    getMed(id) { return get('meds', id); },
    async saveMed(med) {
      if (!med.id) { med.id = uid(); med.createdAt = nowISO(); }
      med.updatedAt = nowISO();
      return put('meds', med);
    },
    deleteMed(id) { return del('meds', id); },

    /* ---- Turnos médicos ---- */
    async listTurnos() {
      const all = await getAll('turnos');
      return all.sort((a, b) => new Date(a.cuando) - new Date(b.cuando));
    },
    getTurno(id) { return get('turnos', id); },
    async saveTurno(t) {
      if (!t.id) { t.id = uid(); t.createdAt = nowISO(); }
      t.updatedAt = nowISO();
      return put('turnos', t);
    },
    deleteTurno(id) { return del('turnos', id); },

    /* ---- Estudios (fotos de resultados) ---- */
    async listEstudios() {
      const all = await getAll('estudios');
      return all.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    },
    getEstudio(id) { return get('estudios', id); },
    async saveEstudio(e) {
      if (!e.id) { e.id = uid(); e.createdAt = nowISO(); }
      return put('estudios', e);
    },
    deleteEstudio(id) { return del('estudios', id); },

    /* ---- Fotos (blobs) ---- guardadas aparte por su peso ---- */
    async savePhoto(blob) {
      const id = uid();
      await put('fotos', { id, blob });
      return id;
    },
    async getPhotoURL(id) {
      if (!id) return null;
      const rec = await get('fotos', id);
      if (!rec || !rec.blob) return null;
      return URL.createObjectURL(rec.blob);
    },
    deletePhoto(id) { return id ? del('fotos', id) : Promise.resolve(); },

    /* ---- Registro de tomas (logs) ---- clave: medId|fechaISO(local del día+hora) */
    async listLogs() { return getAll('logs'); },
    async getLog(id) { return get('logs', id); },
    async setLog(log) {
      if (!log.id) log.id = uid();
      return put('logs', log);
    },
    deleteLog(id) { return del('logs', id); },

    /* ---- Configuración / ficha ---- */
    async getConfig(key, def = null) {
      const rec = await get('config', key);
      return rec ? rec.value : def;
    },
    async setConfig(key, value) {
      return put('config', { id: key, value });
    },

    /* ---- Utilidad: exportar todo (respaldo) ---- */
    async exportAll() {
      const data = {};
      for (const s of ['meds', 'turnos', 'estudios', 'logs', 'config']) {
        data[s] = await getAll(s);
      }
      data._exportedAt = nowISO();
      return data;
    },
  };

  window.Store = Store;
})();
