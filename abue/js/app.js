/* ==========================================================================
   app.js — Interfaz, navegación, formularios y acciones.
   ========================================================================== */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const content = $('#content');
  const fab = $('#fab');
  const modalRoot = $('#modalRoot');

  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /* ---------------- Utilidades de UI ---------------- */
  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      e.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return e;
  }

  function toast(msg, kind = '') {
    const t = h('div', { class: 'toast ' + kind }, msg);
    $('#toastRoot').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2200);
    setTimeout(() => t.remove(), 2600);
  }

  const fmtHour = (d) => {
    let h = d.getHours(); const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return { hh: `${h}:${String(m).padStart(2, '0')}`, ampm };
  };
  const fmtHM = (s) => { const d = Schedule.at(new Date(), s); return fmtHour(d); };
  const fmtFecha = (d) => `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
  const fmtFechaLarga = (d) => `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;

  function confirmDialog(titulo, texto, okLabel = 'Eliminar', danger = true) {
    return new Promise((resolve) => {
      const bd = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === bd) { close(false); } } });
      const box = h('div', { class: 'modal', style: 'padding-bottom:24px' },
        h('div', { class: 'modal__grab' }),
        h('div', { class: 'modal__head' }, h('div', { class: 'modal__title' }, titulo)),
        h('p', { style: 'color:var(--text-soft); margin-bottom:18px' }, texto),
        h('div', { style: 'display:flex; gap:10px' },
          h('button', { class: 'btn secondary', onclick: () => close(false) }, 'Cancelar'),
          h('button', { class: 'btn ' + (danger ? 'danger' : ''), onclick: () => close(true) }, okLabel),
        ),
      );
      bd.appendChild(box);
      modalRoot.appendChild(bd);
      function close(v) { bd.remove(); resolve(v); }
    });
  }

  /* ---------------- Modal genérico ---------------- */
  let _openModal = null;
  function openModal(titulo, buildBody) {
    closeModal();
    const bd = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === bd) closeModal(); } });
    const body = h('div', { class: 'modal-body' });
    const box = h('div', { class: 'modal' },
      h('div', { class: 'modal__grab' }),
      h('div', { class: 'modal__head' },
        h('div', { class: 'modal__title' }, titulo),
        h('button', { class: 'modal__close', onclick: closeModal, 'aria-label': 'Cerrar' }, '✕'),
      ),
      body,
    );
    bd.appendChild(box);
    modalRoot.appendChild(bd);
    _openModal = bd;
    buildBody(body, closeModal);
  }
  function closeModal() { if (_openModal) { _openModal.remove(); _openModal = null; } }

  /* ---------------- Manejo de fotos ---------------- */
  function compressImage(file, maxSide = 1400, quality = 0.82) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width: w, height: h2 } = img;
        if (Math.max(w, h2) > maxSide) {
          const r = maxSide / Math.max(w, h2);
          w = Math.round(w * r); h2 = Math.round(h2 * r);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h2;
        c.getContext('2d').drawImage(img, 0, 0, w, h2);
        c.toBlob((b) => resolve(b || file), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // Componente selector de foto reutilizable. Devuelve un objeto con .getPhotoId()
  function photoPicker({ label = 'Foto', current = null } = {}) {
    let photoId = current;
    let pendingBlob = null;
    const prev = h('img', { class: 'photo-pick__prev', alt: '' });
    const txt = h('span', {}, photoId ? 'Cambiar foto' : 'Tomar o elegir foto');
    const input = h('input', { type: 'file', accept: 'image/*', class: 'hide' });
    const btn = h('button', { type: 'button', class: 'photo-pick', onclick: () => input.click() },
      prev, h('span', { class: 'ico', style: 'font-size:24px' }, '📷'), txt);

    if (photoId) Store.getPhotoURL(photoId).then((u) => { if (u) prev.src = u; });
    else prev.style.visibility = 'hidden';

    input.addEventListener('change', async () => {
      const f = input.files[0]; if (!f) return;
      pendingBlob = await compressImage(f);
      prev.src = URL.createObjectURL(pendingBlob);
      prev.style.visibility = 'visible';
      txt.textContent = 'Cambiar foto';
    });

    const wrap = h('div', {}, h('label', { style: 'display:block;font-size:14px;font-weight:700;color:var(--text-soft);margin-bottom:6px' }, label), btn, input);
    return {
      el: wrap,
      async getPhotoId() {
        if (pendingBlob) { photoId = await Store.savePhoto(pendingBlob); pendingBlob = null; }
        return photoId;
      },
    };
  }

  function openViewer(url) {
    const v = h('div', { class: 'viewer', onclick: (e) => { if (e.target === v) v.remove(); } },
      h('button', { class: 'viewer__close', onclick: () => v.remove() }, '✕'),
      h('img', { src: url, alt: 'Estudio' }),
    );
    modalRoot.appendChild(v);
  }

  /* ================================================================
     VISTA: HOY
     ================================================================ */
  async function renderHoy() {
    setHeader('Hoy', fmtFechaLarga(new Date()));
    fab.classList.remove('hidden');

    const [meds, turnos, logs] = await Promise.all([
      Store.listMeds(), Store.listTurnos(), Store.listLogs(),
    ]);
    const logMap = new Map(logs.map((l) => [l.id, l]));
    const hoy = new Date();
    const occ = Schedule.occurrencesForDate(meds, hoy);

    content.innerHTML = '';

    // Aviso de notificaciones
    if (Reminders.permission === 'default' && !App._notifDismissed) {
      content.appendChild(h('div', { class: 'banner warn' },
        h('span', { class: 'banner__ico' }, '🔔'),
        h('div', {}, h('strong', {}, 'Activá las notificaciones'), h('br'),
          'Así el celu te avisa a la hora de cada medicamento.'),
        h('button', { class: 'btn', style: 'width:auto;min-height:38px;padding:0 14px', onclick: enableNotifications }, 'Activar'),
      ));
    }

    // Progreso del día
    const total = occ.length;
    const tomados = occ.filter((o) => logMap.get(o.logId)?.estado === 'tomado').length;
    if (total > 0) {
      const pct = Math.round((tomados / total) * 100);
      content.appendChild(h('div', { class: 'card', style: 'display:flex;align-items:center;gap:16px' },
        progressRing(pct),
        h('div', {},
          h('div', { style: 'font-weight:750;font-size:18px' }, `${tomados} de ${total} tomas`),
          h('div', { style: 'color:var(--text-soft);font-size:14px' },
            tomados === total ? '¡Todo listo por hoy! 🎉' : 'Medicamentos de hoy'),
        ),
      ));
    }

    // Próximo turno (si es hoy o próximos 3 días)
    const prox = turnos.filter((t) => !t.hecho && new Date(t.cuando) >= new Date(Date.now() - 3600000))
      .sort((a, b) => new Date(a.cuando) - new Date(b.cuando))[0];
    if (prox) {
      const d = new Date(prox.cuando);
      const dias = Math.ceil((d - new Date()) / 86400000);
      const cuando = dias <= 0 ? 'Hoy' : dias === 1 ? 'Mañana' : fmtFecha(d);
      const { hh, ampm } = fmtHour(d);
      content.appendChild(h('div', { class: 'section-title' }, '🩺 Próximo turno'));
      content.appendChild(h('button', { class: 'row', onclick: () => turnoForm(prox) },
        h('div', { class: 'row__avatar' }, '🩺'),
        h('div', { class: 'row__body' },
          h('div', { class: 'row__title' }, prox.titulo),
          h('div', { class: 'row__meta' }, `${cuando} · ${hh} ${ampm}${prox.lugar ? ' · ' + prox.lugar : ''}`),
        ),
        h('span', { class: 'badge ' + (dias <= 0 ? 'warn' : '') }, cuando),
      ));
    }

    // Tomas de hoy
    content.appendChild(h('div', { class: 'section-title' }, '💊 Medicamentos de hoy'));
    if (total === 0) {
      content.appendChild(emptyState('🌿', 'Sin medicamentos para hoy',
        'Agregá un medicamento con el botón ＋ para empezar a recibir recordatorios.'));
    } else {
      const now = new Date();
      for (const o of occ) {
        const log = logMap.get(o.logId);
        const done = log?.estado === 'tomado';
        const overdue = !done && o.at < now;
        const { hh, ampm } = fmtHour(o.at);
        const card = h('div', { class: 'dose' + (done ? ' done' : '') + (overdue ? ' overdue' : '') },
          h('div', { class: 'dose__time' },
            h('div', { class: 'dose__hour' }, hh), h('div', { class: 'dose__ampm' }, ampm)),
          h('div', { class: 'dose__pill' }, o.med.emoji || '💊'),
          h('div', { class: 'dose__body' },
            h('div', { class: 'dose__name' }, o.med.nombre),
            h('div', { class: 'dose__meta' },
              (o.med.dosis || 'Sin dosis') + (overdue ? ' · atrasado' : done && log.at ? ' · tomado ' + fmtHour(new Date(log.at)).hh : '')),
          ),
          h('button', { class: 'dose__check', 'aria-label': 'Marcar como tomado',
            onclick: () => toggleDose(o, done) }, done ? '✓' : ''),
        );
        content.appendChild(card);
      }
    }
  }

  function progressRing(pct) {
    const r = 26, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '64'); svg.setAttribute('height', '64'); svg.setAttribute('viewBox', '0 0 64 64');
    const mk = (stroke, dash) => {
      const ci = document.createElementNS(NS, 'circle');
      ci.setAttribute('cx', '32'); ci.setAttribute('cy', '32'); ci.setAttribute('r', r);
      ci.setAttribute('fill', 'none'); ci.setAttribute('stroke', stroke); ci.setAttribute('stroke-width', '7');
      ci.setAttribute('stroke-linecap', 'round');
      if (dash != null) { ci.setAttribute('stroke-dasharray', c); ci.setAttribute('stroke-dashoffset', off);
        ci.setAttribute('transform', 'rotate(-90 32 32)'); }
      return ci;
    };
    svg.appendChild(mk('var(--border)'));
    svg.appendChild(mk('var(--verde)', off));
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', '32'); t.setAttribute('y', '37'); t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '15'); t.setAttribute('font-weight', '800'); t.setAttribute('fill', 'var(--text)');
    t.textContent = pct + '%';
    svg.appendChild(t);
    return svg;
  }

  async function toggleDose(occ, wasDone) {
    if (wasDone) {
      await Store.deleteLog(occ.logId);
      toast('Toma desmarcada');
    } else {
      await Store.setLog({ id: occ.logId, medId: occ.medId, estado: 'tomado',
        programada: occ.at.toISOString(), at: new Date().toISOString() });
      toast('¡Tomado! 👍', 'ok');
      // Descontar stock si corresponde
      if (typeof occ.med.stock === 'number' && occ.med.stock > 0) {
        occ.med.stock -= 1;
        await Store.saveMed(occ.med);
        if (occ.med.stock <= (occ.med.stockAviso || 5)) {
          toast(`Quedan ${occ.med.stock} de ${occ.med.nombre}`, 'err');
        }
      }
    }
    Reminders.reschedule();
    renderHoy();
  }

  /* ================================================================
     VISTA: MEDICAMENTOS
     ================================================================ */
  async function renderMedicamentos() {
    setHeader('Medicamentos', 'Lista y horarios');
    fab.classList.remove('hidden');
    const meds = await Store.listMeds();
    content.innerHTML = '';
    if (!meds.length) {
      content.appendChild(emptyState('💊', 'Todavía no hay medicamentos',
        'Tocá ＋ para agregar el primero: nombre, dosis, días y horarios.'));
      return;
    }
    for (const med of meds) {
      const horarios = (med.horarios || []).map((s) => { const f = fmtHM(s); return `${f.hh} ${f.ampm}`; }).join(' · ');
      const freq = med.frecuencia === 'dias'
        ? (med.dias || []).map((d) => DIAS[d]).join(' ')
        : 'Todos los días';
      const lowStock = typeof med.stock === 'number' && med.stock <= (med.stockAviso || 5);
      const row = h('button', { class: 'row' + (med.activo === false ? ' inactive' : ''), onclick: () => medForm(med) },
        h('div', { class: 'row__avatar' }, med.emoji || '💊'),
        h('div', { class: 'row__body' },
          h('div', { class: 'row__title' }, med.nombre + (med.dosis ? ` · ${med.dosis}` : '')),
          h('div', { class: 'row__meta' }, `${freq} · ${horarios || 'sin horario'}`),
          lowStock ? h('span', { class: 'badge danger', style: 'margin-top:4px' }, `Quedan ${med.stock}`) : null,
          med.activo === false ? h('span', { class: 'badge', style: 'margin-top:4px' }, 'Pausado') : null,
        ),
        h('span', { class: 'row__chev' }, '›'),
      );
      content.appendChild(row);
    }
  }

  const EMOJIS_MED = ['💊', '💉', '🩹', '🧴', '🌡️', '🫀', '🦴', '👁️', '🧠', '🍬', '🩸', '💧'];

  function medForm(med) {
    const esNuevo = !med;
    med = med || { frecuencia: 'diario', dias: [1, 2, 3, 4, 5, 6, 0], horarios: ['08:00'], activo: true, emoji: '💊' };
    let horarios = [...(med.horarios || [])];
    let dias = new Set(med.dias || []);
    let frecuencia = med.frecuencia || 'diario';
    let emoji = med.emoji || '💊';

    openModal(esNuevo ? 'Nuevo medicamento' : 'Editar medicamento', (body) => {
      const nombre = input('Nombre del medicamento', med.nombre, 'Ej: Enalapril');
      const dosis = input('Dosis', med.dosis, 'Ej: 1 comprimido, 10mg');

      // Emoji
      const emojiRow = h('div', { class: 'chips' });
      EMOJIS_MED.forEach((e) => {
        const c = h('button', { type: 'button', class: 'chip' + (e === emoji ? ' on' : ''), onclick: () => {
          emoji = e; [...emojiRow.children].forEach((ch) => ch.classList.toggle('on', ch.textContent === e));
        } }, e);
        emojiRow.appendChild(c);
      });

      // Frecuencia
      const diasWrap = h('div', { class: 'chips', style: 'margin-top:10px' });
      DIAS.forEach((d, i) => {
        const c = h('button', { type: 'button', class: 'chip' + (dias.has(i) ? ' on' : ''), onclick: () => {
          if (dias.has(i)) dias.delete(i); else dias.add(i);
          c.classList.toggle('on');
        } }, d);
        diasWrap.appendChild(c);
      });
      const seg = h('div', { class: 'seg' },
        segBtn('Todos los días', frecuencia === 'diario', () => { frecuencia = 'diario'; diasWrap.classList.add('hide'); }),
        segBtn('Días elegidos', frecuencia === 'dias', () => { frecuencia = 'dias'; diasWrap.classList.remove('hide'); }),
      );
      if (frecuencia !== 'dias') diasWrap.classList.add('hide');

      // Horarios
      const horariosWrap = h('div', { class: 'chips' });
      function pintarHorarios() {
        horariosWrap.innerHTML = '';
        horarios.sort();
        horarios.forEach((t, idx) => {
          const f = fmtHM(t);
          horariosWrap.appendChild(h('span', { class: 'chip on chip--time' },
            `${f.hh} ${f.ampm}`,
            h('span', { class: 'chip__x', style: 'cursor:pointer', onclick: () => { horarios.splice(idx, 1); pintarHorarios(); } }, '✕'),
          ));
        });
        // Selector de hora VISIBLE dentro de un chip "＋ hora" (el reloj se abre al tocarlo)
        const addInput = h('input', {
          type: 'time',
          'aria-label': 'Agregar horario',
          style: 'border:none; background:transparent; color:var(--azul); font:inherit; font-weight:700; width:74px; padding:0; cursor:pointer;',
          onchange: (e) => {
            const v = e.target.value;
            if (v && !horarios.includes(v)) { horarios.push(v); pintarHorarios(); }
          },
        });
        const addLabel = h('label', { class: 'chip chip--add', style: 'gap:6px; cursor:pointer;',
          onclick: () => { try { addInput.showPicker && addInput.showPicker(); } catch (_) {} } },
          '＋ hora', addInput);
        horariosWrap.appendChild(addLabel);
      }
      pintarHorarios();

      // Vigencia y stock
      const desde = input('Desde', med.desde || Schedule.ymd(new Date()), '', 'date');
      const hasta = input('Hasta (opcional)', med.hasta || '', 'Dejar vacío = sin fin', 'date');
      const stock = input('Cantidad disponible (opcional)', med.stock ?? '', 'Ej: 30', 'number');
      const notas = textarea('Notas (opcional)', med.notas, 'Ej: tomar con comida');

      body.append(
        field(nombre),
        field(dosis),
        labeled('Ícono', emojiRow),
        labeled('¿Qué días?', h('div', {}, seg, diasWrap)),
        labeled('¿A qué horas?', horariosWrap),
        h('div', { class: 'row-2' }, field(desde), field(hasta)),
        field(stock),
        field(notas),
        h('div', { style: 'display:flex;gap:10px;margin-top:8px' },
          !esNuevo ? h('button', { class: 'btn secondary', style: 'flex:0 0 auto', onclick: async () => {
            const activo = med.activo === false;
            med.activo = activo; await Store.saveMed(med);
            toast(activo ? 'Reactivado' : 'Pausado'); closeModal(); renderMedicamentos(); Reminders.reschedule();
          } }, med.activo === false ? '▶ Reactivar' : '⏸ Pausar') : null,
          h('button', { class: 'btn', onclick: guardar }, 'Guardar'),
        ),
        !esNuevo ? h('button', { class: 'btn ghost danger', style: 'margin-top:12px;color:var(--rojo)', onclick: async () => {
          if (await confirmDialog('¿Eliminar medicamento?', `Se eliminará "${med.nombre}" y sus recordatorios.`)) {
            await Store.deleteMed(med.id); await Store.deletePhoto(med.foto);
            toast('Eliminado'); closeModal(); renderMedicamentos(); Reminders.reschedule();
          }
        } }, '🗑 Eliminar') : null,
      );

      async function guardar() {
        const nombreVal = nombre.querySelector('input').value.trim();
        if (!nombreVal) { toast('Poné el nombre del medicamento', 'err'); return; }
        if (!horarios.length) { toast('Agregá al menos un horario', 'err'); return; }
        Object.assign(med, {
          nombre: nombreVal,
          dosis: dosis.querySelector('input').value.trim(),
          emoji, frecuencia,
          dias: frecuencia === 'dias' ? [...dias].sort() : [],
          horarios: [...horarios].sort(),
          desde: desde.querySelector('input').value || null,
          hasta: hasta.querySelector('input').value || null,
          stock: stock.querySelector('input').value === '' ? null : Number(stock.querySelector('input').value),
          notas: notas.querySelector('textarea').value.trim(),
          activo: med.activo !== false,
        });
        await Store.saveMed(med);
        toast(esNuevo ? 'Medicamento agregado 💊' : 'Cambios guardados', 'ok');
        closeModal(); renderMedicamentos(); Reminders.reschedule();
      }
    });
  }

  /* ================================================================
     VISTA: TURNOS
     ================================================================ */
  async function renderTurnos() {
    setHeader('Turnos médicos', 'Citas y avisos');
    fab.classList.remove('hidden');
    const turnos = await Store.listTurnos();
    content.innerHTML = '';
    const ahora = new Date();
    const prox = turnos.filter((t) => !t.hecho && new Date(t.cuando) >= new Date(ahora - 3600000));
    const pasados = turnos.filter((t) => t.hecho || new Date(t.cuando) < new Date(ahora - 3600000)).reverse();

    if (!turnos.length) {
      content.appendChild(emptyState('🩺', 'Sin turnos cargados',
        'Tocá ＋ para agregar una cita médica y recibir el aviso antes.'));
      return;
    }
    if (prox.length) {
      content.appendChild(h('div', { class: 'section-title' }, '📅 Próximos'));
      prox.forEach((t) => content.appendChild(turnoRow(t)));
    }
    if (pasados.length) {
      content.appendChild(h('div', { class: 'section-title' }, '✔ Anteriores'));
      pasados.forEach((t) => content.appendChild(turnoRow(t, true)));
    }
  }

  function turnoRow(t, viejo = false) {
    const d = new Date(t.cuando);
    const { hh, ampm } = fmtHour(d);
    return h('button', { class: 'row' + (viejo ? ' inactive' : ''), onclick: () => turnoForm(t) },
      h('div', { class: 'row__avatar' }, t.emoji || '🩺'),
      h('div', { class: 'row__body' },
        h('div', { class: 'row__title' }, t.titulo),
        h('div', { class: 'row__meta' }, `${fmtFecha(d)} · ${hh} ${ampm}${t.lugar ? ' · ' + t.lugar : ''}`),
      ),
      t.hecho ? h('span', { class: 'badge ok' }, 'Hecho') : h('span', { class: 'row__chev' }, '›'),
    );
  }

  function turnoForm(t) {
    const esNuevo = !t;
    t = t || { emoji: '🩺', avisos: [1440, 120] };
    let avisos = new Set(t.avisos || [120]);
    let emoji = t.emoji || '🩺';
    const AVISOS = [[30, '30 min'], [120, '2 h'], [1440, '1 día'], [2880, '2 días']];
    const EMOJIS_T = ['🩺', '🦷', '👁️', '🫀', '🩻', '💉', '🧠', '🦴', '🧪'];

    openModal(esNuevo ? 'Nuevo turno' : 'Editar turno', (body) => {
      const titulo = input('¿Qué turno es?', t.titulo, 'Ej: Cardiólogo, análisis de sangre');
      const medico = input('Médico / lugar (opcional)', t.lugar, 'Ej: Dra. Pérez, Hospital Italiano');
      let cuandoVal = t.cuando ? toLocalInput(new Date(t.cuando)) : '';
      const cuando = input('Fecha y hora', cuandoVal, '', 'datetime-local');
      const notas = textarea('Notas (opcional)', t.notas, 'Ej: llevar estudios previos, en ayunas');

      const emojiRow = h('div', { class: 'chips' });
      EMOJIS_T.forEach((e) => emojiRow.appendChild(h('button', { type: 'button', class: 'chip' + (e === emoji ? ' on' : ''),
        onclick: () => { emoji = e; [...emojiRow.children].forEach((c) => c.classList.toggle('on', c.textContent === e)); } }, e)));

      const avisoRow = h('div', { class: 'chips' });
      AVISOS.forEach(([min, lbl]) => avisoRow.appendChild(h('button', { type: 'button', class: 'chip' + (avisos.has(min) ? ' on' : ''),
        onclick: (e) => { if (avisos.has(min)) avisos.delete(min); else avisos.add(min); e.currentTarget.classList.toggle('on'); } }, lbl)));

      body.append(
        field(titulo), field(medico), field(cuando),
        labeled('Ícono', emojiRow),
        labeled('Avisarme antes', avisoRow),
        field(notas),
        h('div', { style: 'display:flex;gap:10px;margin-top:8px' },
          !esNuevo ? h('button', { class: 'btn secondary', onclick: async () => {
            t.hecho = !t.hecho; await Store.saveTurno(t); toast(t.hecho ? 'Marcado como hecho' : 'Reabierto');
            closeModal(); renderTurnos(); Reminders.reschedule();
          } }, t.hecho ? '↩ Reabrir' : '✔ Marcar hecho') : null,
          h('button', { class: 'btn', onclick: guardar }, 'Guardar'),
        ),
        !esNuevo ? h('button', { class: 'btn ghost', style: 'margin-top:12px;color:var(--rojo)', onclick: async () => {
          if (await confirmDialog('¿Eliminar turno?', `Se eliminará "${t.titulo}".`)) {
            await Store.deleteTurno(t.id); toast('Eliminado'); closeModal(); renderTurnos(); Reminders.reschedule();
          }
        } }, '🗑 Eliminar') : null,
      );

      async function guardar() {
        const tit = titulo.querySelector('input').value.trim();
        const cu = cuando.querySelector('input').value;
        if (!tit) { toast('Poné de qué es el turno', 'err'); return; }
        if (!cu) { toast('Elegí fecha y hora', 'err'); return; }
        Object.assign(t, {
          titulo: tit, lugar: medico.querySelector('input').value.trim(),
          cuando: new Date(cu).toISOString(), notas: notas.querySelector('textarea').value.trim(),
          emoji, avisos: [...avisos].sort((a, b) => a - b), hecho: t.hecho || false,
        });
        await Store.saveTurno(t);
        toast(esNuevo ? 'Turno agregado 🩺' : 'Cambios guardados', 'ok');
        closeModal(); renderTurnos(); Reminders.reschedule();
      }
    });
  }

  /* ================================================================
     VISTA: ESTUDIOS (fotos de resultados)
     ================================================================ */
  async function renderEstudios() {
    setHeader('Estudios', 'Fotos de resultados');
    fab.classList.remove('hidden');
    const estudios = await Store.listEstudios();
    content.innerHTML = '';
    if (!estudios.length) {
      content.appendChild(emptyState('📸', 'Sin estudios guardados',
        'Sacale una foto a los resultados o análisis con ＋ para tenerlos siempre a mano.'));
      return;
    }
    // Agrupar por mes
    const grid = h('div', { class: 'gallery' });
    for (const e of estudios) {
      const cell = h('button', { class: 'gallery__item', onclick: () => estudioForm(e) },
        h('div', { class: 'cap' }, e.titulo || fmtFecha(new Date(e.fecha))));
      Store.getPhotoURL(e.foto).then((u) => { if (u) cell.insertBefore(h('img', { src: u, alt: e.titulo || '' }), cell.firstChild); });
      grid.appendChild(cell);
    }
    content.appendChild(grid);
  }

  function estudioForm(e) {
    const esNuevo = !e;
    e = e || { fecha: new Date().toISOString() };
    const picker = photoPicker({ label: 'Foto del estudio', current: e.foto });
    openModal(esNuevo ? 'Nuevo estudio' : 'Estudio', (body) => {
      const titulo = input('Título', e.titulo, 'Ej: Análisis de sangre');
      const fecha = input('Fecha', Schedule.ymd(new Date(e.fecha)), '', 'date');
      const notas = textarea('Notas (opcional)', e.notas, 'Ej: colesterol un poco alto');

      const verBtn = e.foto ? h('button', { class: 'btn secondary', style: 'margin-bottom:14px', onclick: async () => {
        const u = await Store.getPhotoURL(e.foto); if (u) openViewer(u);
      } }, '🔍 Ver foto grande') : null;

      body.append(
        picker.el,
        verBtn,
        field(titulo), field(fecha), field(notas),
        h('button', { class: 'btn', onclick: guardar }, 'Guardar'),
        !esNuevo ? h('button', { class: 'btn ghost', style: 'margin-top:12px;color:var(--rojo)', onclick: async () => {
          if (await confirmDialog('¿Eliminar estudio?', 'Se eliminará la foto y sus datos.')) {
            await Store.deletePhoto(e.foto); await Store.deleteEstudio(e.id);
            toast('Eliminado'); closeModal(); renderEstudios();
          }
        } }, '🗑 Eliminar') : null,
      );

      async function guardar() {
        const foto = await picker.getPhotoId();
        if (!foto) { toast('Agregá una foto', 'err'); return; }
        Object.assign(e, {
          foto, titulo: titulo.querySelector('input').value.trim(),
          fecha: (fecha.querySelector('input').value || Schedule.ymd(new Date())) + 'T00:00:00',
          notas: notas.querySelector('textarea').value.trim(),
        });
        await Store.saveEstudio(e);
        toast(esNuevo ? 'Estudio guardado 📸' : 'Guardado', 'ok');
        closeModal(); renderEstudios();
      }
    });
  }

  /* ================================================================
     VISTA: MÁS / FICHA
     ================================================================ */
  async function renderMas() {
    setHeader('Ficha', 'Datos y ajustes');
    fab.classList.add('hidden');
    const ficha = await Store.getConfig('ficha', {});
    const [meds, turnos, estudios] = await Promise.all([Store.listMeds(), Store.listTurnos(), Store.listEstudios()]);
    content.innerHTML = '';

    content.appendChild(h('div', { class: 'stat-grid' },
      stat(meds.filter((m) => m.activo !== false).length, 'Medicamentos'),
      stat(turnos.filter((t) => !t.hecho).length, 'Turnos activos'),
    ));

    // Ficha de la abuela
    content.appendChild(h('div', { class: 'section-title' }, '👵 Ficha médica'));
    const card = h('div', { class: 'card list-menu' },
      fichaRow('🙍‍♀️', 'Nombre', ficha.nombre || 'Sin datos'),
      fichaRow('🏥', 'Obra social', ficha.obra || 'Sin datos'),
      fichaRow('🩸', 'Grupo sanguíneo', ficha.sangre || 'Sin datos'),
      fichaRow('⚠️', 'Alergias', ficha.alergias || 'Sin datos'),
      fichaRow('📞', 'Contacto de emergencia', ficha.emergencia || 'Sin datos'),
    );
    content.appendChild(card);
    content.appendChild(h('button', { class: 'btn secondary', onclick: () => fichaForm(ficha) }, '✏️ Editar ficha'));

    // Ajustes
    content.appendChild(h('div', { class: 'section-title' }, '⚙️ Ajustes'));
    const notifLbl = Reminders.permission === 'granted' ? 'Activadas ✓'
      : Reminders.permission === 'denied' ? 'Bloqueadas' : 'Desactivadas';
    content.appendChild(h('div', { class: 'card list-menu' },
      h('button', { onclick: enableNotifications },
        h('span', { class: 'ico' }, '🔔'), h('span', {}, 'Notificaciones'),
        h('span', { class: 'chev' }, notifLbl)),
      h('button', { onclick: toggleTheme },
        h('span', { class: 'ico' }, '🌗'), h('span', {}, 'Tema claro / oscuro'),
        h('span', { class: 'chev' }, '›')),
      h('button', { onclick: toggleBigText },
        h('span', { class: 'ico' }, '🔠'), h('span', {}, 'Letra más grande'),
        h('span', { class: 'chev' }, localStorage.getItem('bigtext') === '1' ? 'Sí' : 'No')),
      h('button', { onclick: exportarBackup },
        h('span', { class: 'ico' }, '💾'), h('span', {}, 'Descargar respaldo'),
        h('span', { class: 'chev' }, '›')),
    ));
    content.appendChild(h('p', { style: 'text-align:center;color:var(--text-mute);font-size:13px;margin-top:18px' },
      'Cuidado Abue · guardado en este dispositivo'));
  }

  function fichaRow(ico, label, val) {
    return h('div', { style: 'display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)' },
      h('span', { style: 'font-size:20px;width:26px;text-align:center' }, ico),
      h('div', {},
        h('div', { style: 'font-size:12.5px;color:var(--text-mute)' }, label),
        h('div', { style: 'font-weight:600' }, val)));
  }

  function fichaForm(ficha) {
    openModal('Ficha médica', (body) => {
      const nombre = input('Nombre', ficha.nombre, 'Ej: María');
      const obra = input('Obra social / prepaga', ficha.obra, 'Ej: PAMI, OSDE');
      const sangre = input('Grupo sanguíneo', ficha.sangre, 'Ej: 0+');
      const alergias = input('Alergias', ficha.alergias, 'Ej: penicilina');
      const emergencia = input('Contacto de emergencia', ficha.emergencia, 'Ej: Juan 11-5555-5555');
      body.append(field(nombre), field(obra),
        h('div', { class: 'row-2' }, field(sangre), field(alergias)),
        field(emergencia),
        h('button', { class: 'btn', onclick: async () => {
          await Store.setConfig('ficha', {
            nombre: nombre.querySelector('input').value.trim(),
            obra: obra.querySelector('input').value.trim(),
            sangre: sangre.querySelector('input').value.trim(),
            alergias: alergias.querySelector('input').value.trim(),
            emergencia: emergencia.querySelector('input').value.trim(),
          });
          toast('Ficha guardada', 'ok'); closeModal(); renderMas();
        } }, 'Guardar'));
    });
  }

  async function exportarBackup() {
    const data = await Store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `respaldo-abue-${Schedule.ymd(new Date())}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    toast('Respaldo descargado 💾', 'ok');
  }

  /* ---------------- Helpers de formulario ---------------- */
  function input(label, value = '', ph = '', type = 'text') {
    const wrap = h('div', {},
      h('label', {}, label),
      h('input', { class: 'input', type, value: value ?? '', placeholder: ph }));
    return wrap;
  }
  function textarea(label, value = '', ph = '') {
    return h('div', {}, h('label', {}, label), h('textarea', { class: 'textarea', placeholder: ph }, value ?? ''));
  }
  function field(node) { node.classList.add('field'); return node; }
  function labeled(label, node) {
    return h('div', { class: 'field' }, h('label', {}, label), node);
  }
  function segBtn(txt, on, onclick) {
    return h('button', { type: 'button', class: on ? 'on' : '', onclick: (e) => {
      [...e.currentTarget.parentElement.children].forEach((c) => c.classList.remove('on'));
      e.currentTarget.classList.add('on'); onclick();
    } }, txt);
  }
  function emptyState(emoji, title, text) {
    return h('div', { class: 'empty' },
      h('div', { class: 'empty__emoji' }, emoji),
      h('div', { class: 'empty__title' }, title),
      h('div', { class: 'empty__text' }, text));
  }
  function stat(num, lbl) { return h('div', { class: 'stat' }, h('div', { class: 'stat__num' }, String(num)), h('div', { class: 'stat__lbl' }, lbl)); }
  function toLocalInput(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ---------------- Notificaciones y ajustes ---------------- */
  async function enableNotifications() {
    const res = await Reminders.requestPermission();
    if (res === 'granted') {
      toast('Notificaciones activadas 🔔', 'ok');
      $('#btnNotif').classList.add('is-on');
      const n = await Reminders.reschedule();
      setTimeout(() => Reminders.notify('¡Listo! 🎉', { body: 'Vas a recibir los recordatorios de la abue.' }), 400);
    } else if (res === 'denied') {
      toast('Están bloqueadas. Activalas desde los ajustes del navegador.', 'err');
    } else if (res === 'unsupported') {
      toast('Este navegador no soporta notificaciones', 'err');
    }
    if (App.current === 'mas') renderMas();
    if (App.current === 'hoy') renderHoy();
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) document.documentElement.setAttribute('data-theme', next);
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', next);
    renderMas();
  }
  function toggleBigText() {
    const on = localStorage.getItem('bigtext') === '1';
    localStorage.setItem('bigtext', on ? '0' : '1');
    document.documentElement.setAttribute('data-bigtext', on ? '0' : '1');
    renderMas();
  }

  /* ---------------- Router ---------------- */
  const VIEWS = { hoy: renderHoy, medicamentos: renderMedicamentos, turnos: renderTurnos, estudios: renderEstudios, mas: renderMas };
  function setHeader(title, sub) { $('#viewTitle').textContent = title; $('#viewSubtitle').textContent = sub || ''; }

  const App = {
    current: 'hoy',
    _notifDismissed: false,
    go(view) {
      this.current = view;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));
      window.scrollTo(0, 0);
      (VIEWS[view] || renderHoy)();
    },
  };
  window.App = App;

  function onFab() {
    if (App.current === 'turnos') turnoForm();
    else if (App.current === 'estudios') estudioForm();
    else medForm();
  }

  /* ---------------- Arranque ---------------- */
  function init() {
    // Tema y letra guardados
    const th = localStorage.getItem('theme');
    if (th) document.documentElement.setAttribute('data-theme', th);
    if (localStorage.getItem('bigtext') === '1') document.documentElement.setAttribute('data-bigtext', '1');
    if (Reminders.permission === 'granted') $('#btnNotif').classList.add('is-on');

    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => App.go(t.dataset.view)));
    fab.addEventListener('click', onFab);
    $('#btnNotif').addEventListener('click', enableNotifications);

    // Registrar service worker (offline + base para futuras notificaciones)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(() => Reminders.reschedule()).catch(() => {});
    }
    // Reprogramar al volver a la app
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { Reminders.reschedule(); if (App.current === 'hoy') renderHoy(); } });

    App.go('hoy');
    Reminders.reschedule();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
