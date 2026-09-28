// Conecta la UI de cortes existente (index.html) con Firestore.
(function () {
  const S = () => window.SESION;
  let dejar = null;
  window.mostrarAnulados = false;

  window.alModeloCargadoCortes = function () {
    if (dejar) dejar();
    dejar = Nube.escucharCortes(S().obraId, (cortes, info) => {
      const { activos, anulados } = EurbeCortes.separar(cortes);
      STATE.cuts = activos;
      STATE.cutsAnulados = anulados;
      S().soloLectura = info.desdeCache && !navigator.onLine;
      rebuildCutIndex();
      refreshAllColors();
      renderHistory();
      updateCutForm();
      if (document.getElementById('tab-avance')?.classList.contains('active')) renderDashboard();
      if (document.getElementById('tab-pendientes')?.classList.contains('active')) renderPendientes();
      window.pintarAvisoConexion && window.pintarAvisoConexion();
    });
  };

  window.registerCut = async function () {
    if (STATE.selected.size === 0) return;
    if (!['admin', 'registrador'].includes(S().rol)) { notify('Tu rol es de consulta: no puedes registrar cortes.'); return; }
    if (S().soloLectura) { notify('Sin conexión — no se pueden registrar cortes'); return; }
    const ids = [...STATE.selected];
    const dup = EurbeCortes.enOtrosCortes(ids, STATE.cuts);
    if (dup.length && !confirm(dup.map(d => `${d.cuantos} elemento(s) ya están en el ${d.number}`).join('\n') +
        '\n\n¿Registrar igual?')) return;

    const els = ids.map(g => STATE.elements.find(e => e.globalId === g)).filter(Boolean);
    const qtyByUnit = {};
    els.forEach(el => { if (el.cantidad != null) qtyByUnit[el.unidad] = (qtyByUnit[el.unidad] || 0) + el.cantidad; });
    const unir = k => [...new Set(els.map(e => e[k]))].filter(Boolean).join(' / ');
    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    try {
      const r = await Nube.registrarCorte(S().obraId, {
        date: document.getElementById('cut-date-input').value,
        notes: document.getElementById('cut-notes-input').value.trim(),
        elementIds: ids, totalElements: ids.length, qtyByUnit,
        actividad: unir('actividad'), nivel: unir('nivel'), edificacion: unir('edificacion'),
        descGrupo: unir('descGrupo'), registeredAt: new Date().toISOString(),
        modeloVersion: S().versionId,
      });
      STATE.selected.clear();
      document.getElementById('cut-notes-input').value = '';
      document.getElementById('cut-date-input').value = '';
      updatePropsPanel();
      notify(`✔ ${r.number} registrado — ${ids.length} elementos`);
      setStatusBar(`${r.number} registrado correctamente.`);
    } catch (e) {
      alert('No se registró el corte.\n\n' + Nube.traducirError(e));
    } finally { btn.disabled = false; }
  };

  window.cambiarEstadoCorte = async function (cutId, estado) {
    if (!estado) return;
    let motivo;
    if (estado === 'anulado') {
      motivo = (prompt('Motivo de la anulación (obligatorio):') || '').trim();
      if (motivo.length < 3) { notify('Anulación cancelada: el motivo es obligatorio.'); renderHistory(); return; }
    }
    try { await Nube.cambiarEstado(S().obraId, cutId, estado, motivo); }
    catch (e) { alert(Nube.traducirError(e)); renderHistory(); }
  };

  window.deleteCut = function (id) { window.cambiarEstadoCorte(id, 'anulado'); };
})();
