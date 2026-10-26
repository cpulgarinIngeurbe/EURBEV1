// Agente de voz (ElevenLabs): herramientas de cliente que el agente llama
// mientras conversa. Cada una devuelve el texto que el agente le dice a la
// persona. Solo usan lo que ya existe en index.html (filtros en cadena,
// seleccion, cortes) y en cortes-nube.js; ninguna abre confirm/prompt/alert,
// que congelarian la conversacion.
// Registrar un corte o cambiar su estado va en dos pasos (resumen y luego
// confirmado=true) y, mientras se prueba, solo en obras del entorno «Pruebas».
(function () {
  // Pegar aqui el agent-id del agente creado en ElevenLabs (docs/agente-voz/)
  const AGENT_ID = '';
  const WIDGET_JS = 'https://unpkg.com/@elevenlabs/convai-widget-embed';

  const L = window.EurbeAgenteLogica;
  const S = () => window.SESION;
  const $ = id => document.getElementById(id);
  const confirmador = L.crearConfirmador();
  let verificandoObra = Promise.resolve(false);

  const ETIQUETA = { contrato: 'contrato', edificacion: 'edificación', nivel: 'nivel',
    grupo: 'grupo', actividad: 'actividad' };
  const num = v => Number(v).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lblEstado = e => (CUT_ESTADOS[e] && CUT_ESTADOS[e].lbl.toLowerCase()) || e;
  const esSi = v => v === true || /^(true|si|sí)$/i.test(String(v || '').trim());
  const texto = v => (v == null ? '' : String(v)).trim();
  const hayModelo = () => STATE.elements && STATE.elements.length > 0;
  const visibles = () => STATE.elements.filter(el => STATE.meshes[el.globalId] && STATE.meshes[el.globalId].visible);

  // ── Filtros ──
  const opcionesDe = f => f.multi ? MS[f.key].opts.slice()
    : [...$(f.sel).options].map(o => o.value).filter(Boolean);

  function fotoFiltros() {
    const valores = {};
    CADENA_FILTROS.forEach(f => { valores[f.key] = f.multi ? [...MS[f.key].sel] : $(f.sel).value; });
    return { valores, estado: $('f-estado').value };
  }

  function vaciarFiltros() {
    CADENA_FILTROS.forEach(f => {
      if (f.multi) { MS[f.key].sel.clear(); msEtiqueta(f.key); } else $(f.sel).value = '';
    });
    $('f-estado').value = 'all';
  }

  // Cada desplegable solo admite lo que existe bajo los de arriba, asi que se
  // fijan en orden, recalculando opciones antes de cada uno
  function fijar(f, valores) {
    if (f.multi) { MS[f.key].sel.clear(); valores.forEach(v => MS[f.key].sel.add(v)); msEtiqueta(f.key); }
    else $(f.sel).value = valores[0] || '';
  }

  function restaurar(foto) {
    vaciarFiltros();
    CADENA_FILTROS.forEach(f => {
      refreshFilterOptions();
      const v = foto.valores[f.key];
      fijar(f, Array.isArray(v) ? v : (v ? [v] : []));
    });
    $('f-estado').value = foto.estado;
    applyFilters();
    sincronizarChips();
  }

  function describirFiltros() {
    const partes = [];
    CADENA_FILTROS.forEach(f => {
      const v = f.multi ? [...MS[f.key].sel] : ($(f.sel).value ? [$(f.sel).value] : []);
      if (v.length) partes.push(ETIQUETA[f.key] + ' ' + v.join(', '));
    });
    const est = $('f-estado').value;
    if (est === 'pending') partes.push('solo pendientes');
    if (est === 'cut') partes.push('solo en cortes');
    return partes.join(' · ');
  }

  function estadoFiltro(t) {
    const n = L.normalizar(t);
    if (!n) return null;
    if (n.includes('pend')) return 'pending';
    if (n.includes('cort') || n.includes('ejecut') || n.includes('registr')) return 'cut';
    if (n.includes('tod')) return 'all';
    return null;
  }

  function sincronizarChips() {
    const nivel = $('f-nivel').value;
    document.querySelectorAll('.level-chip').forEach(c =>
      c.classList.toggle('active', nivel ? c.textContent === nivel : c.textContent === 'Todos'));
  }

  // Lleva la camara a lo que quedo visible (las cajas de las piezas ya estan
  // en coordenadas de la escena); mismo encuadre que resetCamera
  function encuadrarVisibles() {
    if (typeof THREE === 'undefined' || typeof camera === 'undefined' || !camera) return;
    const caja = new THREE.Box3();
    let n = 0;
    for (const el of STATE.elements) {
      const m = STATE.meshes[el.globalId];
      if (m && m.visible && m.geometry && m.geometry.boundingBox) { caja.union(m.geometry.boundingBox); n++; }
    }
    if (!n) return;
    const centro = caja.getCenter(new THREE.Vector3());
    const tam = caja.getSize(new THREE.Vector3());
    const dist = Math.max(tam.x, tam.y, tam.z, 1) * 1.4;
    camera.position.set(centro.x + dist * 0.5, centro.y + dist * 0.7, centro.z + dist * 0.5);
    camera.lookAt(centro);
    controls.target.copy(centro);
    controls.update();
  }

  function opcionesNumeradas(lista) {
    return lista.slice(0, 8).map((o, i) => (i + 1) + ') ' + o).join('  ');
  }

  async function filtrar_elementos(p) {
    if (!hayModelo()) return 'No hay ningún modelo cargado todavía.';
    const estado = p.estado ? estadoFiltro(p.estado) : null;
    if (p.estado && !estado) return 'El estado puede ser: pendiente, en corte o todos.';
    if (!CADENA_FILTROS.some(f => texto(p[f.key])) && !estado)
      return 'Dime qué quieres ver: un nivel, un grupo, una actividad, un contrato o una edificación.';

    const foto = fotoFiltros();
    if (!esSi(p.acumular)) vaciarFiltros();
    for (const f of CADENA_FILTROS) {
      refreshFilterOptions();
      const dicho = texto(p[f.key]);
      if (!dicho) continue;
      const opciones = opcionesDe(f);
      const r = L.emparejar(dicho, opciones, { nivel: f.key === 'nivel', multi: f.multi });
      if (r.ambiguo) {
        restaurar(foto);
        return `Hay varias opciones de ${ETIQUETA[f.key]} que coinciden con "${dicho}": ${opcionesNumeradas(r.candidatos)}. ` +
          'Pregúntale al usuario cuál quiere y vuelve a llamar a filtrar_elementos con el nombre exacto de la opción.';
      }
      if (!r.valores.length) {
        const donde = describirFiltros();   // lo pedido hasta aqui, antes de restaurar
        restaurar(foto);
        return `No encontré ${ETIQUETA[f.key]} "${dicho}"${donde ? ' (dentro de: ' + donde + ')' : ''}. ` +
          `Opciones disponibles: ${opciones.slice(0, 15).join(', ') || 'ninguna'}. No se cambió la vista.`;
      }
      fijar(f, r.valores);
    }
    if (estado) $('f-estado').value = estado;
    applyFilters();
    sincronizarChips();
    encuadrarVisibles();
    const n = visibles().length;
    return `Mostrando ${n} de ${STATE.elements.length} elementos (${describirFiltros() || 'sin filtros'}).` +
      (n ? '' : ' Ningún elemento cumple ese filtro.');
  }

  async function limpiar_filtros() {
    if (!hayModelo()) return 'No hay ningún modelo cargado todavía.';
    clearFilters();
    sincronizarChips();
    if (typeof resetCamera === 'function') resetCamera();
    return `Mostrando el modelo completo: ${STATE.elements.length} elementos.`;
  }

  // ── Seleccion y consultas ──
  function cantidades(els) {
    const porUnidad = {};
    els.forEach(el => {
      if (el.cantidad == null || isNaN(el.cantidad)) return;
      const u = el.unidad || 'sin unidad';
      porUnidad[u] = (porUnidad[u] || 0) + Number(el.cantidad);
    });
    return Object.entries(porUnidad).map(([u, v]) => num(v) + ' ' + u).join('; ');
  }

  function resumenDe(els) {
    const unicos = k => [...new Set(els.map(e => e[k]).filter(Boolean))];
    const parte = (k, nombre) => {
      const v = unicos(k);
      return v.length ? nombre + ' ' + (v.length > 3 ? v.slice(0, 3).join(', ') + ` y ${v.length - 3} más` : v.join(', ')) : '';
    };
    return [parte('nivel', 'nivel'), parte('actividad', 'actividad')].filter(Boolean).join('; ');
  }

  async function seleccionar_visibles() {
    if (!hayModelo()) return 'No hay ningún modelo cargado todavía.';
    const vis = new Set(visibles().map(e => e.globalId));
    if (!vis.size) return 'No hay elementos visibles para seleccionar.';
    selectByFilter(el => vis.has(el.globalId));
    const els = STATE.elements.filter(e => vis.has(e.globalId));
    const q = cantidades(els);
    return `Seleccioné ${vis.size} elementos (${resumenDe(els)})${q ? '. Cantidades: ' + q : ''}.`;
  }

  async function limpiar_seleccion() {
    clearSelection();
    return 'Listo, no hay elementos seleccionados.';
  }

  async function consultar_avance() {
    if (!hayModelo()) return 'No hay ningún modelo cargado todavía.';
    const els = visibles();
    if (!els.length) return 'No hay elementos visibles con el filtro actual.';
    const enCorte = els.filter(e => STATE.cutElements.has(e.globalId));
    const porEstado = {};
    enCorte.forEach(e => {
      const est = STATE.cutStateByElement && STATE.cutStateByElement.get(e.globalId);
      porEstado[est] = (porEstado[est] || 0) + 1;
    });
    const detalle = Object.entries(porEstado).map(([e, n]) => `${n} ${lblEstado(e)}`).join(', ');
    const pct = Math.round(enCorte.length / els.length * 100);
    const filtro = describirFiltros();
    const qEj = cantidades(enCorte), qTot = cantidades(els);
    return `${filtro ? 'Con el filtro ' + filtro : 'En todo el modelo'} hay ${els.length} elementos: ` +
      `${enCorte.length} en cortes${detalle ? ' (' + detalle + ')' : ''} y ${els.length - enCorte.length} pendientes; ` +
      `${pct}% por número de elementos.` +
      (qTot ? ` Cantidades en cortes: ${qEj || 'ninguna'}, de un total de ${qTot}.` : '');
  }

  async function consultar_cortes(p) {
    const filtro = p.estado ? L.normalizarEstado(p.estado) : null;
    const lista = (STATE.cuts || []).filter(c => !filtro || estadoDeCorte(c) === filtro)
      .sort((a, b) => (b.numeroSec || 0) - (a.numeroSec || 0));
    if (!lista.length) return filtro ? `No hay cortes ${lblEstado(filtro)}.` : 'No hay cortes registrados en esta obra.';
    const linea = c => `${c.number}: ${lblEstado(estadoDeCorte(c))}, ${c.totalElements || (c.elementIds || []).length} elementos` +
      (c.nivel ? ', ' + c.nivel : '') + (c.actividad ? ', ' + c.actividad : '');
    return `Hay ${lista.length} ${lista.length === 1 ? 'corte' : 'cortes'}${filtro ? ' ' + lblEstado(filtro) : ''}. ` +
      (lista.length > 8 ? 'Los 8 más recientes: ' : '') + lista.slice(0, 8).map(linea).join('. ') + '.';
  }

  // ── Escrituras ──
  async function noPuedeEscribir() {
    const s = S();
    if (!s || !s.obraId) return 'No hay una obra abierta.';
    if (!(await verificandoObra))
      return 'En esta etapa de pruebas el agente solo registra o cambia cortes en obras del entorno «Pruebas». ' +
        'Esta obra no lo es: hazlo a mano desde el panel de cortes.';
    if (!['admin', 'registrador'].includes(s.rol)) return 'Tu rol es de consulta: no puedes registrar ni cambiar cortes.';
    if (s.soloLectura) return 'Sin conexión: ahora no se pueden registrar ni cambiar cortes.';
    return null;
  }

  async function registrar_corte(p) {
    const no = await noPuedeEscribir();
    if (no) return no;
    const ids = [...STATE.selected].sort();
    if (!ids.length) return 'No hay elementos seleccionados. Primero filtra lo que quieres y pide seleccionar lo visible.';
    const notas = texto(p.notas);
    const clave = ['corte', S().obraId, ids.join(','), notas].join('|');

    if (esSi(p.confirmado) && confirmador.confirmar(clave)) {
      try {
        const r = await window.registrarSeleccionComoCorte({ notes: notas });
        return `Listo: se registró el ${r.number} con ${ids.length} elementos. Quedó en revisión.`;
      } catch (e) {
        return 'No se registró el corte: ' + Nube.traducirError(e);
      }
    }
    confirmador.proponer(clave, true);
    const els = ids.map(g => STATE.elements.find(e => e.globalId === g)).filter(Boolean);
    const dup = EurbeCortes.enOtrosCortes(ids, STATE.cuts || []);
    const q = cantidades(els);
    return `Todavía no se ha registrado nada. Resumen para leerle al usuario: se creará un corte nuevo con ${ids.length} elementos ` +
      `(${resumenDe(els)})${q ? ', cantidades ' + q : ''}${notas ? ', con la nota "' + notas + '"' : ''}.` +
      (dup.length ? ' Atención: ' + dup.map(d => `${d.cuantos} de esos elementos ya están en el ${d.number}`).join('; ') + '.' : '') +
      ' Pregúntale si confirma. Solo si dice que sí, vuelve a llamar a registrar_corte con confirmado=true y las mismas notas, en los próximos 2 minutos.';
  }

  async function cambiar_estado_corte(p) {
    const no = await noPuedeEscribir();
    if (no) return no;
    const n = L.numeroDe(p.corte);
    if (n === null) return 'Dime el número del corte, por ejemplo "corte 2".';
    const cut = (STATE.cuts || []).find(c => c.numeroSec === n) || (STATE.cuts || []).find(c => L.numeroDe(c.number) === n);
    if (!cut) {
      const anulado = (STATE.cutsAnulados || []).find(c => c.numeroSec === n);
      if (anulado) return `El ${anulado.number} está anulado; ya no se le puede cambiar el estado.`;
      const hay = (STATE.cuts || []).map(c => c.number).join(', ');
      return `No encontré el corte ${n}. ${hay ? 'Cortes activos: ' + hay + '.' : 'No hay cortes activos.'}`;
    }
    const destino = L.normalizarEstado(p.estado);
    if (destino === 'anulado') return 'Anular un corte no se hace por voz porque requiere un motivo. Hazlo desde el historial de cortes.';
    if (!destino) return 'El estado puede ser: en revisión, en aprobación o pagado.';
    const actual = estadoDeCorte(cut);
    if (actual === destino) return `El ${cut.number} ya está ${lblEstado(actual)}.`;
    if (!L.transicionPermitida(actual, destino, S().rol))
      return `No se puede pasar el ${cut.number} de ${lblEstado(actual)} a ${lblEstado(destino)}` +
        (S().rol === 'admin' ? '.' : ' con tu rol; solo un administrador puede hacerlo.');

    const clave = ['estado', S().obraId, cut.id, destino].join('|');
    if (esSi(p.confirmado) && confirmador.confirmar(clave)) {
      try {
        await Nube.cambiarEstado(S().obraId, cut.id, destino);
        notify(`${cut.number}: ${CUT_ESTADOS[destino].lbl}`);
        return `Listo: el ${cut.number} pasó a ${lblEstado(destino)}.`;
      } catch (e) {
        return 'No se cambió el estado: ' + Nube.traducirError(e);
      }
    }
    confirmador.proponer(clave, true);
    return `Todavía no se ha cambiado nada. Resumen para leerle al usuario: el ${cut.number} ` +
      `(${cut.totalElements || (cut.elementIds || []).length} elementos${cut.nivel ? ', ' + cut.nivel : ''}) ` +
      `pasará de ${lblEstado(actual)} a ${lblEstado(destino)}. Pregúntale si confirma. Solo si dice que sí, ` +
      'vuelve a llamar a cambiar_estado_corte con los mismos datos y confirmado=true, en los próximos 2 minutos.';
  }

  // Un fallo inesperado se le cuenta al agente en vez de dejarlo esperando
  const envolver = fn => async p => {
    try { return await fn(p || {}); }
    catch (e) { console.error('[agente-voz]', e); return 'Ocurrió un error en la aplicación: ' + (e && e.message || e); }
  };
  const herramientas = Object.fromEntries(Object.entries({
    filtrar_elementos, limpiar_filtros, seleccionar_visibles, limpiar_seleccion,
    consultar_avance, consultar_cortes, registrar_corte, cambiar_estado_corte,
  }).map(([k, fn]) => [k, envolver(fn)]));

  // ── Widget ──
  function conectar(widget) {
    widget.addEventListener('elevenlabs-convai:call', ev => { ev.detail.config.clientTools = herramientas; });
  }

  function nuevoWidget() {
    const w = document.createElement('elevenlabs-convai');
    w.setAttribute('agent-id', AGENT_ID);
    conectar(w);
    return w;
  }

  function montarWidget() {
    if (!AGENT_ID) { console.info('[agente-voz] Sin AGENT_ID: widget no montado (herramientas en EurbeAgenteVoz).'); return; }
    if (document.querySelector('elevenlabs-convai')) return;
    if (!document.querySelector(`script[src="${WIDGET_JS}"]`)) {
      const s = document.createElement('script');
      s.src = WIDGET_JS; s.async = true; s.type = 'text/javascript';
      document.body.appendChild(s);
    }
    document.body.appendChild(nuevoWidget());
    // Reinicia la sesion del agente (corta la conversacion en curso)
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'btn-cerrar-agente-voz'; b.textContent = '⏹';
    b.title = 'Cerrar sesión del agente de voz';
    b.style.cssText = 'position:fixed;right:24px;bottom:96px;z-index:9999;width:34px;height:34px;border-radius:50%;' +
      'border:1px solid #ccd;background:#fff;cursor:pointer;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.15)';
    b.onclick = () => {
      const viejo = document.querySelector('elevenlabs-convai');
      if (viejo) viejo.replaceWith(nuevoWidget());
      notify('Sesión del agente de voz cerrada.');
    };
    document.body.appendChild(b);
  }

  async function obraEsDePruebas() {
    const s = S();
    if (!s || !(s.obraEntornos || []).length) return false;
    try {
      const entornos = await Nube.listarEntornos(s);
      return entornos.some(e => s.obraEntornos.includes(e.id) && L.normalizar(e.nombre) === 'pruebas');
    } catch (e) { return false; }
  }

  window.alModeloCargadoAgente = function () {
    verificandoObra = obraEsDePruebas();
    montarWidget();
  };

  window.EurbeAgenteVoz = { herramientas };
})();
