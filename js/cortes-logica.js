// Logica de cortes sin DOM ni Firebase. TRANSICIONES es el espejo en cliente de
// transicion() en firestore.rules: la pagina la usa para decidir que botones
// mostrar, pero quien manda de verdad son las reglas del servidor.
(function (raiz) {
  const TRANSICIONES = [
    { de: 'revision',   a: 'aprobacion', roles: ['admin', 'registrador'] },
    { de: 'aprobacion', a: 'revision',   roles: ['admin'] },
    { de: 'revision',   a: 'pagado',     roles: ['admin'] },
    { de: 'aprobacion', a: 'pagado',     roles: ['admin'] },
    { de: 'pagado',     a: 'aprobacion', roles: ['admin'] },
    { de: 'revision',   a: 'anulado',    roles: ['admin'] },
    { de: 'aprobacion', a: 'anulado',    roles: ['admin'] },
    { de: 'revision',   a: 'anulado',    roles: ['registrador'], soloPropio: true },
  ];
  const ACTIVOS = ['revision', 'aprobacion', 'pagado'];
  const MOTIVO_IMPORTADO = 'importado desde versión local';

  function destinosPermitidos(rol, corte, correo) {
    const de = corte.estado || 'revision';
    const out = new Set();
    for (const t of TRANSICIONES) {
      if (t.de !== de || !t.roles.includes(rol)) continue;
      if (t.soloPropio && corte.creadoPor !== correo) continue;
      out.add(t.a);
    }
    return [...out];
  }

  function numeroCorte(n) { return 'Corte ' + String(n).padStart(2, '0'); }

  function numeroSecDe(number) {
    const m = /(\d+)/.exec(String(number || ''));
    return m ? parseInt(m[1], 10) : null;
  }

  function separar(cortes) {
    const activos = [], anulados = [];
    for (const ct of cortes) (ct.estado === 'anulado' ? anulados : activos).push(ct);
    return { activos, anulados };
  }

  function enOtrosCortes(ids, activos) {
    const sel = new Set(ids), out = [];
    for (const ct of activos) {
      const cuantos = (ct.elementIds || []).filter(g => sel.has(g)).length;
      if (cuantos) out.push({ number: ct.number, cuantos });
    }
    return out;
  }

  function elementosFaltantes(activos, idsModelo) {
    const out = [];
    for (const ct of activos) {
      const faltan = (ct.elementIds || []).filter(g => !idsModelo.has(g)).length;
      if (faltan) out.push({ number: ct.number, faltan });
    }
    return out;
  }

  function prepararImportacion(locales, numerosExistentes, idsModelo, correo, ahoraISO) {
    const docs = [], omitidos = [], vistos = new Set();
    let maxSec = 0;
    for (const ct of locales) {
      const n = numeroSecDe(ct.number);
      if (n === null) { omitidos.push({ number: ct.number, motivo: 'sin número reconocible' }); continue; }
      if (numerosExistentes.has(n) || vistos.has(n)) {
        omitidos.push({ number: ct.number, motivo: 'ese número ya existe en la obra' }); continue;
      }
      vistos.add(n);
      maxSec = Math.max(maxSec, n);
      const estado = ACTIVOS.includes(ct.estado) ? ct.estado : 'revision';
      docs.push({ id: 'n' + n, datos: {
        numeroSec: n, number: numeroCorte(n), date: String(ct.date || '').slice(0, 30), notes: String(ct.notes || '').slice(0, 2000),
        elementIds: ct.elementIds || [], totalElements: ct.totalElements || (ct.elementIds || []).length,
        qtyByUnit: ct.qtyByUnit || {}, actividad: ct.actividad || '', nivel: ct.nivel || '',
        edificacion: ct.edificacion || '', descGrupo: ct.descGrupo || '',
        registeredAt: ct.registeredAt || ahoraISO, estado, creadoPor: correo,
        modeloVersion: '', importado: true,
        historial: [{ estado, por: correo, fecha: ahoraISO, motivo: MOTIVO_IMPORTADO }],
      } });
    }
    const faltantes = elementosFaltantes(docs.map(d => d.datos), idsModelo);
    return { docs, omitidos, faltantes, maxSec };
  }

  // Reparte documentos en lotes que respetan los limites de una escritura por
  // lotes de Firestore (500 operaciones, 10 MiB): 400 docs y ~maxBytes de JSON.
  function lotesPorTamano(docs, maxBytes) {
    const lotes = [];
    let actual = [], tam = 0;
    for (const d of docs) {
      const t = JSON.stringify(d).length;
      if (actual.length && (actual.length >= 400 || tam + t > maxBytes)) { lotes.push(actual); actual = []; tam = 0; }
      actual.push(d); tam += t;
    }
    if (actual.length) lotes.push(actual);
    return lotes;
  }

  const api = { TRANSICIONES, ACTIVOS, destinosPermitidos, numeroCorte, numeroSecDe, separar,
                enOtrosCortes, elementosFaltantes, prepararImportacion, lotesPorTamano };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.EurbeCortes = api;
})(typeof window !== 'undefined' ? window : globalThis);
