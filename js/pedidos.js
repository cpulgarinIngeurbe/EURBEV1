// ═══════════════════════════════════════════════════════════
//  MÓDULO PEDIDOS DE MATERIAL
//  Saca cantidades del modelo por tipo de familia (o por resistencia, en
//  concreto) y las convierte en lo que se le pide al proveedor: unidades y
//  pacas, cajas + pegante + mortero, o m³ de concreto. Lleva además la
//  gestión del pedido: estado, fechas, remisiones, entradas de almacén y
//  facturas. Solo LEE el modelo y los cortes: no toca nada de lo demás.
//
//  Por ahora los pedidos se guardan en ESTE navegador, separados por obra
//  (clave eurbe_pedidos:<obraId>). Pasarlos a Firestore para compartirlos
//  entre personas es el siguiente paso (necesita reglas nuevas).
//  Usa globales de index.html: STATE, ctEsc, ctValor, ctNum,
//  buildElementIndex, selectByFilter, refreshAllColors, invalidarAristas,
//  moduloActivo, ensureLib, notify, setStatusBar, COLORS.
// ═══════════════════════════════════════════════════════════
const PED_LS     = 'eurbe_pedidos';
const PED_CAT_LS = 'eurbe_materiales';
const PED_RES_LS = 'eurbe_ped_param_resistencia';
const pedClaveLS = () => PED_LS + ':' + ((window.SESION && window.SESION.obraId) || 'local');

const PED_CLASES = {
  mamposteria: { lbl: 'Mampostería', icono: '🧱', clave: 'Tipo' },
  enchape:     { lbl: 'Enchape',     icono: '◫',  clave: 'Tipo' },
  concreto:    { lbl: 'Concreto',    icono: '⬛', clave: 'Resistencia' },
};
const PED_ESTADOS = {
  solicitado: { lbl: 'Solicitado', color: '#3A7FC1', bg: '#EEF6FF' },
  aprobado:   { lbl: 'Aprobado',   color: '#F5892A', bg: '#FFF4EA' },
  entregado:  { lbl: 'Entregado',  color: '#5AB87A', bg: '#EEF9F1' },
};
const PED_COLOR = { activo: 0xF5892A, otro: 0x9B87C9, vaciado: 0x3A7FC1 };

// Valores de ejemplo, sacados de los Excel de pedidos de Viale (oct-2026).
// Solo son la semilla: la usuaria los cambia en «Materiales y rendimientos».
const PED_CAT_SEMILLA = [
  { id:'m-b5l', clase:'mamposteria', nombre:'Bloque #5 liso',        busca:'BLOQUE # 5 LISO',      unidad:'m²', rend:16, paca:0,   factor:1.05, dias:3 },
  { id:'m-b5c', clase:'mamposteria', nombre:'Bloque #5 corrugado',   busca:'BLOQUE # 5 CORRUGADO', unidad:'m²', rend:16, paca:0,   factor:1.05, dias:3 },
  { id:'m-b4',  clase:'mamposteria', nombre:'Bloque #4',             busca:'BLOQUE # 4',           unidad:'m²', rend:16, paca:0,   factor:1.05, dias:3 },
  { id:'m-lcc', clase:'mamposteria', nombre:'Ladrillo capuchino · muro completo', busca:'CAPUCHINO', unidad:'m²', rend:56, paca:448, factor:1.05, dias:5 },
  { id:'m-lce', clase:'mamposteria', nombre:'Ladrillo capuchino · enchape',       busca:'CAPUCHINO', unidad:'m²', rend:28, paca:448, factor:1.05, dias:5 },
  { id:'e-pp',  clase:'enchape', nombre:'Porcelanato 0.60x0.60 · piso', busca:'PORCELANATO', unidad:'m²',
    rendCaja:1.8, m2Caja:1.8, factor:1.07, pegKg:5, pegFactor:1.05, pegBulto:25,
    mortero:true, morRend:25, morFactor:1.05, morBultosM3:43.47, morBultoKg:40, dias:8 },
  { id:'e-pg',  clase:'enchape', nombre:'Porcelanato 0.60x0.60 · guardaescoba', busca:'GUARDA ESCOBA', unidad:'ml',
    rendCaja:6, m2Caja:1.8, factor:1.07, pegKg:5, pegFactor:1.05, pegBulto:25,
    mortero:false, morRend:25, morFactor:1.05, morBultosM3:43.47, morBultoKg:40, dias:8 },
  { id:'c-5000', clase:'concreto', nombre:'Concreto 5000 PSI', busca:'5000', unidad:'m³', factor:1.05, paso:0.25, dias:1 },
  { id:'c-4000', clase:'concreto', nombre:'Concreto 4000 PSI', busca:'4000', unidad:'m³', factor:1.05, paso:0.25, dias:1 },
  { id:'c-3000', clase:'concreto', nombre:'Concreto 3000 PSI', busca:'3000', unidad:'m³', factor:1.05, paso:0.25, dias:1 },
];

const PED = {
  pedidos: [], catalogo: [], activo: null, tab: 'cantidades',
  f: { edif: '', nivel: '', claves: new Set() }, verFiltro: false,
  verRemision: null,                        // id de remisión resaltada en el visor
  cache: { activo: new Set(), otros: new Map(), vaciado: new Set() },
  idx: null, idxSrc: null, res: null, resSrc: null,
};

// ── Utilidades ──────────────────────────────────────────────
const pedN = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
// ROUNDUP de Excel, sin que 75264.0000000001 suba a la paca siguiente
const pedCeil = x => Math.ceil(Math.round(x * 1e6) / 1e6);
const pedR2 = x => Math.round(x * 100) / 100;
const pedF2 = n => (+n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pedF0 = n => (+n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
const pedHoy = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const pedFecha = iso => iso ? String(iso).slice(0, 10).replace(/-/g, '/') : '—';
const pedDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const pedDiff = (a, b) => Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000);
const pedId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pedE = t => ctEsc(t == null ? '' : t);
const pedNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// ── Persistencia ────────────────────────────────────────────
function pedGuardar() {
  try { localStorage.setItem(pedClaveLS(), JSON.stringify(PED.pedidos)); }
  catch (e) { notify('⚠ No se pudo guardar el pedido en este navegador'); }
}
function pedCatGuardar() {
  try { localStorage.setItem(PED_CAT_LS, JSON.stringify(PED.catalogo)); } catch (e) {}
}
function pedCargar() {
  try { PED.catalogo = JSON.parse(localStorage.getItem(PED_CAT_LS) || 'null') || []; } catch (e) { PED.catalogo = []; }
  if (!PED.catalogo.length) PED.catalogo = PED_CAT_SEMILLA.map(m => ({ ...m }));
  let crudo = [];
  try { crudo = JSON.parse(localStorage.getItem(pedClaveLS()) || '[]') || []; } catch (e) { crudo = []; }
  PED.pedidos = crudo.map(pedMigrar).filter(Boolean);
  if (PED.activo && !PED.pedidos.some(p => p.id === PED.activo)) PED.activo = null;
}

// Los pedidos de prueba del 27-oct venían en otro formato: se convierten.
function pedMigrar(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.v === 2) return p;
  if (p.tipo === 'pintura') return null;                 // pintura quedó fuera por ahora
  const clase = p.tipo === 'concreto' ? 'concreto' : 'mamposteria';
  const factor = 1 + pedN(p.desperdicio) / 100;
  return {
    v: 2, id: String(p.id || pedId()), numero: '', clase, nombre: p.nombre || 'Pedido',
    creado: p.fecha || pedHoy(), fechaObra: p.fecha || pedHoy(), estado: 'solicitado',
    historial: [{ estado: 'solicitado', fecha: p.fecha || pedHoy() }], notas: p.notas || '',
    elementIds: p.elementIds || [],
    lineas: (p.grupos || []).map(g => ({
      id: pedId(), edificacion: '', clave: g.etiqueta || '', categoria: g.categoria || '', ubicacion: '',
      n: 0, cantidad: pedN(g.cantidad), ppto: null, matId: '',
      mat: clase === 'concreto'
        ? { nombre: g.etiqueta || '', unidad: 'm³', factor, paso: 0.25, dias: 1 }
        : { nombre: g.etiqueta || '', unidad: 'm²', rend: pedN(g.rendimiento), paca: pedN(g.paca), factor, dias: 3 },
    })),
    proveedor: '', pedidoProv: '', ordenCompra: '', remisiones: [], entradas: [], facturas: [],
  };
}

// ── Lectura del modelo ──────────────────────────────────────
function pedIdx() {
  if (PED.idxSrc !== STATE.elements || !PED.idx) {
    PED.idx = buildElementIndex(); PED.idxSrc = STATE.elements;
  }
  return PED.idx;
}

// Todos los parámetros que trae el IFC (para elegir el de resistencia)
function pedParamsModelo() {
  const s = new Set();
  const muestra = Math.min(STATE.elements.length, 4000);
  for (let i = 0; i < muestra; i++) {
    const ex = STATE.elements[i].extra;
    if (ex) for (const k of Object.keys(ex)) s.add(k);
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'es'));
}
// Se cachea: pedClave lo pide una vez por elemento, y sin caché cada
// llamada volvería a recorrer el modelo.
function pedParamResistencia() {
  if (PED.resSrc === STATE.elements && PED.res != null) return PED.res;
  let p = '';
  try { p = localStorage.getItem(PED_RES_LS) || ''; } catch (e) {}
  // Autodetección por nombre parecido (nunca un nombre fijo)
  if (!p) p = pedParamsModelo().find(k => /resist|psi|f'?c\b|mpa/i.test(k)) || '';
  PED.res = p; PED.resSrc = STATE.elements;
  return p;
}
function pedSetParamResistencia(v) {
  try { localStorage.setItem(PED_RES_LS, v); } catch (e) {}
  PED.res = v; PED.resSrc = STATE.elements;
  const p = pedActivo();
  if (p && p.clase === 'concreto') { pedReconstruir(p); pedGuardar(); }
  pedRender();
}

function pedClave(el, clase) {
  if (clase === 'concreto') {
    const v = ctValor(el, pedParamResistencia()).trim();
    return v || '(sin resistencia)';
  }
  return String(el.tipo || el.name || el.ifcType || '(sin tipo)').trim();
}
function pedCantEl(el, unidad) {
  if (unidad === 'ml') return ctNum(el.longitud);
  if (unidad === 'm³') return ctNum(el.volumen);
  if (unidad === 'ud') return 1;
  return ctNum(el.area);
}
// Elementos que pueden entrar en un pedido de esta clase
function pedEsCandidato(el, clase) {
  if (clase === 'concreto') {
    // Con el parámetro de resistencia elegido, lo que no lo trae no es concreto
    // (un muro de bloque también tiene volumen)
    const prm = pedParamResistencia();
    return ctNum(el.volumen) > 0 && (!prm || ctValor(el, prm).trim() !== '');
  }
  return ctNum(el.area) > 0 || (clase === 'enchape' && ctNum(el.longitud) > 0);
}

// ── Catálogo ────────────────────────────────────────────────
function pedMat(id) { return PED.catalogo.find(m => m.id === id) || null; }
function pedSugerirMat(clase, clave) {
  // Sin espacios: «Guardaescoba» y «Guarda escoba» son lo mismo
  const c = pedNorm(clave).replace(/ /g, '');
  const lista = PED.catalogo.filter(m => m.clase === clase);
  // Gana la coincidencia más larga: «BLOQUE # 5 LISO» antes que «BLOQUE»
  let mejor = null, largo = -1;
  for (const m of lista) {
    const b = pedNorm(m.busca).replace(/ /g, '');
    if (b && c.includes(b) && b.length > largo) { mejor = m; largo = b.length; }
  }
  return mejor;
}
function pedMatVacio(clase) {
  if (clase === 'concreto') return { nombre: '', unidad: 'm³', factor: 1.05, paso: 0.25, dias: 1 };
  if (clase === 'enchape') return { nombre: '', unidad: 'm²', rendCaja: 0, m2Caja: 0, factor: 1.07, pegKg: 0, pegFactor: 1.05,
    pegBulto: 25, mortero: false, morRend: 0, morFactor: 1.05, morBultosM3: 0, morBultoKg: 40, dias: 0 };
  return { nombre: '', unidad: 'm²', rend: 0, paca: 0, factor: 1.05, dias: 0 };
}

// ── Cálculo de una línea (fórmulas de los Excel de Viale) ──
function pedCalc(l, clase) {
  const m = l.mat || {}, q = pedN(l.cantidad), f = pedN(m.factor) || 1;
  if (clase === 'mamposteria') {
    const rend = pedN(m.rend), paca = pedN(m.paca);
    const neta = q * rend, conDesp = neta * f;
    const pacas = paca > 0 ? conDesp / paca : null;
    const entero = paca > 0 ? pedCeil(pacas) : null;
    const pedido = rend ? (paca > 0 ? entero * paca : pedCeil(conDesp)) : 0;
    const ppto = l.ppto == null || l.ppto === '' ? null : pedN(l.ppto);
    return { neta, conDesp, pacas, entero, pedido, ppto, dif: ppto == null ? null : ppto - pedido, unidad: 'ud' };
  }
  if (clase === 'enchape') {
    const conDesp = q * f;
    const rc = pedN(m.rendCaja), m2c = pedN(m.m2Caja);
    const cajas = rc > 0 ? pedCeil(conDesp / rc) : 0;
    const m2Pedir = cajas * m2c;
    const pegKg = pedCeil(pedN(m.pegKg) * m2Pedir);
    const pegDesp = pegKg * (pedN(m.pegFactor) || 1);
    const pegBultos = pedN(m.pegBulto) > 0 ? pedCeil(pegDesp / pedN(m.pegBulto)) : 0;
    const pegPedir = pegBultos * pedN(m.pegBulto);
    let morM3 = 0, morDesp = 0, morBultos = 0, morKg = 0;
    const conMortero = !!m.mortero && m.unidad !== 'ml' && pedN(m.morRend) > 0;
    if (conMortero) {
      morM3 = q / pedN(m.morRend);
      morDesp = morM3 * (pedN(m.morFactor) || 1);
      morBultos = pedCeil(morDesp * pedN(m.morBultosM3));
      morKg = morBultos * pedN(m.morBultoKg);
    }
    const ppto = l.ppto == null || l.ppto === '' ? null : pedN(l.ppto);
    return { conDesp, cajas, m2Pedir, pegKg, pegDesp, pegBultos, pegPedir, conMortero, morM3, morDesp, morBultos, morKg,
             pedido: cajas, ppto, dif: ppto == null ? null : ppto - m2Pedir, unidad: 'cajas' };
  }
  // concreto: se le da el volumen a la concretera, redondeado a su paso (0,25 m³)
  const conDesp = q * f, paso = pedN(m.paso);
  const pedido = paso > 0 ? pedCeil(conDesp / paso) * paso : pedR2(conDesp);
  return { neta: q, conDesp, pedido, unidad: 'm³' };
}

// Resumen del pedido completo
function pedTotales(p) {
  const t = { cantidad: 0, pedido: 0, peg: 0, mor: 0, m2: 0 };
  p.lineas.forEach(l => {
    const c = pedCalc(l, p.clase);
    t.cantidad += pedN(l.cantidad); t.pedido += c.pedido || 0;
    if (p.clase === 'enchape') { t.peg += c.pegBultos; t.mor += c.morBultos; t.m2 += c.m2Pedir; }
  });
  return t;
}
function pedTotalTexto(p) {
  const t = pedTotales(p);
  if (!p.lineas.length) return 'sin elementos';
  if (p.clase === 'concreto') return pedF2(t.pedido) + ' m³';
  if (p.clase === 'enchape') return pedF0(t.pedido) + ' cajas · ' + pedF0(t.peg) + ' bultos pegante';
  return pedF0(t.pedido) + ' unidades';
}

// ── Programador ─────────────────────────────────────────────
function pedDiasEntrega(p) {
  return p.lineas.reduce((mx, l) => Math.max(mx, pedN(l.mat && l.mat.dias)), 0);
}
function pedFechaPedir(p) {
  return p.fechaObra ? pedDias(p.fechaObra, -pedDiasEntrega(p)) : '';
}
// Aviso de calendario para la lista y la cabecera
function pedAvisoFecha(p) {
  if (p.estado === 'entregado' || !p.fechaObra) return null;
  const hoy = pedHoy();
  if (p.estado === 'solicitado') {
    const d = pedDiff(pedFechaPedir(p), hoy);
    if (d < 0) return { txt: `⚠ Se debió pedir hace ${-d} día${d === -1 ? '' : 's'}`, grave: true };
    if (d === 0) return { txt: '⚠ Hay que pedirlo hoy', grave: true };
    if (d <= 2) return { txt: `Pedir en ${d} día${d === 1 ? '' : 's'}`, grave: false };
    return null;
  }
  const d = pedDiff(p.fechaObra, hoy);
  if (d < 0) return { txt: `⚠ Debió llegar hace ${-d} día${d === -1 ? '' : 's'}`, grave: true };
  return null;
}

// ── Pedidos: crear, elegir, borrar ──────────────────────────
function pedActivo() { return PED.pedidos.find(p => p.id === PED.activo) || null; }
function pedSiguienteNumero() {
  const max = PED.pedidos.reduce((mx, p) => Math.max(mx, parseInt(String(p.numero || '').replace(/\D/g, '')) || 0), 0);
  return 'PED-' + String(max + 1).padStart(4, '0');
}
function pedNuevo() {
  const clase = document.getElementById('ped-nuevo-clase').value;
  const hoy = pedHoy();
  const p = {
    v: 2, id: pedId(), numero: pedSiguienteNumero(), clase,
    nombre: `${PED_CLASES[clase].lbl} · ${pedFecha(hoy)}`,
    creado: hoy, fechaObra: pedDias(hoy, 7), estado: 'solicitado',
    historial: [{ estado: 'solicitado', fecha: hoy }], notas: '',
    elementIds: [], lineas: [],
    proveedor: '', pedidoProv: '', ordenCompra: '', remisiones: [], entradas: [], facturas: [],
  };
  PED.pedidos.unshift(p);
  PED.activo = p.id; PED.tab = 'cantidades'; PED.verRemision = null;
  PED.f.claves.clear();
  pedGuardar(); pedRenderTodo();
  if (STATE.selected.size) setStatusBar(`Pedido ${p.numero} creado. Tienes ${STATE.selected.size} elementos seleccionados: usa «Agregar la selección» para meterlos.`);
}
function pedElegir(id) {
  PED.activo = id; PED.verRemision = null; PED.f.claves.clear();
  pedRenderTodo();
}
function pedBorrar() {
  const p = pedActivo(); if (!p) return;
  if (!confirm(`¿Borrar el pedido ${p.numero} «${p.nombre}»?\nSe pierden también sus remisiones, entradas y facturas. No se puede deshacer.`)) return;
  PED.pedidos = PED.pedidos.filter(x => x.id !== p.id);
  PED.activo = null; pedGuardar(); pedRenderTodo();
}
function pedSet(campo, valor) {
  const p = pedActivo(); if (!p) return;
  p[campo] = valor; pedGuardar();
  if (campo === 'fechaObra' || campo === 'nombre') pedRenderLista();
  if (campo === 'fechaObra') pedRender();
}
function pedSetEstado(estado) {
  const p = pedActivo(); if (!p || p.estado === estado) return;
  p.estado = estado;
  (p.historial = p.historial || []).push({ estado, fecha: pedHoy() });
  pedGuardar(); pedRenderTodo();
}

// ── Elementos del pedido ────────────────────────────────────
// Reagrupa los elementos por torre + tipo (o resistencia). Conserva lo que
// la usuaria ya había ajustado en cada línea (material, categoría, PPTO...).
function pedReconstruir(p) {
  if (!STATE.elements.length) return false;
  const idx = pedIdx();
  const viejas = new Map(p.lineas.map(l => [l.edificacion + '\u0000' + l.clave, l]));
  const grupos = new Map();
  let presentes = 0;
  for (const gid of p.elementIds) {
    const el = idx.get(gid); if (!el) continue;
    presentes++;
    const k = String(el.edificacion || '') + '\u0000' + pedClave(el, p.clase);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(el);
  }
  // Modelo distinto al del pedido: no se pisan las líneas guardadas
  if (p.elementIds.length && !presentes) return false;
  p.lineas = [...grupos.entries()].map(([k, els]) => {
    const [edificacion, clave] = k.split('\u0000');
    let l = viejas.get(k);
    if (!l) {
      const sug = pedSugerirMat(p.clase, clave);
      l = { id: pedId(), edificacion, clave, categoria: '', ubicacion: '', ppto: null,
            matId: sug ? sug.id : '', mat: sug ? { ...sug } : { ...pedMatVacio(p.clase), nombre: clave } };
    }
    l.n = els.length;
    l.cantidad = pedR2(els.reduce((s, el) => s + pedCantEl(el, l.mat.unidad), 0));
    return l;
  }).sort((a, b) => (a.edificacion || '').localeCompare(b.edificacion || '', 'es', { numeric: true })
                 || a.clave.localeCompare(b.clave, 'es', { numeric: true }));
  return true;
}

// Mapa globalId -> número de pedido, de los OTROS pedidos de la misma clase
function pedMapaOtros(p) {
  const m = new Map();
  PED.pedidos.forEach(o => {
    if (o.id === p.id || o.clase !== p.clase) return;
    o.elementIds.forEach(g => { if (!m.has(g)) m.set(g, o.numero || o.nombre); });
  });
  return m;
}

function pedAgregar(ids, origen) {
  const p = pedActivo();
  if (!p) { alert('Primero crea o elige un pedido.'); return; }
  if (!STATE.elements.length) { alert('Carga el modelo para poder agregar elementos.'); return; }
  const idx = pedIdx();
  const ya = new Set(p.elementIds);
  let candidatos = ids.filter(g => !ya.has(g) && idx.has(g) && pedEsCandidato(idx.get(g), p.clase));
  const descartados = ids.filter(g => !ya.has(g)).length - candidatos.length;
  if (!candidatos.length) {
    alert(descartados
      ? `Ninguno de los ${descartados} elementos sirve para un pedido de ${PED_CLASES[p.clase].lbl.toLowerCase()} (no tienen ${p.clase === 'concreto' ? 'volumen' : 'área'}).`
      : 'Esos elementos ya están en este pedido.');
    return;
  }
  // Aviso de elementos ya pedidos en otro pedido
  const otros = pedMapaOtros(p);
  const repetidos = candidatos.filter(g => otros.has(g));
  if (repetidos.length) {
    const nums = [...new Set(repetidos.map(g => otros.get(g)))].slice(0, 5).join(', ');
    const incluir = confirm(`${repetidos.length} de estos elementos ya están en otro pedido (${nums}).\n\n` +
      `Aceptar = incluirlos de todas formas\nCancelar = dejarlos por fuera`);
    if (!incluir) { const r = new Set(repetidos); candidatos = candidatos.filter(g => !r.has(g)); }
    if (!candidatos.length) { notify('No se agregó nada: todos estaban ya pedidos'); return; }
  }
  p.elementIds.push(...candidatos);
  pedReconstruir(p); pedGuardar(); pedRenderTodo();
  notify(`${candidatos.length} elementos agregados a ${p.numero}` + (descartados ? ` · ${descartados} no aplican` : ''));
  setStatusBar(`${origen}: ${candidatos.length} agregados` + (descartados ? `, ${descartados} sin ${p.clase === 'concreto' ? 'volumen' : 'área'}` : '') + (repetidos.length ? `, ${repetidos.length} ya pedidos` : ''));
}
function pedAgregarSeleccion() {
  if (!STATE.selected.size) { alert('Selecciona elementos en el visor (clic, Shift+clic o Ctrl+arrastrar).'); return; }
  pedAgregar([...STATE.selected], 'Selección del visor');
}
function pedAgregarFiltro() {
  const ids = pedFiltrados().map(el => el.globalId);
  if (!ids.length) { alert('El filtro no deja ningún elemento.'); return; }
  pedAgregar(ids, 'Filtro');
}
function pedQuitarSeleccion() {
  const p = pedActivo(); if (!p) return;
  const quitar = STATE.selected;
  const antes = p.elementIds.length;
  p.elementIds = p.elementIds.filter(g => !quitar.has(g));
  const n = antes - p.elementIds.length;
  if (!n) { alert('Ninguno de los elementos seleccionados está en este pedido.'); return; }
  pedReconstruir(p); pedGuardar(); pedRenderTodo();
  notify(`${n} elementos quitados de ${p.numero}`);
}
function pedVaciar() {
  const p = pedActivo(); if (!p || !p.elementIds.length) return;
  if (!confirm(`¿Quitar los ${p.elementIds.length} elementos del pedido ${p.numero}?`)) return;
  p.elementIds = []; p.lineas = []; pedGuardar(); pedRenderTodo();
}
function pedSeleccionarPedido() {
  const p = pedActivo(); if (!p) return;
  const s = new Set(p.elementIds);
  selectByFilter(el => s.has(el.globalId));
}

// ── Línea: material y ajustes ───────────────────────────────
function pedLinea(lid) { const p = pedActivo(); return p ? p.lineas.find(l => l.id === lid) : null; }
function pedSetLinea(lid, campo, valor) {
  const p = pedActivo(), l = pedLinea(lid); if (!l) return;
  if (campo === 'matId') {
    const m = pedMat(valor);
    l.matId = valor;
    l.mat = m ? { ...m } : { ...pedMatVacio(p.clase), nombre: l.clave };
    pedReconstruir(p);                       // la unidad puede cambiar (m² ↔ ml)
  } else if (campo === 'categoria' || campo === 'ubicacion') {
    l[campo] = valor;
  } else if (campo === 'ppto') {
    l.ppto = valor === '' ? null : pedN(valor);
  } else {
    l.mat[campo] = pedN(valor);              // ajuste puntual: no toca el catálogo
  }
  pedGuardar();
  if (campo === 'categoria' || campo === 'ubicacion') return;
  pedRender(); pedRenderLista();
}

// ── Filtro de elementos (2ª forma de armar el pedido) ───────
function pedCandidatos(p) {
  return STATE.elements.filter(el => pedEsCandidato(el, p.clase));
}
function pedFiltrados() {
  const p = pedActivo(); if (!p) return [];
  return pedCandidatos(p).filter(el =>
    (!PED.f.edif || String(el.edificacion || '') === PED.f.edif) &&
    (!PED.f.nivel || String(el.nivel || '') === PED.f.nivel) &&
    (!PED.f.claves.size || PED.f.claves.has(pedClave(el, p.clase))));
}
function pedSetFiltro(campo, valor) { PED.f[campo] = valor; if (PED.verFiltro) pedAplicarVisibilidad(); pedRender(); }
function pedToggleClave(clave, on) {
  on ? PED.f.claves.add(clave) : PED.f.claves.delete(clave);
  if (PED.verFiltro) pedAplicarVisibilidad();
  pedRenderFiltroConteo();
}
function pedLimpiarFiltro() { PED.f = { edif: '', nivel: '', claves: new Set() }; PED.verFiltro = false; pedAplicarVisibilidad(); pedRender(); }
function pedVerFiltro(on) { PED.verFiltro = on; pedAplicarVisibilidad(); pedRender(); }
function pedAplicarVisibilidad() {
  const vis = PED.verFiltro ? new Set(pedFiltrados().map(el => el.globalId)) : null;
  Object.entries(STATE.meshes).forEach(([gid, m]) => { m.visible = vis ? vis.has(gid) : true; });
  invalidarAristas();
}
function pedRenderFiltroConteo() {
  const e = document.getElementById('ped-f-conteo');
  if (!e) return;
  const n = pedFiltrados().length;
  e.textContent = `${n} elemento${n === 1 ? '' : 's'} con este filtro`;
}

// ── Colores del visor en el módulo Pedidos ──────────────────
function pedRefrescarCache() {
  const p = pedActivo();
  PED.cache.activo = new Set(p ? p.elementIds : []);
  PED.cache.otros = p ? pedMapaOtros(p) : new Map();
  const r = p && PED.verRemision ? (p.remisiones || []).find(x => x.id === PED.verRemision) : null;
  PED.cache.vaciado = new Set(r ? r.elementIds || [] : []);
}
// Lo llama getMeshColor cuando el módulo activo es Pedidos
function pedColor(gid) {
  if (PED.cache.vaciado.has(gid)) return PED_COLOR.vaciado;
  if (PED.cache.activo.has(gid)) return PED_COLOR.activo;
  if (PED.cache.otros.has(gid)) return PED_COLOR.otro;
  return COLORS.pending;
}
function pedPintar() {
  if (moduloActivo !== 'pedidos') return;
  pedRefrescarCache();
  refreshAllColors();
}
// Lo llama updateCutForm cada vez que cambia la selección
function pedSelCambio() {
  if (moduloActivo !== 'pedidos') return;
  const e = document.getElementById('ped-sel-info');
  if (e) e.textContent = `${STATE.selected.size} seleccionado${STATE.selected.size === 1 ? '' : 's'}`;
  const b = document.getElementById('ped-btn-agregar-sel');
  if (b) b.textContent = `+ Agregar la selección (${STATE.selected.size})`;
}
function pedAlEntrar() {
  pedAplicarVisibilidad();
  pedRenderTodo();
}

// ── Remisiones, entradas y facturas ─────────────────────────
function pedRemAgregar() {
  const p = pedActivo(); if (!p) return;
  (p.remisiones = p.remisiones || []).push({ id: pedId(), numero: '', fecha: pedHoy(), m3: 0, sobrante: 0, entrada: '', ubicacion: '', elementIds: [], teorico: null });
  pedGuardar(); pedRender();
}
function pedRemSet(rid, campo, valor) {
  const p = pedActivo(); const r = p && p.remisiones.find(x => x.id === rid); if (!r) return;
  r[campo] = (campo === 'm3' || campo === 'sobrante') ? pedN(valor) : valor;
  pedGuardar();
  if (campo !== 'ubicacion') pedRender();
}
function pedRemBorrar(rid) {
  const p = pedActivo(); if (!p) return;
  const r = p.remisiones.find(x => x.id === rid);
  if (r && (r.numero || r.m3) && !confirm(`¿Borrar la remisión ${r.numero || ''}?`)) return;
  p.remisiones = p.remisiones.filter(x => x.id !== rid);
  if (PED.verRemision === rid) PED.verRemision = null;
  pedGuardar(); pedRender(); pedPintar();
}
// «Dónde se vació»: los elementos seleccionados en el visor
function pedRemMarcar(rid) {
  const p = pedActivo(); const r = p && p.remisiones.find(x => x.id === rid); if (!r) return;
  if (!STATE.selected.size) { alert('Selecciona en el visor los elementos que se llenaron con esta remisión y vuelve a pulsar «Marcar».'); return; }
  const idx = pedIdx();
  r.elementIds = [...STATE.selected];
  r.teorico = pedR2(r.elementIds.reduce((s, g) => s + (idx.get(g) ? ctNum(idx.get(g).volumen) : 0), 0));
  const enPedido = new Set(p.elementIds);
  const fuera = r.elementIds.filter(g => !enPedido.has(g)).length;
  PED.verRemision = rid;
  pedGuardar(); pedRender(); pedPintar();
  notify(`Remisión ${r.numero || ''}: ${r.elementIds.length} elementos marcados` + (fuera ? ` (${fuera} no están en el pedido)` : ''));
}
function pedRemVer(rid) {
  PED.verRemision = PED.verRemision === rid ? null : rid;
  pedRender(); pedPintar();
}
function pedEntAgregar() {
  const p = pedActivo(); if (!p) return;
  (p.entradas = p.entradas || []).push({ id: pedId(), numero: '', fecha: pedHoy(), cantidad: 0, unidad: p.clase === 'enchape' ? 'cajas' : 'ud', nota: '' });
  pedGuardar(); pedRender();
}
function pedEntSet(id, campo, valor) {
  const p = pedActivo(); const e = p && p.entradas.find(x => x.id === id); if (!e) return;
  e[campo] = campo === 'cantidad' ? pedN(valor) : valor;
  pedGuardar();
  if (campo === 'numero') pedRender();
}
function pedEntBorrar(id) {
  const p = pedActivo(); if (!p) return;
  p.entradas = p.entradas.filter(x => x.id !== id); pedGuardar(); pedRender();
}
function pedFacAgregar() {
  const p = pedActivo(); if (!p) return;
  (p.facturas = p.facturas || []).push({ id: pedId(), numero: '', fecha: pedHoy(), valor: 0, docs: [] });
  pedGuardar(); pedRender();
}
function pedFacSet(id, campo, valor) {
  const p = pedActivo(); const f = p && p.facturas.find(x => x.id === id); if (!f) return;
  f[campo] = campo === 'valor' ? pedN(valor) : valor;
  pedGuardar();
  if (campo === 'numero') pedRender();
}
function pedFacDoc(id, doc, on) {
  const p = pedActivo(); const f = p && p.facturas.find(x => x.id === id); if (!f) return;
  f.docs = (f.docs || []).filter(d => d !== doc);
  if (on) f.docs.push(doc);
  pedGuardar(); pedRender();
}
function pedFacBorrar(id) {
  const p = pedActivo(); if (!p) return;
  p.facturas = p.facturas.filter(x => x.id !== id); pedGuardar(); pedRender();
}

// ── Consumo real de concreto ────────────────────────────────
function pedConsumo(p) {
  const rem = p.remisiones || [];
  const recibido = rem.reduce((s, r) => s + pedN(r.m3), 0);
  const sobrante = rem.reduce((s, r) => s + pedN(r.sobrante), 0);
  const consumido = recibido - sobrante;
  const teorico = p.lineas.reduce((s, l) => s + pedN(l.cantidad), 0);
  const pedido = pedTotales(p).pedido;
  return { recibido, sobrante, consumido, teorico, pedido,
           dif: consumido - teorico, pct: teorico ? (consumido / teorico - 1) * 100 : null };
}

// ── Revisión de documentos: lo que hoy se cruza a mano ──────
function pedAvisos(p) {
  const av = [];
  const facturado = new Set((p.facturas || []).flatMap(f => f.docs || []));
  if (p.clase === 'concreto') {
    const rem = p.remisiones || [];
    const nums = new Set(rem.map(r => String(r.numero).trim()).filter(Boolean));
    rem.forEach(r => {
      const n = String(r.numero).trim() || '(sin número)';
      if (!String(r.numero).trim()) av.push(`Hay una remisión sin número.`);
      if (!String(r.entrada || '').trim()) av.push(`Remisión ${n}: falta la entrada de almacén.`);
      if (String(r.numero).trim() && !facturado.has(String(r.numero).trim())) av.push(`Remisión ${n}: todavía no está en ninguna factura.`);
      if (!pedN(r.m3)) av.push(`Remisión ${n}: no tiene m³.`);
    });
    const dup = rem.map(r => String(r.numero).trim()).filter((n, i, a) => n && a.indexOf(n) !== i);
    [...new Set(dup)].forEach(n => av.push(`La remisión ${n} está registrada dos veces.`));
    (p.facturas || []).forEach(f => (f.docs || []).forEach(d => {
      if (!nums.has(d)) av.push(`La factura ${f.numero || ''} cubre la remisión ${d}, que no está registrada.`);
    }));
    const c = pedConsumo(p);
    if (rem.length && c.recibido > c.pedido + 0.001) av.push(`Se recibió más de lo pedido: ${pedF2(c.recibido)} m³ contra ${pedF2(c.pedido)} m³.`);
    if (p.estado === 'entregado' && !rem.length) av.push('El pedido está como Entregado pero no tiene remisiones.');
  } else {
    const ent = p.entradas || [];
    const nums = new Set(ent.map(e => String(e.numero).trim()).filter(Boolean));
    ent.forEach(e => { if (String(e.numero).trim() && !facturado.has(String(e.numero).trim())) av.push(`Entrada ${e.numero}: todavía no está en ninguna factura.`); });
    (p.facturas || []).forEach(f => (f.docs || []).forEach(d => {
      if (!nums.has(d)) av.push(`La factura ${f.numero || ''} cubre la entrada ${d}, que no está registrada.`);
    }));
    if (p.estado === 'entregado' && !ent.length) av.push('El pedido está como Entregado pero no tiene entradas de almacén.');
  }
  (p.facturas || []).forEach(f => { if (!String(f.numero).trim()) av.push('Hay una factura sin número.'); });
  return av;
}

// ═══════════ PINTADO DE LA INTERFAZ ═══════════
function pedRenderTodo() {
  pedRenderLista(); pedRender(); pedPintar(); pedSelCambio();
}

function pedRenderLista() {
  const cont = document.getElementById('ped-lista'); if (!cont) return;
  const fc = document.getElementById('ped-fl-clase').value;
  const fe = document.getElementById('ped-fl-estado').value;
  const lista = PED.pedidos.filter(p => (!fc || p.clase === fc) && (!fe || p.estado === fe));
  if (!PED.pedidos.length) {
    cont.innerHTML = `<div class="ped-vacio">Todavía no hay pedidos.<br>Elige el material arriba y pulsa <b>+ Nuevo pedido</b>.</div>`;
    return;
  }
  if (!lista.length) { cont.innerHTML = `<div class="ped-vacio">Ningún pedido con ese filtro.</div>`; return; }
  // Orden del programador: lo que llega primero a obra, arriba
  lista.sort((a, b) => (a.estado === 'entregado') - (b.estado === 'entregado')
                    || String(a.fechaObra || '').localeCompare(String(b.fechaObra || '')));
  cont.innerHTML = lista.map(p => {
    const est = PED_ESTADOS[p.estado] || PED_ESTADOS.solicitado;
    const cl = PED_CLASES[p.clase];
    const av = pedAvisoFecha(p);
    return `<div class="ped-card${p.id === PED.activo ? ' activo' : ''}" onclick="pedElegir('${p.id}')">
      <div class="ped-card-num">${pedE(p.numero)} · ${cl.icono} ${cl.lbl}</div>
      <div class="ped-card-nom">${pedE(p.nombre)}</div>
      <div class="ped-card-fila">
        <span class="ped-chip" style="color:${est.color};background:${est.bg}">● ${est.lbl}</span>
        <span>En obra: ${pedFecha(p.fechaObra)}</span>
      </div>
      <div class="ped-card-fila" style="margin-top:2px">${pedE(pedTotalTexto(p))}</div>
      ${av ? `<div class="ped-card-fila ${av.grave ? 'ped-alerta' : ''}" style="margin-top:2px">${av.txt}</div>` : ''}
    </div>`;
  }).join('');
}

function pedRender() {
  const box = document.getElementById('ped-detalle'); if (!box) return;
  document.getElementById('ped-btn-excel').disabled = !pedActivo();
  const p = pedActivo();
  if (!p) {
    box.innerHTML = `<div class="ped-vacio" style="margin-top:50px">
      Elige un pedido de la lista o crea uno nuevo.<br><br>
      <span class="ped-ayuda">Un pedido sale del modelo: seleccionas los elementos (o usas el filtro)
      y la app los agrupa por torre y por tipo de familia, y los convierte en lo que se le pide al proveedor.</span></div>`;
    return;
  }
  const scroll = (document.getElementById('ped-det-cuerpo') || {}).scrollTop || 0;
  const est = PED_ESTADOS[p.estado];
  const fPedir = pedFechaPedir(p);
  const av = pedAvisoFecha(p);
  const seg = p.clase === 'concreto' ? 'Remisiones y facturas' : 'Entradas y facturas';
  const nAv = pedAvisos(p).length;
  box.innerHTML = `
    <div class="ped-det-hd">
      <div class="ped-det-tit">
        <span class="ped-chip" style="background:#fff4ea;color:#7a3a00">${pedE(p.numero)}</span>
        <input type="text" value="${pedE(p.nombre)}" onchange="pedSet('nombre', this.value)" title="Nombre del pedido">
        <button type="button" class="ped-x" title="Borrar pedido" onclick="pedBorrar()">🗑</button>
      </div>
      <div class="ped-det-meta">
        <div><label>Estado</label>
          <select onchange="pedSetEstado(this.value)" style="color:${est.color};font-weight:700">
            ${Object.entries(PED_ESTADOS).map(([k, e]) => `<option value="${k}"${k === p.estado ? ' selected' : ''}>${e.lbl}</option>`).join('')}
          </select></div>
        <div><label>Se necesita en obra</label>
          <input type="date" value="${pedE(p.fechaObra || '')}" onchange="pedSet('fechaObra', this.value)"></div>
        <div><label>Pedir a más tardar</label>
          <div class="ped-dato" title="Fecha en obra menos los días de entrega del material (${pedDiasEntrega(p)} días)"
            style="${av && av.grave ? 'color:#E05050' : ''}">${pedFecha(fPedir)}</div></div>
        <div><label>Material</label>
          <div class="ped-dato">${PED_CLASES[p.clase].icono} ${PED_CLASES[p.clase].lbl}</div></div>
      </div>
      ${av ? `<div class="ped-ayuda ${av.grave ? 'ped-alerta' : ''}" style="margin:-2px 0 6px">${av.txt}</div>` : ''}
      <div class="ped-tabs">
        <button type="button" class="ped-tab${PED.tab === 'cantidades' ? ' activo' : ''}" onclick="PED.tab='cantidades';pedRender()">Cantidades</button>
        <button type="button" class="ped-tab${PED.tab === 'seguimiento' ? ' activo' : ''}" onclick="PED.tab='seguimiento';pedRender()">${seg}${nAv ? ` <span class="ped-alerta">(${nAv})</span>` : ''}</button>
      </div>
    </div>
    <div class="ped-det-cuerpo" id="ped-det-cuerpo">
      ${PED.tab === 'cantidades' ? pedHtmlCantidades(p) : pedHtmlSeguimiento(p)}
    </div>`;
  document.getElementById('ped-det-cuerpo').scrollTop = scroll;
  pedRenderFiltroConteo();
}

// ── Pestaña Cantidades ──────────────────────────────────────
function pedHtmlCantidades(p) {
  const sinModelo = !STATE.elements.length;
  const cl = PED_CLASES[p.clase];
  let h = '';

  h += `<div class="ped-sec">1 · Elementos del pedido <span style="flex:1"></span>
          <span style="text-transform:none;font-weight:400">${p.elementIds.length} elementos</span></div>`;
  if (sinModelo) {
    h += `<div class="ped-avisos">Carga el modelo para agregar o quitar elementos. Las cantidades guardadas se siguen mostrando.</div>`;
  } else {
    h += `<div class="ped-fila" style="margin-bottom:6px">
        <button type="button" class="btn btn-primary btn-sm" id="ped-btn-agregar-sel" onclick="pedAgregarSeleccion()">+ Agregar la selección (${STATE.selected.size})</button>
        <button type="button" class="ped-mini" onclick="pedQuitarSeleccion()">− Quitar la selección</button>
        <button type="button" class="ped-mini" onclick="pedSeleccionarPedido()">Seleccionar lo del pedido</button>
        <button type="button" class="ped-mini" onclick="pedVaciar()">Vaciar</button>
      </div>`;
    h += pedHtmlFiltro(p);
  }

  if (p.clase === 'concreto' && !sinModelo) {
    const prm = pedParamResistencia();
    h += `<div class="ped-fila" style="margin-top:8px"><label>Parámetro de resistencia del modelo:</label>
      <select onchange="pedSetParamResistencia(this.value)">
        <option value="">— elegir —</option>
        ${pedParamsModelo().map(k => `<option value="${pedE(k)}"${k === prm ? ' selected' : ''}>${pedE(k)}</option>`).join('')}
      </select>${prm ? '' : '<span class="ped-alerta">Elige cuál parámetro trae los PSI</span>'}</div>`;
  }

  h += `<div class="ped-sec">2 · Cantidades por torre y ${cl.clave.toLowerCase()}</div>`;
  if (!p.lineas.length) {
    h += `<div class="ped-vacio">Agrega elementos con la selección del visor o con el filtro.</div>`;
    return h;
  }
  h += `<div class="ped-tabla-wrap">` + (p.clase === 'mamposteria' ? pedTablaMamp(p)
        : p.clase === 'enchape' ? pedTablaEnchape(p) : pedTablaConcreto(p)) + `</div>`;
  h += `<p class="ped-ayuda" style="margin-top:6px">Los rendimientos vienen de <b>Materiales y rendimientos</b>.
        Si los cambias aquí, solo cambian en este pedido. Factor 1,05 = 5 % de desperdicio.</p>`;
  if (p.clase === 'concreto') {
    h += `<div class="ped-maqueta" style="margin-top:10px"><b>Mixers confirmados por la concretera</b> · próximamente.
          Aquí irá cuántos mixers y de cuántos m³ confirma la concretera para este volumen.</div>`;
  }
  h += `<div class="ped-sec">Notas</div>
        <textarea style="width:100%;height:48px;font-size:12px;border:1px solid var(--c-border);border-radius:4px;padding:5px"
          placeholder="Frente de trabajo, turno, observaciones…" onchange="pedSet('notas', this.value)">${pedE(p.notas || '')}</textarea>`;
  return h;
}

function pedHtmlFiltro(p) {
  const cands = pedCandidatos(p);
  const edifs = [...new Set(cands.map(el => String(el.edificacion || '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const base = cands.filter(el => !PED.f.edif || String(el.edificacion || '') === PED.f.edif);
  const niveles = [...new Set(base.map(el => String(el.nivel || '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const base2 = base.filter(el => !PED.f.nivel || String(el.nivel || '') === PED.f.nivel);
  const conteo = new Map();
  base2.forEach(el => { const k = pedClave(el, p.clase); conteo.set(k, (conteo.get(k) || 0) + 1); });
  const claves = [...conteo.keys()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  return `<div class="ped-caja">
    <div class="ped-fila" style="margin-bottom:6px"><b style="font-size:11px">o con filtro:</b>
      ${edifs.length > 1 ? `<select onchange="pedSetFiltro('edif', this.value)"><option value="">Todas las torres</option>
        ${edifs.map(e => `<option value="${pedE(e)}"${e === PED.f.edif ? ' selected' : ''}>${pedE(e)}</option>`).join('')}</select>` : ''}
      <select onchange="pedSetFiltro('nivel', this.value)"><option value="">Todos los niveles</option>
        ${niveles.map(n => `<option value="${pedE(n)}"${n === PED.f.nivel ? ' selected' : ''}>${pedE(n)}</option>`).join('')}</select>
      <label><input type="checkbox" ${PED.verFiltro ? 'checked' : ''} onchange="pedVerFiltro(this.checked)"> ver solo esto en el visor</label>
    </div>
    <div style="max-height:110px;overflow-y:auto;background:#fff;border:1px solid var(--c-border-light);border-radius:4px;padding:4px 6px;column-count:2;column-gap:12px">
      ${claves.length ? claves.map(k => `<label style="display:flex;gap:5px;font-size:11px;padding:1px 0;break-inside:avoid">
          <input type="checkbox" ${PED.f.claves.has(k) ? 'checked' : ''} onchange="pedToggleClave(this.dataset.k, this.checked)" data-k="${pedE(k)}">
          <span class="ped-tipo" title="${pedE(k)}" style="max-width:none">${pedE(k)}</span><span style="color:var(--c-text3)">${conteo.get(k)}</span></label>`).join('')
        : '<span class="ped-ayuda">No hay elementos con ' + (p.clase === 'concreto' ? 'volumen' : 'área') + ' en este filtro.</span>'}
    </div>
    <div class="ped-fila" style="margin-top:6px">
      <span class="ped-ayuda" id="ped-f-conteo"></span><span style="flex:1"></span>
      <button type="button" class="ped-mini" onclick="pedLimpiarFiltro()">Limpiar</button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="pedAgregarFiltro()">+ Agregar lo filtrado</button>
    </div></div>`;
}

function pedSelectMat(p, l) {
  const ops = PED.catalogo.filter(m => m.clase === p.clase);
  return `<select onchange="pedSetLinea('${l.id}','matId',this.value)" title="Material / uso">
    <option value="">— sin material —</option>
    ${ops.map(m => `<option value="${m.id}"${m.id === l.matId ? ' selected' : ''}>${pedE(m.nombre)}</option>`).join('')}</select>`;
}
const pedInp = (l, campo, val, cls, paso) =>
  `<input type="number" step="${paso || 'any'}" min="0" class="${cls || ''}" value="${val ?? ''}" onchange="pedSetLinea('${l.id}','${campo}',this.value)">`;
const pedTxt = (l, campo, ph) =>
  `<input type="text" class="largo" value="${pedE(l[campo] || '')}" placeholder="${ph}" onchange="pedSetLinea('${l.id}','${campo}',this.value)">`;

// Recorre las líneas agrupadas por torre, con un título por torre
function pedPorTorre(p, cols, fila) {
  let h = '', torre = null;
  const multi = new Set(p.lineas.map(l => l.edificacion)).size > 1 || p.lineas.some(l => l.edificacion);
  p.lineas.forEach(l => {
    if (multi && l.edificacion !== torre) {
      torre = l.edificacion;
      h += `<tr class="ped-torre"><td colspan="${cols}">${pedE(torre || 'Sin edificación')}</td></tr>`;
    }
    h += fila(l, pedCalc(l, p.clase));
  });
  return h;
}

function pedTablaMamp(p) {
  const tot = pedTotales(p);
  const filas = pedPorTorre(p, 13, (l, c) => `<tr>
    <td>${pedTxt(l, 'categoria', 'Exterior…')}</td>
    <td><div class="ped-tipo" title="${pedE(l.clave)}">${pedE(l.clave)}</div><span class="ped-ayuda">${l.n || ''} elem.</span></td>
    <td>${pedSelectMat(p, l)}</td>
    <td>${pedTxt(l, 'ubicacion', 'Ubicación')}</td>
    <td class="n">${pedF2(l.cantidad)}</td>
    <td class="n">${pedInp(l, 'rend', l.mat.rend, 'corto')}</td>
    <td class="n">${pedF0(c.neta)}</td>
    <td class="n">${pedInp(l, 'factor', l.mat.factor, 'corto', '0.01')}</td>
    <td class="n">${pedF0(c.conDesp)}</td>
    <td class="n">${pedInp(l, 'paca', l.mat.paca || '', 'corto')}</td>
    <td class="n">${c.entero != null ? pedF0(c.entero) : '—'}</td>
    <td class="n fuerte">${pedF0(c.pedido)}</td>
    <td class="n">${pedInp(l, 'ppto', l.ppto)}<div class="${c.dif == null ? '' : c.dif < 0 ? 'ped-neg' : 'ped-pos'}" style="font-size:10px">${c.dif == null ? '' : (c.dif > 0 ? '+' : '') + pedF0(c.dif)}</div></td>
  </tr>`);
  return `<table class="ped-tabla"><thead><tr>
      <th>Categoría</th><th>Tipo</th><th>Material / uso</th><th>Ubicación</th><th class="n">m²</th><th class="n">Rend.<br>ud/m²</th>
      <th class="n">Cant.<br>neta</th><th class="n">Factor<br>desp.</th><th class="n">Neta +<br>desp.</th><th class="n">Paca<br>(ud)</th>
      <th class="n">Nº<br>pacas</th><th class="n">Pedido<br>(ud)</th><th class="n">PPTO /<br>diferencia</th></tr></thead>
    <tbody>${filas}<tr class="ped-tot"><td colspan="4">TOTAL</td><td class="n">${pedF2(tot.cantidad)}</td><td colspan="6"></td>
      <td class="n">${pedF0(tot.pedido)}</td><td></td></tr></tbody></table>`;
}

function pedTablaEnchape(p) {
  const tot = pedTotales(p);
  const filas = pedPorTorre(p, 12, (l, c) => `<tr>
    <td>${pedTxt(l, 'categoria', 'Pasillo…')}</td>
    <td><div class="ped-tipo" title="${pedE(l.clave)}">${pedE(l.clave)}</div><span class="ped-ayuda">${l.n || ''} elem.</span></td>
    <td>${pedSelectMat(p, l)}</td>
    <td class="n">${pedF2(l.cantidad)} ${pedE(l.mat.unidad || 'm²')}</td>
    <td class="n">${pedInp(l, 'factor', l.mat.factor, 'corto', '0.01')}</td>
    <td class="n">${pedInp(l, 'rendCaja', l.mat.rendCaja, 'corto')}</td>
    <td class="n fuerte">${pedF0(c.cajas)}</td>
    <td class="n">${pedF2(c.m2Pedir)}</td>
    <td class="n">${pedF0(c.pegBultos)}<div class="ped-ayuda">${pedF0(c.pegPedir)} kg</div></td>
    <td class="n">${c.conMortero ? pedF0(c.morBultos) + `<div class="ped-ayuda">${pedF0(c.morKg)} kg</div>` : '—'}</td>
    <td class="n">${pedInp(l, 'ppto', l.ppto)}<div class="${c.dif == null ? '' : c.dif < 0 ? 'ped-neg' : 'ped-pos'}" style="font-size:10px">${c.dif == null ? '' : (c.dif > 0 ? '+' : '') + pedF2(c.dif)}</div></td>
  </tr>`);
  return `<table class="ped-tabla"><thead><tr>
      <th>Ubicación</th><th>Tipo</th><th>Material / uso</th><th class="n">Cantidad</th><th class="n">Factor<br>desp.</th>
      <th class="n">Rend.<br>por caja</th><th class="n">Cajas</th><th class="n">m² a<br>pedir</th><th class="n">Pegante<br>bultos</th>
      <th class="n">Mortero<br>bultos</th><th class="n">PPTO m² /<br>diferencia</th></tr></thead>
    <tbody>${filas}<tr class="ped-tot"><td colspan="6">TOTAL</td><td class="n">${pedF0(tot.pedido)}</td><td class="n">${pedF2(tot.m2)}</td>
      <td class="n">${pedF0(tot.peg)}</td><td class="n">${pedF0(tot.mor)}</td><td></td></tr></tbody></table>
    <p class="ped-ayuda" style="margin-top:4px">El pegante y el mortero (bulto, kg/m², desperdicio) se ajustan en <b>Materiales y rendimientos</b>.
      El mortero solo se calcula en piso (m²), no en guardaescoba (ml).</p>`;
}

function pedTablaConcreto(p) {
  const tot = pedTotales(p);
  const filas = pedPorTorre(p, 8, (l, c) => `<tr>
    <td><b>${pedE(l.clave)}</b><div class="ped-ayuda">${l.n || ''} elem.</div></td>
    <td>${pedSelectMat(p, l)}</td>
    <td>${pedTxt(l, 'ubicacion', 'Ej. pilotes eje 3')}</td>
    <td class="n">${pedF2(l.cantidad)}</td>
    <td class="n">${pedInp(l, 'factor', l.mat.factor, 'corto', '0.01')}</td>
    <td class="n">${pedF2(c.conDesp)}</td>
    <td class="n">${pedInp(l, 'paso', l.mat.paso, 'corto', '0.05')}</td>
    <td class="n fuerte">${pedF2(c.pedido)}</td>
  </tr>`);
  return `<table class="ped-tabla"><thead><tr>
      <th>Resistencia</th><th>Material</th><th>Ubicación</th><th class="n">m³ del<br>modelo</th><th class="n">Factor<br>desp.</th>
      <th class="n">m³ +<br>desp.</th><th class="n">Redondeo<br>(m³)</th><th class="n">m³ a<br>pedir</th></tr></thead>
    <tbody>${filas}<tr class="ped-tot"><td colspan="3">TOTAL</td><td class="n">${pedF2(tot.cantidad)}</td><td colspan="3"></td>
      <td class="n">${pedF2(tot.pedido)}</td></tr></tbody></table>
    <p class="ped-ayuda" style="margin-top:4px">«Redondeo» es el paso al que se le pide a la concretera (0,25 m³ = de cuarto en cuarto). Ponlo en 0 para no redondear.</p>`;
}

// ── Pestaña Seguimiento ─────────────────────────────────────
function pedHtmlSeguimiento(p) {
  let h = '';
  const av = pedAvisos(p);
  h += `<div class="ped-sec">Revisión de documentos</div>`;
  h += av.length
    ? `<div class="ped-avisos">${av.map(a => `<div>⚠ ${pedE(a)}</div>`).join('')}</div>`
    : `<div class="ped-avisos ok">✓ Sin pendientes: todo lo registrado tiene su entrada${p.clase === 'concreto' ? ' de almacén' : ''} y su factura.</div>`;

  h += `<div class="ped-sec">Datos del pedido al proveedor</div>
    <div class="ped-det-meta" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:0">
      <div><label>Proveedor</label><input type="text" value="${pedE(p.proveedor || '')}" placeholder="Ej. Cementos Argos" onchange="pedSet('proveedor',this.value)"></div>
      <div><label>Nº pedido del proveedor</label><input type="text" value="${pedE(p.pedidoProv || '')}" placeholder="Ej. 82724" onchange="pedSet('pedidoProv',this.value)"></div>
      <div><label>Orden de compra</label><input type="text" value="${pedE(p.ordenCompra || '')}" placeholder="Ej. 42100020" onchange="pedSet('ordenCompra',this.value)"></div>
    </div>`;

  if (p.clase === 'concreto') h += pedHtmlRemisiones(p);
  else h += pedHtmlEntradas(p);
  h += pedHtmlFacturas(p);

  const hist = (p.historial || []).map(x => `${PED_ESTADOS[x.estado] ? PED_ESTADOS[x.estado].lbl : x.estado} ${pedFecha(x.fecha)}`).join(' → ');
  h += `<div class="ped-sec">Historial</div><div class="ped-ayuda">Creado ${pedFecha(p.creado)}${hist ? ' · ' + pedE(hist) : ''}</div>`;
  return h;
}

function pedHtmlRemisiones(p) {
  const c = pedConsumo(p);
  const rem = p.remisiones || [];
  let h = `<div class="ped-sec">Consumo real</div>
    <div class="ped-kpis">
      <div class="ped-kpi"><span>Del modelo</span><b>${pedF2(c.teorico)}</b>m³</div>
      <div class="ped-kpi"><span>Pedido</span><b>${pedF2(c.pedido)}</b>m³</div>
      <div class="ped-kpi"><span>Recibido − sobrante</span><b>${pedF2(c.consumido)}</b>${pedF2(c.recibido)} − ${pedF2(c.sobrante)}</div>
      <div class="ped-kpi"><span>Sobreconsumo</span><b class="${c.dif > 0.005 ? 'ped-neg' : 'ped-pos'}">${rem.length ? (c.dif > 0 ? '+' : '') + pedF2(c.dif) : '—'}</b>${rem.length && c.pct != null ? (c.pct > 0 ? '+' : '') + c.pct.toFixed(1) + ' % contra el modelo' : 'm³'}</div>
    </div>
    <div class="ped-sec">Remisiones (una por mixer) <span style="flex:1"></span>
      <button type="button" class="ped-mini" onclick="pedRemAgregar()">+ Remisión</button></div>`;
  if (!rem.length) return h + `<div class="ped-vacio">Cuando llegue cada mixer, registra aquí su remisión.</div>`;
  h += `<div class="ped-tabla-wrap"><table class="ped-tabla"><thead><tr>
      <th>Nº remisión</th><th>Fecha</th><th class="n">m³</th><th class="n">Sobró<br>m³</th><th>Entrada<br>almacén</th>
      <th>Dónde se vació</th><th class="n">Modelo<br>m³</th><th></th></tr></thead><tbody>`;
  rem.forEach(r => {
    const marcados = (r.elementIds || []).length;
    const ver = PED.verRemision === r.id;
    h += `<tr${ver ? ' style="background:#eef6ff"' : ''}>
      <td><input type="text" class="largo" style="width:90px" value="${pedE(r.numero)}" placeholder="82710792" onchange="pedRemSet('${r.id}','numero',this.value)"></td>
      <td><input type="date" value="${pedE(r.fecha || '')}" onchange="pedRemSet('${r.id}','fecha',this.value)"></td>
      <td class="n"><input type="number" step="0.25" min="0" class="corto" value="${r.m3 || ''}" onchange="pedRemSet('${r.id}','m3',this.value)"></td>
      <td class="n"><input type="number" step="0.05" min="0" class="corto" value="${r.sobrante || ''}" onchange="pedRemSet('${r.id}','sobrante',this.value)"></td>
      <td><input type="text" style="width:80px" value="${pedE(r.entrada || '')}" placeholder="42100317" onchange="pedRemSet('${r.id}','entrada',this.value)"></td>
      <td><input type="text" class="largo" value="${pedE(r.ubicacion || '')}" placeholder="Ej. pilotes eje 3" onchange="pedRemSet('${r.id}','ubicacion',this.value)">
        <div class="ped-fila" style="margin-top:2px;gap:3px">
          <button type="button" class="ped-mini" onclick="pedRemMarcar('${r.id}')" title="Toma los elementos seleccionados en el visor">📍 Marcar (${marcados})</button>
          ${marcados ? `<button type="button" class="ped-mini" onclick="pedRemVer('${r.id}')">${ver ? 'Ocultar' : 'Ver'}</button>` : ''}
        </div></td>
      <td class="n">${r.teorico != null && marcados ? pedF2(r.teorico) : '—'}</td>
      <td><button type="button" class="ped-x" title="Borrar remisión" onclick="pedRemBorrar('${r.id}')">✕</button></td>
    </tr>`;
  });
  h += `<tr class="ped-tot"><td colspan="2">TOTAL</td><td class="n">${pedF2(c.recibido)}</td><td class="n">${pedF2(c.sobrante)}</td><td colspan="4"></td></tr>`;
  return h + `</tbody></table></div>
    <p class="ped-ayuda" style="margin-top:4px">«Marcar» guarda los elementos seleccionados en el visor como el sitio donde se vació esa remisión.
      «Modelo m³» es lo que esos elementos deberían llevar según el modelo, para comparar contra los m³ de la remisión.</p>`;
}

function pedHtmlEntradas(p) {
  const ent = p.entradas || [];
  let h = `<div class="ped-sec">Entradas de almacén <span style="flex:1"></span>
      <button type="button" class="ped-mini" onclick="pedEntAgregar()">+ Entrada</button></div>`;
  if (!ent.length) return h + `<div class="ped-vacio">Registra cada entrada de almacén cuando llegue el material.</div>`;
  h += `<table class="ped-tabla"><thead><tr><th>Nº entrada</th><th>Fecha</th><th class="n">Cantidad</th><th>Unidad</th><th>Nota</th><th></th></tr></thead><tbody>`;
  ent.forEach(e => {
    h += `<tr>
      <td><input type="text" style="width:90px" value="${pedE(e.numero)}" onchange="pedEntSet('${e.id}','numero',this.value)"></td>
      <td><input type="date" value="${pedE(e.fecha || '')}" onchange="pedEntSet('${e.id}','fecha',this.value)"></td>
      <td class="n"><input type="number" min="0" value="${e.cantidad || ''}" onchange="pedEntSet('${e.id}','cantidad',this.value)"></td>
      <td><input type="text" class="corto" value="${pedE(e.unidad || '')}" onchange="pedEntSet('${e.id}','unidad',this.value)"></td>
      <td><input type="text" class="largo" value="${pedE(e.nota || '')}" onchange="pedEntSet('${e.id}','nota',this.value)"></td>
      <td><button type="button" class="ped-x" onclick="pedEntBorrar('${e.id}')">✕</button></td></tr>`;
  });
  return h + `</tbody></table>`;
}

function pedHtmlFacturas(p) {
  const fac = p.facturas || [];
  const docs = p.clase === 'concreto'
    ? (p.remisiones || []).map(r => String(r.numero).trim()).filter(Boolean)
    : (p.entradas || []).map(e => String(e.numero).trim()).filter(Boolean);
  const qdoc = p.clase === 'concreto' ? 'remisiones' : 'entradas';
  let h = `<div class="ped-sec">Facturas <span style="flex:1"></span>
      <button type="button" class="ped-mini" onclick="pedFacAgregar()">+ Factura</button></div>`;
  if (!fac.length) return h + `<div class="ped-vacio">Una factura puede cubrir varias ${qdoc}.</div>`;
  h += `<table class="ped-tabla"><thead><tr><th>Nº factura</th><th>Fecha</th><th class="n">Valor total</th><th>Cubre las ${qdoc}</th><th></th></tr></thead><tbody>`;
  fac.forEach(f => {
    const extra = (f.docs || []).filter(d => !docs.includes(d));
    h += `<tr>
      <td><input type="text" style="width:100px" value="${pedE(f.numero)}" placeholder="1040-743745" onchange="pedFacSet('${f.id}','numero',this.value)"></td>
      <td><input type="date" value="${pedE(f.fecha || '')}" onchange="pedFacSet('${f.id}','fecha',this.value)"></td>
      <td class="n"><input type="number" min="0" style="width:95px" value="${f.valor || ''}" onchange="pedFacSet('${f.id}','valor',this.value)"></td>
      <td>${docs.length || extra.length ? [...docs, ...extra].map(d => `<label style="display:inline-flex;gap:3px;margin-right:8px;font-size:11px">
          <input type="checkbox" ${(f.docs || []).includes(d) ? 'checked' : ''} data-d="${pedE(d)}" onchange="pedFacDoc('${f.id}', this.dataset.d, this.checked)">${pedE(d)}</label>`).join('')
        : `<span class="ped-ayuda">Primero registra las ${qdoc} con su número.</span>`}</td>
      <td><button type="button" class="ped-x" onclick="pedFacBorrar('${f.id}')">✕</button></td></tr>`;
  });
  return h + `</tbody></table>`;
}

// ═══════════ CATÁLOGO DE MATERIALES ═══════════
function pedAbrirCatalogo() { pedRenderCatalogo(); document.getElementById('ped-cat-overlay').hidden = false; }
function pedCerrarCatalogo() { document.getElementById('ped-cat-overlay').hidden = true; pedRender(); }
function pedCatRestaurar() {
  if (!confirm('¿Volver a los valores de ejemplo? Se pierden los materiales que hayas creado o cambiado.\nLos pedidos ya hechos no cambian.')) return;
  PED.catalogo = PED_CAT_SEMILLA.map(m => ({ ...m })); pedCatGuardar(); pedRenderCatalogo();
}
function pedCatAgregar(clase) {
  PED.catalogo.push({ id: clase[0] + '-' + pedId(), clase, busca: '', ...pedMatVacio(clase), nombre: 'Material nuevo' });
  pedCatGuardar(); pedRenderCatalogo();
}
function pedCatBorrar(id) {
  const m = pedMat(id); if (!m) return;
  if (!confirm(`¿Borrar «${m.nombre}» del catálogo? Los pedidos que ya lo usan conservan sus valores.`)) return;
  PED.catalogo = PED.catalogo.filter(x => x.id !== id); pedCatGuardar(); pedRenderCatalogo();
}
function pedCatSet(id, campo, valor, tipo) {
  const m = pedMat(id); if (!m) return;
  m[campo] = tipo === 'n' ? pedN(valor) : tipo === 'b' ? !!valor : valor;
  pedCatGuardar();
}
function pedRenderCatalogo() {
  const cN = (m, k, paso) => `<input type="number" step="${paso || 'any'}" min="0" value="${m[k] ?? ''}" onchange="pedCatSet('${m.id}','${k}',this.value,'n')">`;
  const cT = (m, k, w) => `<input type="text" style="width:${w || 150}px" value="${pedE(m[k] || '')}" onchange="pedCatSet('${m.id}','${k}',this.value)">`;
  const del = m => `<button type="button" class="ped-x" onclick="pedCatBorrar('${m.id}')">✕</button>`;
  const seccion = (clase, cab, fila) => {
    const lista = PED.catalogo.filter(m => m.clase === clase);
    return `<div class="ped-sec">${PED_CLASES[clase].icono} ${PED_CLASES[clase].lbl}<span style="flex:1"></span>
        <button type="button" class="ped-mini" onclick="pedCatAgregar('${clase}')">+ Material</button></div>
      <div class="ped-tabla-wrap"><table class="ped-tabla"><thead><tr>${cab}<th></th></tr></thead>
      <tbody>${lista.map(m => `<tr>${fila(m)}<td>${del(m)}</td></tr>`).join('') || `<tr><td colspan="20" class="ped-ayuda">Sin materiales</td></tr>`}</tbody></table></div>`;
  };
  document.getElementById('ped-cat-cuerpo').innerHTML =
    seccion('mamposteria',
      '<th>Material / uso</th><th>Busca en el tipo</th><th class="n">Rend. ud/m²</th><th class="n">Paca (ud)</th><th class="n">Factor desp.</th><th class="n">Días de entrega</th>',
      m => `<td>${cT(m, 'nombre', 220)}</td><td>${cT(m, 'busca')}</td><td class="n">${cN(m, 'rend')}</td><td class="n">${cN(m, 'paca')}</td>
            <td class="n">${cN(m, 'factor', '0.01')}</td><td class="n">${cN(m, 'dias', '1')}</td>`) +
    seccion('enchape',
      '<th>Material / uso</th><th>Busca en el tipo</th><th>Mide en</th><th class="n">Rend. por caja</th><th class="n">m² por caja</th><th class="n">Factor desp.</th>' +
      '<th class="n">Pegante kg/m²</th><th class="n">Factor peg.</th><th class="n">Bulto peg. kg</th><th>Mortero</th><th class="n">Mortero m²/m³</th>' +
      '<th class="n">Factor mort.</th><th class="n">Bultos por m³</th><th class="n">Bulto mort. kg</th><th class="n">Días</th>',
      m => `<td>${cT(m, 'nombre', 200)}</td><td>${cT(m, 'busca', 110)}</td>
            <td><select onchange="pedCatSet('${m.id}','unidad',this.value)"><option${m.unidad === 'm²' ? ' selected' : ''}>m²</option><option${m.unidad === 'ml' ? ' selected' : ''}>ml</option></select></td>
            <td class="n">${cN(m, 'rendCaja')}</td><td class="n">${cN(m, 'm2Caja')}</td><td class="n">${cN(m, 'factor', '0.01')}</td>
            <td class="n">${cN(m, 'pegKg')}</td><td class="n">${cN(m, 'pegFactor', '0.01')}</td><td class="n">${cN(m, 'pegBulto')}</td>
            <td><input type="checkbox" ${m.mortero ? 'checked' : ''} onchange="pedCatSet('${m.id}','mortero',this.checked,'b')"></td>
            <td class="n">${cN(m, 'morRend')}</td><td class="n">${cN(m, 'morFactor', '0.01')}</td><td class="n">${cN(m, 'morBultosM3')}</td>
            <td class="n">${cN(m, 'morBultoKg')}</td><td class="n">${cN(m, 'dias', '1')}</td>`) +
    seccion('concreto',
      '<th>Material</th><th>Busca en la resistencia</th><th class="n">Factor desp.</th><th class="n">Redondeo m³</th><th class="n">Días de entrega</th>',
      m => `<td>${cT(m, 'nombre', 220)}</td><td>${cT(m, 'busca')}</td><td class="n">${cN(m, 'factor', '0.01')}</td>
            <td class="n">${cN(m, 'paso', '0.05')}</td><td class="n">${cN(m, 'dias', '1')}</td>`);
}

// ═══════════ EXCEL DEL PEDIDO ═══════════
// Mismo formato de los Excel de pedidos de Ingeurbe, con las fórmulas vivas
// para que compras pueda cambiar un rendimiento y ver el nuevo pedido.
function pedHoja(filas, anchos) {
  const ws = {}; let maxC = 0;
  filas.forEach((fila, r) => (fila || []).forEach((v, c) => {
    if (v === null || v === undefined || v === '') return;
    const ref = XLSX.utils.encode_cell({ r, c });
    let cell;
    if (typeof v === 'object') {
      cell = { t: typeof v.v === 'string' ? 's' : 'n', v: v.v ?? 0 };
      if (v.f) cell.f = v.f;
      if (v.z) cell.z = v.z;
    } else cell = { t: typeof v === 'number' ? 'n' : 's', v };
    if (cell.t === 'n' && !cell.z) cell.z = '#,##0.00';
    ws[ref] = cell; maxC = Math.max(maxC, c);
  }));
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, filas.length - 1), c: maxC } });
  if (anchos) ws['!cols'] = anchos.map(w => ({ wch: w }));
  return ws;
}

async function pedExportarExcel() {
  const p = pedActivo(); if (!p) { alert('Elige un pedido.'); return; }
  try { if (!window.XLSX) await ensureLib('XLSX'); }
  catch (e) { alert('No se pudo cargar la librería de Excel.\n' + e.message); return; }
  const wb = XLSX.utils.book_new();
  const cl = PED_CLASES[p.clase];
  const cab = [
    [`PEDIDO ${p.numero} · ${p.nombre}`],
    ['Material', cl.lbl, '', 'Estado', PED_ESTADOS[p.estado].lbl],
    ['Se necesita en obra', pedFecha(p.fechaObra), '', 'Pedir a más tardar', pedFecha(pedFechaPedir(p))],
    ['Proveedor', p.proveedor || '', '', 'Orden de compra', p.ordenCompra || '', '', 'Nº pedido proveedor', p.pedidoProv || ''],
    p.notas ? ['Notas', p.notas] : [],
    [],
  ];
  const filas = cab.slice();
  const torres = [...new Set(p.lineas.map(l => l.edificacion))];
  const Z0 = '#,##0';

  torres.forEach(torre => {
    const ls = p.lineas.filter(l => l.edificacion === torre);
    const sufijo = torre ? ' ' + torre.toUpperCase() : '';
    if (p.clase === 'mamposteria') {
      filas.push([`CANTIDADES DE MAMPOSTERÍA${sufijo}`]);
      filas.push(['MAMPOSTERÍA', 'TIPO', 'MATERIAL / USO', 'UBICACIÓN', 'M2', 'REND.', 'CANT. NETA', 'FACTOR DESP.', 'CANT. NETA + DESP',
                  'PACA', 'PACA/(CANT. NETA + DESP)', 'NÚMERO ENTERO', 'PEDIDO', 'PPTO', 'DIFERENCIA']);
      const r0 = filas.length + 1;
      ls.forEach((l, i) => {
        const r = r0 + i, c = pedCalc(l, p.clase), paca = pedN(l.mat.paca);
        filas.push([l.categoria, l.clave, l.mat.nombre, l.ubicacion, pedN(l.cantidad), pedN(l.mat.rend),
          { v: c.neta, f: `E${r}*F${r}` }, pedN(l.mat.factor), { v: c.conDesp, f: `G${r}*H${r}` },
          paca || '', paca ? { v: c.pacas, f: `I${r}/J${r}` } : '',
          paca ? { v: c.entero, f: `ROUNDUP(K${r},0)`, z: Z0 } : '',
          { v: c.pedido, f: `IF(J${r}>0,L${r}*J${r},ROUNDUP(I${r},0))`, z: Z0 },
          l.ppto == null ? '' : pedN(l.ppto), l.ppto == null ? '' : { v: c.dif, f: `N${r}-M${r}`, z: Z0 }]);
      });
      const r1 = filas.length;
      filas.push(['TOTAL', '', '', '', { v: pedTotales({ ...p, lineas: ls }).cantidad, f: `SUM(E${r0}:E${r1})` }, '', '', '', '', '', '', '',
                  { v: pedTotales({ ...p, lineas: ls }).pedido, f: `SUM(M${r0}:M${r1})`, z: Z0 }]);
    } else if (p.clase === 'enchape') {
      filas.push([`CANTIDADES DE ENCHAPE${sufijo}`, '', '', '', '', '', '', '', '', '', '', `PEGANTE${sufijo}`, '', '', '', '', '', '', `MORTERO PISO${sufijo}`]);
      filas.push(['TIPO', 'DESCRIPCIÓN', 'REF', 'UNIDAD', 'CANTIDAD', 'FACTOR DESP.', 'CANT. NETA + DESP', 'RENDIMIENTO POR CAJA',
        'NÚMERO DE CAJAS A PEDIR', 'M2 POR CAJA', 'METROS CUADRADOS A PEDIR',
        'RENDIMIENTO PEGANTE (KG/M2)', 'PEGANTE (KG)', 'FACTOR DESP.', 'CANT. NETA + DESP', 'BULTO (KG)', 'BULTOS A PEDIR', 'PEDIDO PEGANTE (KG)',
        'RENDIMIENTO MORTERO (M2/M3)', 'MORTERO REQUERIDO (M3)', 'FACTOR DESP.', 'CANT. NETA + DESP', 'BULTOS POR M3', 'BULTOS DE MORTERO', 'BULTO (KG)', 'PEDIDO MORTERO (KG)',
        'PPTO (M2)', 'DIFERENCIA']);
      const r0 = filas.length + 1;
      ls.forEach((l, i) => {
        const r = r0 + i, c = pedCalc(l, p.clase), m = l.mat;
        const fila = [l.categoria, l.clave, m.nombre, (m.unidad || 'm²').toUpperCase(), pedN(l.cantidad), pedN(m.factor),
          { v: c.conDesp, f: `E${r}*F${r}` }, pedN(m.rendCaja), { v: c.cajas, f: `ROUNDUP(G${r}/H${r},0)`, z: Z0 }, pedN(m.m2Caja),
          { v: c.m2Pedir, f: `I${r}*J${r}` },
          pedN(m.pegKg), { v: c.pegKg, f: `ROUNDUP(L${r}*K${r},0)`, z: Z0 }, pedN(m.pegFactor), { v: c.pegDesp, f: `M${r}*N${r}` },
          pedN(m.pegBulto), { v: c.pegBultos, f: `ROUNDUP(O${r}/P${r},0)`, z: Z0 }, { v: c.pegPedir, f: `Q${r}*P${r}`, z: Z0 }];
        if (c.conMortero) fila.push(pedN(m.morRend), { v: c.morM3, f: `E${r}/S${r}` }, pedN(m.morFactor), { v: c.morDesp, f: `T${r}*U${r}` },
          pedN(m.morBultosM3), { v: c.morBultos, f: `ROUNDUP(V${r}*W${r},0)`, z: Z0 }, pedN(m.morBultoKg), { v: c.morKg, f: `X${r}*Y${r}`, z: Z0 });
        else fila.push('', '', '', '', '', '', '', '');
        if (l.ppto != null) fila.push(pedN(l.ppto), { v: c.dif, f: `AA${r}-K${r}` });
        filas.push(fila);
      });
      const r1 = filas.length;
      const cs = ls.map(l => pedCalc(l, p.clase));
      const suma = k => cs.reduce((s, x) => s + (x[k] || 0), 0);
      const S = (col, k) => ({ v: suma(k), f: `SUM(${col}${r0}:${col}${r1})`, z: Z0 });
      filas.push(['TOTAL', '', '', '', '', '', '', '', S('I', 'cajas'), '', { v: suma('m2Pedir'), f: `SUM(K${r0}:K${r1})` }, '', S('M', 'pegKg'), '', '', '',
                  S('Q', 'pegBultos'), S('R', 'pegPedir'), '', '', '', '', '', S('X', 'morBultos'), '', S('Z', 'morKg')]);
    } else {
      filas.push([`PEDIDO DE CONCRETO${sufijo}`]);
      filas.push(['RESISTENCIA', 'MATERIAL', 'UBICACIÓN', 'ELEMENTOS', 'M3 DEL MODELO', 'FACTOR DESP.', 'M3 + DESP', 'REDONDEO (M3)', 'M3 A PEDIR']);
      const r0 = filas.length + 1;
      ls.forEach((l, i) => {
        const r = r0 + i, c = pedCalc(l, p.clase), paso = pedN(l.mat.paso);
        filas.push([l.clave, l.mat.nombre, l.ubicacion, { v: l.n || 0, z: Z0 }, pedN(l.cantidad), pedN(l.mat.factor), { v: c.conDesp, f: `E${r}*F${r}` },
          paso, { v: c.pedido, f: paso ? `ROUNDUP(G${r}/H${r},0)*H${r}` : `ROUND(G${r},2)` }]);
      });
      const r1 = filas.length;
      const tt = pedTotales({ ...p, lineas: ls });
      filas.push(['TOTAL', '', '', '', { v: tt.cantidad, f: `SUM(E${r0}:E${r1})` }, '', '', '', { v: tt.pedido, f: `SUM(I${r0}:I${r1})` }]);
    }
    filas.push([]);
  });
  XLSX.utils.book_append_sheet(wb, pedHoja(filas, [18, 30, 26, 18, 12, 10, 12, 12, 14, 10, 14, 12, 12, 12, 12, 10, 12, 14, 12, 12, 10, 12, 10, 12, 10, 14, 12, 12]), 'Pedido');

  // Seguimiento
  if (p.clase === 'concreto') {
    const facDe = d => (p.facturas || []).filter(f => (f.docs || []).includes(d)).map(f => f.numero).join(', ');
    const fr = [['REMISIONES · ' + p.numero],
      ['Nº REMISIÓN', 'FECHA', 'M3 RECIBIDOS', 'SOBRANTE (M3)', 'CONSUMIDO (M3)', 'ENTRADA DE ALMACÉN', 'FACTURA', 'DÓNDE SE VACIÓ', 'ELEMENTOS MARCADOS', 'M3 SEGÚN MODELO']];
    (p.remisiones || []).forEach((r, i) => {
      const n = i + 3;
      fr.push([r.numero, pedFecha(r.fecha), pedN(r.m3), pedN(r.sobrante), { v: pedN(r.m3) - pedN(r.sobrante), f: `C${n}-D${n}` }, r.entrada || '',
        facDe(String(r.numero).trim()), r.ubicacion || '', { v: (r.elementIds || []).length, z: Z0 }, r.teorico == null ? '' : r.teorico]);
    });
    const n1 = fr.length, c = pedConsumo(p);
    fr.push(['TOTAL', '', { v: c.recibido, f: `SUM(C3:C${n1})` }, { v: c.sobrante, f: `SUM(D3:D${n1})` }, { v: c.consumido, f: `SUM(E3:E${n1})` }]);
    fr.push([]);
    fr.push(['CONSUMO REAL']);
    fr.push(['M3 según modelo', c.teorico]);
    fr.push(['M3 pedidos', c.pedido]);
    fr.push(['M3 consumidos (recibido − sobrante)', c.consumido]);
    fr.push(['Sobreconsumo contra el modelo (M3)', c.dif]);
    if (c.pct != null) fr.push(['Sobreconsumo contra el modelo (%)', { v: c.pct / 100, z: '0.0%' }]);
    XLSX.utils.book_append_sheet(wb, pedHoja(fr, [16, 12, 14, 14, 14, 18, 16, 28, 12, 14]), 'Remisiones');
  } else {
    const fr = [['ENTRADAS DE ALMACÉN · ' + p.numero], ['Nº ENTRADA', 'FECHA', 'CANTIDAD', 'UNIDAD', 'NOTA', 'FACTURA']];
    (p.entradas || []).forEach(e => fr.push([e.numero, pedFecha(e.fecha), pedN(e.cantidad), e.unidad || '', e.nota || '',
      (p.facturas || []).filter(f => (f.docs || []).includes(String(e.numero).trim())).map(f => f.numero).join(', ')]));
    XLSX.utils.book_append_sheet(wb, pedHoja(fr, [16, 12, 12, 10, 30, 16]), 'Entradas');
  }
  const ff = [['FACTURAS · ' + p.numero], ['Nº FACTURA', 'FECHA', 'VALOR TOTAL', p.clase === 'concreto' ? 'REMISIONES QUE CUBRE' : 'ENTRADAS QUE CUBRE']];
  (p.facturas || []).forEach(f => ff.push([f.numero, pedFecha(f.fecha), { v: pedN(f.valor), z: '#,##0' }, (f.docs || []).join(', ')]));
  XLSX.utils.book_append_sheet(wb, pedHoja(ff, [16, 12, 16, 40]), 'Facturas');
  const av = pedAvisos(p);
  if (av.length) XLSX.utils.book_append_sheet(wb, pedHoja([['PENDIENTES DE DOCUMENTOS'], ...av.map(a => [a])], [90]), 'Pendientes');

  const nombre = `${p.numero}_${cl.lbl}_${(p.nombre || '').replace(/[^\wáéíóúñÁÉÍÓÚÑ -]/g, '').slice(0, 40)}.xlsx`.replace(/\s+/g, '_');
  XLSX.writeFile(wb, nombre);
  notify('📥 Excel del pedido descargado');
}

pedCargar();
// Cada obra tiene sus pedidos: al abrir una obra se cargan los suyos
window.alModeloCargadoPedidos = function () {
  pedCargar();
  if (moduloActivo === 'pedidos') pedRenderTodo();
};
