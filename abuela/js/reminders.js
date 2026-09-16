/* ==========================================================================
   reminders.js — Cálculo de horarios y notificaciones locales.
   - window.Schedule : utilidades de fechas y ocurrencias de tomas.
   - window.Reminders: programa notificaciones mientras la app está abierta.
   (Las notificaciones con la app CERRADA se agregan en la etapa de Supabase
    + Web Push, porque necesitan un servidor.)
   ========================================================================== */
(function () {
  const DAY_MS = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- Utilidades de fecha ---------- */
  const Schedule = {
    ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },

    parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },

    // Combina 'YYYY-MM-DD' + 'HH:MM' en un Date local
    at(dateObj, timeStr) {
      const [h, m] = timeStr.split(':').map(Number);
      const d = new Date(dateObj);
      d.setHours(h, m, 0, 0);
      return d;
    },

    logId(medId, dateObj, timeStr) { return `${medId}__${this.ymd(dateObj)}__${timeStr}`; },

    // ¿Corresponde este medicamento en la fecha dada?
    appliesOn(med, dateObj) {
      if (med.activo === false) return false;
      const ymd = this.ymd(dateObj);
      if (med.desde && ymd < med.desde) return false;
      if (med.hasta && ymd > med.hasta) return false;
      if (med.frecuencia === 'dias') {
        return Array.isArray(med.dias) && med.dias.includes(dateObj.getDay());
      }
      return true; // 'diario' por defecto
    },

    // Ocurrencias (tomas) de un día concreto, ordenadas por hora
    occurrencesForDate(meds, dateObj) {
      const out = [];
      for (const med of meds) {
        if (!this.appliesOn(med, dateObj)) continue;
        for (const t of (med.horarios || [])) {
          out.push({
            med,
            medId: med.id,
            timeStr: t,
            at: this.at(dateObj, t),
            logId: this.logId(med.id, dateObj, t),
          });
        }
      }
      return out.sort((a, b) => a.at - b.at);
    },
  };

  /* ---------- Notificaciones locales ---------- */
  const Reminders = {
    _timers: [],
    _fired: new Set(),

    get permission() {
      return ('Notification' in window) ? Notification.permission : 'unsupported';
    },

    async requestPermission() {
      if (!('Notification' in window)) return 'unsupported';
      if (Notification.permission === 'granted') return 'granted';
      try { return await Notification.requestPermission(); }
      catch { return Notification.permission; }
    },

    _clear() {
      this._timers.forEach((t) => clearTimeout(t));
      this._timers = [];
    },

    async notify(title, options) {
      const opts = Object.assign({
        icon: 'icons/icon.svg',
        badge: 'icons/icon.svg',
        vibrate: [120, 60, 120],
      }, options);
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg && reg.showNotification) { await reg.showNotification(title, opts); return; }
      } catch (_) {}
      if (this.permission === 'granted') {
        try { new Notification(title, opts); } catch (_) {}
      }
    },

    // Reprograma todo lo pendiente en las próximas ~24 h
    async reschedule() {
      this._clear();
      if (this.permission !== 'granted') return;

      const now = Date.now();
      const horizon = now + DAY_MS;
      const [meds, turnos, logs] = await Promise.all([
        Store.listMeds(), Store.listTurnos(), Store.listLogs(),
      ]);
      const done = new Set(logs.map((l) => l.id));

      const events = [];

      // Tomas de medicamentos de hoy y mañana
      for (const base of [new Date(), new Date(Date.now() + DAY_MS)]) {
        for (const occ of Schedule.occurrencesForDate(meds, base)) {
          const t = occ.at.getTime();
          if (t <= now || t > horizon) continue;
          if (done.has(occ.logId)) continue;
          events.push({
            at: t,
            key: 'med:' + occ.logId,
            title: '💊 Hora del medicamento',
            body: `${occ.med.nombre}${occ.med.dosis ? ' — ' + occ.med.dosis : ''}`,
            tag: occ.logId,
          });
        }
      }

      // Turnos médicos (con avisos anticipados)
      for (const t of turnos) {
        if (t.hecho) continue;
        const when = new Date(t.cuando).getTime();
        const avisos = (t.avisos && t.avisos.length) ? t.avisos : [60]; // minutos antes
        for (const min of avisos) {
          const at = when - min * 60000;
          if (at <= now || at > horizon) continue;
          events.push({
            at,
            key: `turno:${t.id}:${min}`,
            title: '🩺 Turno médico',
            body: `${t.titulo}${min >= 60 ? ' — en ' + Math.round(min / 60) + ' h' : ' — en ' + min + ' min'}`,
            tag: 'turno-' + t.id,
          });
        }
      }

      for (const ev of events) {
        const delay = ev.at - Date.now();
        if (delay < 0 || delay > DAY_MS) continue;
        const timer = setTimeout(() => {
          if (this._fired.has(ev.key)) return;
          this._fired.add(ev.key);
          this.notify(ev.title, { body: ev.body, tag: ev.tag, requireInteraction: true });
          document.dispatchEvent(new CustomEvent('reminder:fired', { detail: ev }));
        }, delay);
        this._timers.push(timer);
      }

      return events.length;
    },
  };

  window.Schedule = Schedule;
  window.Reminders = Reminders;
})();
