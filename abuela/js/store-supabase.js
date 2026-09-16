/* ==========================================================================
   store-supabase.js — Guardado en la nube (Supabase) + inicio de sesión.
   Si hay conexión y sesión, reemplaza window.Store por la versión Supabase,
   con la MISMA interfaz que db.js (local), así app.js no cambia.
   ========================================================================== */
(function () {
  if (!window.SUPABASE_URL || !window.supabase) return; // sin config → queda modo local

  const nowISO = () => new Date().toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));

  let SB = null;      // cliente supabase
  let USER = null;    // usuario actual

  /* ---------- Mapeos entre la app y la base ---------- */
  const medToApp = (r) => ({
    id: r.id, nombre: r.nombre, dosis: r.dosis, emoji: r.emoji, frecuencia: r.frecuencia,
    dias: r.dias || [], horarios: r.horarios || [], desde: r.desde, hasta: r.hasta,
    stock: r.stock, stockAviso: r.stock_aviso, notas: r.notas, activo: r.activo, createdAt: r.created_at,
  });
  const medToDb = (m) => ({
    id: m.id, user_id: USER.id, nombre: m.nombre, dosis: m.dosis || null, emoji: m.emoji || '💊',
    frecuencia: m.frecuencia || 'diario', dias: m.dias || [], horarios: m.horarios || [],
    desde: m.desde || null, hasta: m.hasta || null,
    stock: (m.stock === '' || m.stock == null) ? null : m.stock,
    stock_aviso: m.stockAviso == null ? null : m.stockAviso,
    notas: m.notas || null, activo: m.activo !== false, updated_at: nowISO(),
  });

  const turnoToDb = (t) => ({
    id: t.id, user_id: USER.id, titulo: t.titulo, lugar: t.lugar || null, cuando: t.cuando,
    notas: t.notas || null, emoji: t.emoji || '🩺', avisos: t.avisos || [], hecho: !!t.hecho,
  });

  const estudioToDb = (e) => ({
    id: e.id, user_id: USER.id, titulo: e.titulo || null, fecha: e.fecha,
    notas: e.notas || null, foto: e.foto || null,
  });

  /* ---------- Implementación del Store con Supabase ---------- */
  const SupabaseStore = {
    uid: uuid,
    mode: 'supabase',

    // Medicamentos
    async listMeds() {
      const { data, error } = await SB.from('meds').select('*').order('nombre');
      if (error) { console.error(error); return []; }
      return data.map(medToApp);
    },
    async getMed(id) {
      const { data } = await SB.from('meds').select('*').eq('id', id).single();
      return data ? medToApp(data) : null;
    },
    async saveMed(med) {
      if (!med.id) med.id = uuid();
      const { error } = await SB.from('meds').upsert(medToDb(med));
      if (error) { console.error(error); throw error; }
      return med;
    },
    async deleteMed(id) { await SB.from('meds').delete().eq('id', id); },

    // Turnos
    async listTurnos() {
      const { data, error } = await SB.from('turnos').select('*').order('cuando');
      if (error) { console.error(error); return []; }
      return data;
    },
    async getTurno(id) { const { data } = await SB.from('turnos').select('*').eq('id', id).single(); return data; },
    async saveTurno(t) {
      if (!t.id) t.id = uuid();
      const { error } = await SB.from('turnos').upsert(turnoToDb(t));
      if (error) { console.error(error); throw error; }
      return t;
    },
    async deleteTurno(id) { await SB.from('turnos').delete().eq('id', id); },

    // Estudios
    async listEstudios() {
      const { data, error } = await SB.from('estudios').select('*').order('fecha', { ascending: false });
      if (error) { console.error(error); return []; }
      return data;
    },
    async getEstudio(id) { const { data } = await SB.from('estudios').select('*').eq('id', id).single(); return data; },
    async saveEstudio(e) {
      if (!e.id) e.id = uuid();
      const { error } = await SB.from('estudios').upsert(estudioToDb(e));
      if (error) { console.error(error); throw error; }
      return e;
    },
    async deleteEstudio(id) { await SB.from('estudios').delete().eq('id', id); },

    // Fotos (Storage)
    async savePhoto(blob) {
      const path = `${USER.id}/${uuid()}.jpg`;
      const { error } = await SB.storage.from('estudios').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) { console.error(error); throw error; }
      return path;
    },
    async getPhotoURL(path) {
      if (!path) return null;
      const { data } = await SB.storage.from('estudios').createSignedUrl(path, 3600);
      return data ? data.signedUrl : null;
    },
    async deletePhoto(path) { if (path) await SB.storage.from('estudios').remove([path]); },

    // Registro de tomas
    async listLogs() {
      const { data, error } = await SB.from('logs').select('*');
      if (error) { console.error(error); return []; }
      return data.map((l) => ({ id: l.id, medId: l.med_id, estado: l.estado, programada: l.programada, at: l.at }));
    },
    async getLog(id) { const { data } = await SB.from('logs').select('*').eq('id', id).single(); return data; },
    async setLog(log) {
      const row = { id: log.id, user_id: USER.id, med_id: log.medId, estado: log.estado, programada: log.programada, at: log.at };
      const { error } = await SB.from('logs').upsert(row);
      if (error) console.error(error);
      return log;
    },
    async deleteLog(id) { await SB.from('logs').delete().eq('id', id); },

    // Configuración / ficha
    async getConfig(key, def = null) {
      const { data } = await SB.from('config').select('value').eq('key', key).single();
      return data ? data.value : def;
    },
    async setConfig(key, value) {
      await SB.from('config').upsert({ user_id: USER.id, key, value });
    },

    async exportAll() {
      const [meds, turnos, estudios, logs] = await Promise.all([
        this.listMeds(), this.listTurnos(), this.listEstudios(), this.listLogs()]);
      return { meds, turnos, estudios, logs, _exportedAt: nowISO() };
    },
  };

  function activarStore() { window.Store = SupabaseStore; }

  /* ==========================================================================
     Inicio de sesión (pantalla propia)
     ========================================================================== */
  const el = (t, a = {}, ...k) => {
    const e = document.createElement(t);
    for (const [key, v] of Object.entries(a)) {
      if (key === 'class') e.className = v;
      else if (key.startsWith('on') && typeof v === 'function') e.addEventListener(key.slice(2), v);
      else if (v != null) e.setAttribute(key, v);
    }
    k.flat().forEach((c) => c != null && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  };

  function pantallaLogin(onReady) {
    let modo = 'entrar'; // 'entrar' | 'crear'
    const overlay = el('div', { class: 'auth-screen' });

    const email = el('input', { class: 'input', type: 'email', placeholder: 'tucorreo@ejemplo.com', autocomplete: 'email' });
    const pass = el('input', { class: 'input', type: 'password', placeholder: 'Contraseña', autocomplete: 'current-password' });
    const msg = el('div', { class: 'auth-msg' });
    const btn = el('button', { class: 'btn', style: 'margin-top:6px' }, 'Ingresar');
    const toggle = el('button', { class: 'btn ghost', style: 'margin-top:4px' }, '¿No tenés cuenta? Crear una');
    const titulo = el('h2', { style: 'font-size:22px;font-weight:750;margin-bottom:4px' }, 'Ingresá');
    const sub = el('p', { style: 'color:var(--text-soft);font-size:14.5px;margin-bottom:18px' },
      'Con tu correo y una contraseña. Usá los mismos datos en cada celu para compartir la info con la familia.');

    function setModo(m) {
      modo = m;
      if (m === 'entrar') {
        titulo.textContent = 'Ingresá'; btn.textContent = 'Ingresar';
        toggle.textContent = '¿No tenés cuenta? Crear una'; pass.setAttribute('autocomplete', 'current-password');
      } else {
        titulo.textContent = 'Crear cuenta'; btn.textContent = 'Crear cuenta';
        toggle.textContent = '¿Ya tenés cuenta? Ingresar'; pass.setAttribute('autocomplete', 'new-password');
      }
      msg.textContent = '';
    }
    toggle.addEventListener('click', () => setModo(modo === 'entrar' ? 'crear' : 'entrar'));

    async function enviar() {
      const correo = email.value.trim();
      const clave = pass.value;
      if (!correo || !clave) { msg.textContent = 'Completá correo y contraseña.'; return; }
      if (clave.length < 6) { msg.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
      btn.disabled = true; btn.textContent = 'Un momento…'; msg.textContent = '';
      try {
        let res;
        if (modo === 'crear') res = await SB.auth.signUp({ email: correo, password: clave });
        else res = await SB.auth.signInWithPassword({ email: correo, password: clave });
        if (res.error) { msg.textContent = traducirError(res.error.message); return; }
        if (res.data.session) {
          USER = res.data.session.user; activarStore(); overlay.remove(); onReady();
        } else {
          // Cuenta creada pero requiere confirmar por mail
          msg.className = 'auth-msg ok';
          msg.textContent = 'Cuenta creada. Revisá tu correo para confirmar y después ingresá.';
          setModo('entrar');
        }
      } catch (e) {
        msg.textContent = 'No se pudo conectar. Revisá internet e intentá de nuevo.';
      } finally {
        btn.disabled = false; if (modo === 'crear') btn.textContent = 'Crear cuenta'; else btn.textContent = 'Ingresar';
      }
    }
    btn.addEventListener('click', enviar);
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });

    overlay.appendChild(el('div', { class: 'auth-card' },
      el('div', { class: 'auth-logo' }, '💗'),
      titulo, sub,
      el('div', { class: 'field' }, el('label', {}, 'Correo'), email),
      el('div', { class: 'field' }, el('label', {}, 'Contraseña'), pass),
      msg, btn, toggle,
    ));
    document.body.appendChild(overlay);
    setModo('entrar');
    setTimeout(() => email.focus(), 100);
  }

  function traducirError(m) {
    m = (m || '').toLowerCase();
    if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
    if (m.includes('already registered') || m.includes('already been registered')) return 'Ese correo ya tiene cuenta. Tocá "Ingresar".';
    if (m.includes('email not confirmed')) return 'Falta confirmar el correo. Revisá tu casilla.';
    if (m.includes('password')) return 'La contraseña es muy corta (mínimo 6).';
    return 'No se pudo: ' + m;
  }

  /* ---------- API pública de autenticación ---------- */
  window.Auth = {
    async start(onReady) {
      SB = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      let session = null;
      try { session = (await SB.auth.getSession()).data.session; } catch (_) {}
      if (session) { USER = session.user; activarStore(); onReady(); }
      else { pantallaLogin(onReady); }
    },
    get user() { return USER; },
    async signOut() { try { await SB.auth.signOut(); } catch (_) {} location.reload(); },
  };
})();
