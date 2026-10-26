// Logica del agente de voz, sin DOM: entender lo que la persona dijo y
// emparejarlo con las opciones reales del modelo («nivel 2», «piso dos» o
// «segundo piso» -> «Piso 2»), y la confirmacion en dos pasos antes de
// escribir cortes. Lo usa js/agente-voz.js.
(function (raiz) {
  const normalizar = s => String(s == null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  const CARDINALES = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
    ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
    dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20 };
  const ORDINALES = { primer: 1, primero: 1, primera: 1, segundo: 2, segunda: 2, tercer: 3,
    tercero: 3, tercera: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5, sexto: 6, sexta: 6,
    septimo: 7, septima: 7, octavo: 8, octava: 8, noveno: 9, novena: 9, decimo: 10, decima: 10 };

  // Primer numero del texto, en digitos o en palabra; null si no hay
  function numeroDe(texto) {
    const t = normalizar(texto);
    const d = t.match(/\d+/);
    if (d) return parseInt(d[0], 10);
    for (const p of t.split(/[^a-z]+/)) {
      if (CARDINALES[p]) return CARDINALES[p];
      if (ORDINALES[p]) return ORDINALES[p];
    }
    return null;
  }

  // Conectores que no ayudan a identificar la opcion
  const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'a', 'al', 'y', 'e', 'en', 'para',
    'con', 'un', 'una', 'lo', 'que', 'solo', 'todo', 'toda', 'todos', 'todas']);
  // Singular aproximado: «columnas» y «columna» deben coincidir
  const raizDe = w => w.length > 3 ? w.replace(/(es|s)$/, '') : w;
  const claves = t => normalizar(t).split(/[^a-z0-9]+/).filter(w => w && !VACIAS.has(w)).map(raizDe);

  // Opciones que encajan con un trozo de lo dicho: exacta, luego todas las
  // palabras (en cualquier orden), luego las que mas palabras compartan.
  function encajes(trozo, opciones) {
    const q = normalizar(trozo);
    if (!q) return { lista: [], aproximada: false };
    const exactas = opciones.filter(o => normalizar(o) === q);
    if (exactas.length) return { lista: exactas, aproximada: false };
    const ks = claves(q);
    if (!ks.length) return { lista: [], aproximada: false };
    const puntos = opciones.map(o => {
      const tok = claves(o);
      return { o, n: ks.filter(k => tok.includes(k)).length };
    });
    const todas = puntos.filter(p => p.n === ks.length).map(p => p.o);
    if (todas.length) return { lista: todas, aproximada: false };
    const max = Math.max(0, ...puntos.map(p => p.n));
    if (!max) return { lista: [], aproximada: false };
    return { lista: puntos.filter(p => p.n === max).map(p => p.o), aproximada: true };
  }

  // { valores, ambiguo, candidatos }. En un filtro multiple «columnas y vigas»
  // marca las dos, y una palabra contenida en varias opciones las toma todas
  // (filtrar de mas no hace daño). Lo que queda en duda no se aplica.
  function emparejar(dicho, opciones, { nivel = false, multi = false } = {}) {
    const resultado = lista => {
      const unicos = opciones.filter(o => lista.includes(o));   // en el orden del modelo
      return (unicos.length > 1 && !multi)
        ? { valores: [], ambiguo: true, candidatos: unicos }
        : { valores: unicos, ambiguo: false, candidatos: [] };
    };
    if (nivel) {
      const n = numeroDe(dicho);
      if (n !== null) {
        const conNumero = opciones.filter(o => numeroDe(o) === n);
        if (conNumero.length) return resultado(conNumero);
        // «piso 9» sin piso 9: no ofrecer todos los «Piso N» como si dudara
        if (opciones.some(o => numeroDe(o) !== null)) return resultado([]);
      }
    }
    const trozos = multi ? normalizar(dicho).split(/\s*,\s*|\s+y\s+|\s+e\s+/).filter(Boolean) : [dicho];
    const todos = [];
    for (const t of trozos) {
      const { lista, aproximada } = encajes(t, opciones);
      if (aproximada && lista.length > 1) return { valores: [], ambiguo: true, candidatos: lista };
      todos.push(...lista);
    }
    return resultado(todos);
  }

  function normalizarEstado(texto) {
    const t = normalizar(texto);
    if (t.includes('revis')) return 'revision';
    if (t.includes('aprob')) return 'aprobacion';
    if (t.includes('pag')) return 'pagado';
    if (t.includes('anul')) return 'anulado';
    return null;
  }

  // Valor del desplegable «Estado» (f-estado) a partir de lo dicho: pendiente,
  // en corte (ejecutado) o un estado de pago concreto
  function estadoDeFiltro(texto) {
    const t = normalizar(texto);
    if (!t) return null;
    if (t.includes('pend') || t.includes('falta')) return 'pending';
    const pago = normalizarEstado(t);
    if (pago && pago !== 'anulado') return pago;
    if (t.includes('cort') || t.includes('ejecut') || t.includes('registr')) return 'cut';
    if (t.includes('tod')) return 'all';
    return null;
  }

  // Una sola accion pendiente a la vez. confirmar() solo devuelve los datos si
  // la clave coincide con lo propuesto y no ha vencido; se consume al usarla.
  function crearConfirmador(ahora = Date.now, vigencia = 120000) {
    let pendiente = null;
    return {
      proponer(clave, datos) { pendiente = { clave, datos, vence: ahora() + vigencia }; },
      confirmar(clave) {
        if (!pendiente || pendiente.clave !== clave || ahora() > pendiente.vence) return null;
        const d = pendiente.datos;
        pendiente = null;
        return d;
      },
    };
  }

  // Mismas transiciones que firestore.rules (sin anular, que no va por voz).
  // Es solo un aviso previo: el servidor sigue teniendo la ultima palabra.
  function transicionPermitida(de, a, rol) {
    const registra = rol === 'admin' || rol === 'registrador', admin = rol === 'admin';
    return (de === 'revision' && a === 'aprobacion' && registra)
        || (de === 'aprobacion' && a === 'revision' && admin)
        || ((de === 'revision' || de === 'aprobacion') && a === 'pagado' && admin)
        || (de === 'pagado' && a === 'aprobacion' && admin);
  }

  const api = { normalizar, numeroDe, emparejar, normalizarEstado, crearConfirmador, transicionPermitida, estadoDeFiltro };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.EurbeAgenteLogica = api;
})(typeof window !== 'undefined' ? window : globalThis);
