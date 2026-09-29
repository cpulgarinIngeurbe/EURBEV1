// Todo el acceso a Firebase. Sin DOM. Usa el SDK compat (window.firebase).
(function () {
  let auth, db, online = true;

  function iniciar(cfg) {
    if (!window.firebase) throw Object.assign(new Error('sdk'), { code: 'sin-sdk' });
    firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
    if (['localhost', '127.0.0.1'].includes(location.hostname)) {
      auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
      db.useEmulator('127.0.0.1', 8080);
    }
    // Sin enablePersistence: con los trozos del modelo (900 KB) en la cache
    // persistente cada escritura tardaba ~16 s, y con varias pestanas la subida
    // se colgaba. La copia local del modelo la lleva CacheModelo (IndexedDB
    // propia); los cortes van en memoria y, si se cae la red, siguen visibles
    // en solo lectura. Las transacciones de cortes nunca se encolan offline.
    window.addEventListener('online', () => { online = true; });
    window.addEventListener('offline', () => { online = false; });
    online = navigator.onLine;
  }

  const correoDe = u => (u && u.email || '').toLowerCase();
  const usuario = () => auth && auth.currentUser;
  const alCambiarSesion = cb => auth.onAuthStateChanged(cb);
  const entrar = (c, k) => auth.signInWithEmailAndPassword(c.trim().toLowerCase(), k);
  async function crearCuenta(c, k) {
    const r = await auth.createUserWithEmailAndPassword(c.trim().toLowerCase(), k);
    await r.user.sendEmailVerification();
    return r.user;
  }
  const reenviarVerificacion = () => auth.currentUser.sendEmailVerification();
  const recuperarClave = c => auth.sendPasswordResetEmail(c.trim().toLowerCase());
  const salir = () => auth.signOut();

  async function miAcceso() {
    const s = await db.doc('accesos/' + correoDe(usuario())).get();
    return s.exists ? s.data() : null;
  }

  // El admin ve todas; los demas consultan filtrando por sus entornos (las
  // reglas exigen ese filtro). array-contains-any admite 30 valores por consulta.
  async function listarObras(ses) {
    const deDocs = q => q.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!ses || ses.rol === 'admin') return deDocs(await db.collection('obras').orderBy('nombre').get());
    const ids = ses.entornos || [], vistas = new Map();
    for (let i = 0; i < ids.length; i += 30) {
      const q = await db.collection('obras').where('entornos', 'array-contains-any', ids.slice(i, i + 30)).get();
      deDocs(q).forEach(o => vistas.set(o.id, o));
    }
    return [...vistas.values()];
  }
  async function crearObra(nombre, entornos) {
    const ref = db.collection('obras').doc();
    await ref.set({ nombre: nombre.trim(), entornos: entornos || [], modeloVigente: null, contadorCortes: 0,
                    creadaPor: correoDe(usuario()), fecha: new Date().toISOString() });
    return ref.id;
  }

  // ── Entornos ──
  async function listarEntornos(ses) {
    if (!ses || ses.rol === 'admin') {
      const q = await db.collection('entornos').get();
      return q.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const out = [];
    for (const id of ses.entornos || []) {
      const s = await db.doc('entornos/' + id).get();
      if (s.exists) out.push({ id, ...s.data() });
    }
    return out;
  }
  async function crearEntorno(nombre, id) {
    const ref = id ? db.doc('entornos/' + id) : db.collection('entornos').doc();
    await ref.set({ nombre: nombre.trim(), creadoPor: correoDe(usuario()), fecha: new Date().toISOString() });
    return ref.id;
  }
  const renombrarEntorno = (id, nombre) => db.doc('entornos/' + id).update({ nombre: nombre.trim() });
  // Marca/desmarca obras en un entorno sin tocar sus otros entornos
  async function fijarObrasDeEntorno(entornoId, marcadas, obras) {
    const FV = firebase.firestore.FieldValue, b = db.batch();
    let n = 0;
    for (const o of obras) {
      const esta = (o.entornos || []).includes(entornoId), quiere = marcadas.has(o.id);
      if (esta === quiere) continue;
      b.update(db.doc('obras/' + o.id), { entornos: quiere ? FV.arrayUnion(entornoId) : FV.arrayRemove(entornoId) });
      n++;
    }
    if (n) await b.commit();
    return n;
  }
  // Primera vez tras la actualizacion: todo lo existente pasa a «General»
  async function migrarEntornos() {
    const ent = await listarEntornos(null);
    if (ent.length) return false;
    const [obras, accesos] = await Promise.all([listarObras(null), listarAccesos()]);
    const plan = EurbeEntornos.planMigracion({ entornos: ent, obras, accesos });
    await crearEntorno(EurbeEntornos.GENERAL.nombre, EurbeEntornos.GENERAL.id);
    const b = db.batch();
    plan.obras.forEach(id => b.update(db.doc('obras/' + id), { entornos: [EurbeEntornos.GENERAL.id] }));
    plan.accesos.forEach(c => b.update(db.doc('accesos/' + c), { entornos: [EurbeEntornos.GENERAL.id] }));
    if (plan.obras.length || plan.accesos.length) await b.commit();
    return true;
  }
  function escucharObra(obraId, cb) {
    return db.doc('obras/' + obraId).onSnapshot(s => cb({ id: s.id, ...s.data() }));
  }

  async function leerVersion(obraId, versionId) {
    const s = await db.doc(`obras/${obraId}/modelos/${versionId}`).get();
    return { id: s.id, ...s.data() };
  }
  async function descargarTrozos(obraId, meta, onProgreso) {
    const out = [];
    for (let i = 0; i < meta.nTrozos; i++) {
      const s = await db.doc(`obras/${obraId}/modelos/${meta.id}/trozos/${i}`).get({ source: 'server' });
      out.push(s.data().datos.toUint8Array());
      onProgreso && onProgreso((i + 1) / meta.nTrozos);
    }
    return out;
  }
  // Orden: trozos -> metadatos -> modeloVigente. Si se corta a mitad, la obra
  // sigue apuntando a la version anterior y nadie ve un modelo incompleto.
  async function subirVersion(obraId, paquete, info, onProgreso) {
    const ref = db.collection(`obras/${obraId}/modelos`).doc();
    for (let i = 0; i < paquete.trozos.length; i++) {
      await ref.collection('trozos').doc(String(i))
        .set({ datos: firebase.firestore.Blob.fromUint8Array(paquete.trozos[i]) });
      onProgreso && onProgreso((i + 1) / (paquete.trozos.length + 1));
    }
    await ref.set({ archivoOriginal: info.archivoOriginal, fecha: new Date().toISOString(),
      subidoPor: correoDe(usuario()), nElementos: info.nElementos, bytesComprimidos: paquete.bytes,
      nTrozos: paquete.trozos.length, huella: paquete.huella, paramMap: info.paramMap });
    await db.doc('obras/' + obraId).update({ modeloVigente: ref.id });
    onProgreso && onProgreso(1);
    return ref.id;
  }

  function traducirError(e) {
    const c = (e && e.code) || '';
    if (c === 'sin-sdk') return 'No se pudo conectar con el servicio de datos. Puede que la red lo esté bloqueando.';
    if (c === 'huella') return e.message;
    if (c.includes('resource-exhausted')) return 'Límite diario del plan gratuito alcanzado; vuelve a estar disponible mañana.';
    if (c.includes('permission-denied')) return 'No tienes permiso para esta acción.';
    if (c.includes('unavailable') || c.includes('network')) return 'Sin conexión con el servicio de datos.';
    if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found')
      return 'Correo o contraseña incorrectos.';
    if (c === 'auth/email-already-in-use') return 'Ese correo ya tiene cuenta. Usa «Entrar» o «Olvidé mi contraseña».';
    if (c === 'auth/invalid-email') return 'Eso no parece un correo: revisa que tenga @ y no tenga espacios.';
    if (c === 'auth/missing-password') return 'Escribe tu contraseña.';
    if (c === 'auth/weak-password') return 'La contraseña debe tener al menos 6 caracteres.';
    if (c === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos.';
    return 'Error: ' + ((e && e.message) || e);
  }

  function escucharCortes(obraId, cb) {
    return db.collection(`obras/${obraId}/cortes`).orderBy('numeroSec')
      .onSnapshot({ includeMetadataChanges: true }, q => {
        online = !q.metadata.fromCache;
        cb(q.docs.map(d => ({ id: d.id, ...d.data() })), { desdeCache: q.metadata.fromCache });
      });
  }

  // Transaccion: numero siguiente + corte. Las transacciones no se encolan sin
  // conexion: si no hay red, falla y no queda un registro pendiente.
  // Si dos personas registran a la vez, la segunda puede chocar con el corte
  // que acaba de crear la primera: el servidor lo rechaza como permiso denegado
  // (no como conflicto), asi que el SDK no reintenta solo. Se lee tambien el
  // documento destino y se reintenta unas pocas veces con el contador fresco.
  async function registrarCorte(obraId, datos) {
    for (let intento = 1; ; intento++) {
      try { return await intentarRegistro(obraId, datos); }
      catch (e) {
        const choque = e && (e.code === 'permission-denied' || e.code === 'corte-existe');
        if (!choque || intento >= 3) throw e;
        await new Promise(r => setTimeout(r, 150 + Math.random() * 350));
      }
    }
  }
  function intentarRegistro(obraId, datos) {
    const yo = correoDe(usuario()), ahora = new Date().toISOString();
    const obraRef = db.doc('obras/' + obraId);
    return db.runTransaction(async tx => {
      const n = ((await tx.get(obraRef)).data().contadorCortes || 0) + 1;
      const corteRef = db.doc(`obras/${obraId}/cortes/n${n}`);
      if ((await tx.get(corteRef)).exists) throw Object.assign(new Error('corte-existe'), { code: 'corte-existe' });
      const number = EurbeCortes.numeroCorte(n);
      tx.update(obraRef, { contadorCortes: n });
      tx.set(corteRef, Object.assign({}, datos, {
        numeroSec: n, number, estado: 'revision', creadoPor: yo,
        historial: [{ estado: 'revision', por: yo, fecha: ahora }],
        ultimoCambio: firebase.firestore.FieldValue.serverTimestamp(),
      }));
      return { id: 'n' + n, number };
    });
  }

  function cambiarEstado(obraId, corteId, nuevo, motivo) {
    const yo = correoDe(usuario());
    const ref = db.doc(`obras/${obraId}/cortes/${corteId}`);
    return db.runTransaction(async tx => {
      const actual = (await tx.get(ref)).data();
      const entrada = { estado: nuevo, por: yo, fecha: new Date().toISOString() };
      if (motivo) entrada.motivo = motivo;
      const cambio = { estado: nuevo, historial: [...(actual.historial || []), entrada],
        ultimoCambio: firebase.firestore.FieldValue.serverTimestamp() };
      if (nuevo === 'anulado') { cambio.anuladoPor = yo; cambio.motivoAnulacion = motivo; }
      tx.update(ref, cambio);
    });
  }

  async function listarAccesos() {
    const q = await db.collection('accesos').get();
    return q.docs.map(d => ({ correo: d.id, ...d.data() })).sort((a, b) => a.correo.localeCompare(b.correo));
  }
  function guardarAcceso(correo, { rol, nombre, activo, entornos }) {
    const datos = { rol, nombre: (nombre || '').trim(), activo: !!activo,
      creadoPor: correoDe(usuario()), fecha: new Date().toISOString() };
    if (Array.isArray(entornos)) datos.entornos = entornos;
    return db.doc('accesos/' + correo.trim().toLowerCase()).set(datos, { merge: true });
  }

  // El contador sube PRIMERO: si un lote falla a medias, los registros nuevos
  // siguen numerando por encima de lo importado en vez de chocar con ello.
  async function importarCortes(obraId, docs, maxSec) {
    const obraRef = db.doc('obras/' + obraId);
    await db.runTransaction(async tx => {
      const actual = (await tx.get(obraRef)).data().contadorCortes || 0;
      if (maxSec > actual) tx.update(obraRef, { contadorCortes: maxSec });
    });
    for (const lote of EurbeCortes.lotesPorTamano(docs, 8 * 1024 * 1024)) {
      const b = db.batch();
      for (const d of lote) {
        b.set(db.doc(`obras/${obraId}/cortes/${d.id}`), Object.assign({}, d.datos,
          { ultimoCambio: firebase.firestore.FieldValue.serverTimestamp() }));
      }
      await b.commit();
    }
  }

  window.Nube = { iniciar, usuario, alCambiarSesion, entrar, crearCuenta, reenviarVerificacion,
    recuperarClave, salir, miAcceso, listarObras, crearObra, escucharObra, leerVersion,
    descargarTrozos, subirVersion, traducirError, correoDe, enLinea: () => online,
    escucharCortes, registrarCorte, cambiarEstado,
    listarAccesos, guardarAcceso, importarCortes,
    listarEntornos, crearEntorno, renombrarEntorno, fijarObrasDeEntorno, migrarEntornos,
    _db: () => db };
})();
