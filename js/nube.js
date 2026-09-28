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
    // Cache local de lecturas: permite ver cortes sin conexion (solo lectura).
    // Las escrituras de cortes van por transaccion, que nunca se encola offline.
    // Sin synchronizeTabs: con varias pestanas, las escrituras de una secundaria
    // quedaban esperando a la principal (la subida del modelo se colgaba). Asi
    // solo la primera pestana usa cache persistente; las demas van en memoria.
    db.enablePersistence().catch(() => {});
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

  window.Nube = { iniciar, usuario, alCambiarSesion, entrar, crearCuenta, reenviarVerificacion,
    recuperarClave, salir, miAcceso, listarObras, crearObra, escucharObra, leerVersion,
    descargarTrozos, subirVersion, traducirError, correoDe, enLinea: () => online,
    _db: () => db };
})();
