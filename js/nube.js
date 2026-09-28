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

  async function listarObras() {
    const q = await db.collection('obras').orderBy('nombre').get();
    return q.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async function crearObra(nombre) {
    const ref = db.collection('obras').doc();
    await ref.set({ nombre: nombre.trim(), modeloVigente: null, contadorCortes: 0,
                    creadaPor: correoDe(usuario()), fecha: new Date().toISOString() });
    return ref.id;
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
  function registrarCorte(obraId, datos) {
    const yo = correoDe(usuario()), ahora = new Date().toISOString();
    const obraRef = db.doc('obras/' + obraId);
    return db.runTransaction(async tx => {
      const n = ((await tx.get(obraRef)).data().contadorCortes || 0) + 1;
      const number = EurbeCortes.numeroCorte(n);
      tx.update(obraRef, { contadorCortes: n });
      tx.set(db.doc(`obras/${obraId}/cortes/n${n}`), Object.assign({}, datos, {
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
  function guardarAcceso(correo, { rol, nombre, activo }) {
    return db.doc('accesos/' + correo.trim().toLowerCase()).set({
      rol, nombre: (nombre || '').trim(), activo: !!activo,
      creadoPor: correoDe(usuario()), fecha: new Date().toISOString() }, { merge: true });
  }

  async function importarCortes(obraId, docs, maxSec) {
    for (let i = 0; i < docs.length; i += 400) {
      const lote = db.batch();
      for (const d of docs.slice(i, i + 400)) {
        lote.set(db.doc(`obras/${obraId}/cortes/${d.id}`), Object.assign({}, d.datos,
          { ultimoCambio: firebase.firestore.FieldValue.serverTimestamp() }));
      }
      await lote.commit();
    }
    const obraRef = db.doc('obras/' + obraId);
    await db.runTransaction(async tx => {
      const actual = (await tx.get(obraRef)).data().contadorCortes || 0;
      if (maxSec > actual) tx.update(obraRef, { contadorCortes: maxSec });
    });
  }
  window.Nube = { iniciar, usuario, alCambiarSesion, entrar, crearCuenta, reenviarVerificacion,
    recuperarClave, salir, miAcceso, listarObras, crearObra, escucharObra, leerVersion,
    descargarTrozos, subirVersion, traducirError, correoDe, enLinea: () => online,
    escucharCortes, registrarCorte, cambiarEstado,
    listarAccesos, guardarAcceso, importarCortes,
    _db: () => db };
})();
