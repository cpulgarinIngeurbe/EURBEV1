// Orquesta la version en la nube: entrada -> obra -> modelo -> visor.
// Solo usa globales existentes de index.html (STATE, PARAM_MAP, loadModel,
// showMappingScreen…) y los modulos Nube, CacheModelo, EurbePaquete, EurbeCortes.
(function () {
  const SESION = window.SESION = {
    correo: '', rol: '', nombre: '', obraId: '', obraNombre: '',
    versionId: '', obraVersionCargada: '', soloLectura: false, subiendo: false,
  };
  const $ = id => document.getElementById(id);
  const pantalla = html => { $('nube-box').innerHTML = html; $('nube-screen').style.display = 'flex'; };
  const ocultarPantalla = () => { $('nube-screen').style.display = 'none'; };
  const LOGO = () => {
    const img = document.querySelector('#header img');
    return img ? `<img src="${img.src}" style="height:34px;margin-bottom:14px" alt="Ingeurbe">` : '';
  };

  // ── Entrada ──
  function pantallaEntrada(msg) {
    pantalla(`${LOGO()}
      <h2>E-Urbe · Cortes de obra</h2>
      <p class="sub">Entra con tu correo de Ingeurbe.</p>
      <label>Correo</label><input id="n-correo" type="email" autocomplete="username">
      <label>Contraseña</label><input id="n-clave" type="password" autocomplete="current-password">
      <div class="fila">
        <button class="btn btn-primary" id="n-entrar">Entrar</button>
        <button class="btn btn-secondary" id="n-crear" title="Primer ingreso">Crear mi contraseña</button>
      </div>
      <p style="margin-top:10px"><button class="enlace" id="n-olvido">Olvidé mi contraseña</button></p>
      <div class="error" id="n-error">${esc(msg || '')}</div>
      <p class="nota">Inicio con cuenta Microsoft: próximamente.</p>`);
    const leer = () => [$('n-correo').value.trim(), $('n-clave').value];
    // Se revisa antes de llamar a Firebase: sus mensajes llegan en ingles
    const revisar = (nueva) => {
      const [c, k] = leer();
      if (!c) return 'Escribe tu correo.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) return 'Eso no parece un correo: revisa que tenga @ y no tenga espacios.';
      if (!k) return 'Escribe tu contraseña.';
      if (nueva && k.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
      return '';
    };
    const conRevision = (nueva, accion) => () => {
      const m = revisar(nueva);
      if (m) { $('n-error').textContent = m; return; }
      $('n-error').textContent = '';
      accion(...leer()).catch(fallo);
    };
    const fallo = e => { $('n-error').textContent = Nube.traducirError(e); };
    $('n-entrar').onclick = conRevision(false, Nube.entrar);
    $('n-clave').onkeydown = e => { if (e.key === 'Enter') $('n-entrar').click(); };
    $('n-crear').onclick = conRevision(true, Nube.crearCuenta);
    $('n-olvido').onclick = () => {
      const c = $('n-correo').value;
      if (!c) { $('n-error').textContent = 'Escribe primero tu correo.'; return; }
      Nube.recuperarClave(c).then(() => { $('n-error').textContent = 'Te enviamos un correo para cambiar la contraseña.'; }).catch(fallo);
    };
  }

  function pantallaVerificar(correo) {
    pantalla(`${LOGO()}<h2>Confirma tu correo</h2>
      <p class="sub">Te enviamos un enlace a <b>${esc(correo)}</b>. Ábrelo y luego pulsa «Ya lo confirmé».</p>
      <div class="fila">
        <button class="btn btn-primary" id="n-ya">Ya lo confirmé</button>
        <button class="btn btn-secondary" id="n-reenviar">Reenviar</button>
      </div>
      <p style="margin-top:10px"><button class="enlace" id="n-salir">Salir</button></p>
      <div class="error" id="n-error"></div>`);
    $('n-ya').onclick = async () => {
      await Nube.usuario().reload();
      await Nube.usuario().getIdToken(true);   // el token debe llevar email_verified
      trasSesion(Nube.usuario());
    };
    $('n-reenviar').onclick = () => Nube.reenviarVerificacion()
      .then(() => { $('n-error').textContent = 'Reenviado.'; })
      .catch(e => { $('n-error').textContent = Nube.traducirError(e); });
    $('n-salir').onclick = () => Nube.salir();
  }

  function pantallaSinAcceso(correo) {
    pantalla(`${LOGO()}<h2>Sin acceso</h2>
      <p class="sub">No tienes acceso a E-Urbe, pídelo al administrador.<br><small>${esc(correo)}</small></p>
      <button class="btn btn-secondary" id="n-salir">Salir</button>`);
    $('n-salir').onclick = () => Nube.salir();
  }

  const esDeRed = e => /unavailable|network|offline|deadline/i.test(((e && e.code) || '') + ' ' + ((e && e.message) || ''));
  function falloDeCarga(e, alternativa) {
    if (esDeRed(e) && window.modoSinConexion) return window.modoSinConexion(Nube.traducirError(e));
    alternativa(Nube.traducirError(e));
  }

  async function trasSesion(user) {
    if (!user) { pantallaEntrada(); return; }
    SESION.correo = Nube.correoDe(user);
    if (!user.emailVerified) { pantallaVerificar(SESION.correo); return; }
    let acc;
    try { acc = await Nube.miAcceso(); }
    catch (e) { falloDeCarga(e, pantallaEntrada); return; }
    if (!acc || !acc.activo) { pantallaSinAcceso(SESION.correo); return; }
    SESION.rol = acc.rol; SESION.nombre = acc.nombre || SESION.correo;
    SESION.entornos = Array.isArray(acc.entornos) ? acc.entornos : [];
    if (SESION.rol === 'admin') {
      // Primera vez tras la actualizacion de entornos: todo pasa a «General»
      try { await Nube.migrarEntornos(); } catch (e) { console.warn('migración de entornos', e); }
    }
    elegirObra();
  }

  // ── Obra ──
  async function elegirObra() {
    let obras, entornos;
    try { [obras, entornos] = await Promise.all([Nube.listarObras(SESION), Nube.listarEntornos(SESION)]); }
    catch (e) { falloDeCarga(e, pantallaEntrada); return; }
    const esAdmin = SESION.rol === 'admin';
    if (!esAdmin && !SESION.entornos.length) {
      pantalla(`${LOGO()}<h2>Sin entornos</h2>
        <p class="sub">Aún no tienes entornos asignados, pídelo al administrador.<br><small>${esc(SESION.correo)}</small></p>
        <button class="btn btn-secondary" id="n-salir">Salir</button>`);
      $('n-salir').onclick = () => Nube.salir();
      return;
    }
    const grupos = EurbeEntornos.agruparObras(obras, entornos, esAdmin);
    const ultima = (() => { try { return localStorage.getItem('eurbe_ultima_obra'); } catch (e) { return null; } })();
    // La ultima obra abierta se reabre directo («Cambiar de obra» borra esa
    // preferencia). Con una sola obra tambien se salta, salvo el admin, que
    // necesita esta pantalla para crear obras.
    const pre = obras.find(o => o.id === ultima);
    if (pre) return abrirObra(pre);
    if (obras.length === 1 && SESION.rol !== 'admin') return abrirObra(obras[0]);
    const conObras = grupos.filter(g => g.obras.length);
    pantalla(`${LOGO()}<h2>Elige la obra</h2>
      <p class="sub">${esc(SESION.nombre)} · ${esc(SESION.rol)}</p>
      <div id="n-obras">${conObras.length ? conObras.map(g => `
        <div class="ent-titulo">${esc(g.entorno.nombre)}</div>
        ${g.obras.map(o => `<button class="btn btn-secondary obra-item" data-id="${esc(o.id)}">
          ${o.id === ultima ? '★ ' : ''}${esc(o.nombre)}${o.modeloVigente ? '' : ' <small>(sin modelo)</small>'}
        </button>`).join('')}`).join('') : '<p class="sub">Aún no hay obras.</p>'}</div>
      ${esAdmin ? `<label>Nueva obra</label><input id="n-nueva" placeholder="Ej: PZA Torres">
        <label>Entornos de la obra</label>
        <div id="n-nueva-ent" class="ent-marcas">${entornos.length ? entornos.map(e => `
          <label><input type="checkbox" data-ent="${esc(e.id)}"${entornos.length === 1 ? ' checked' : ''}> ${esc(e.nombre)}</label>`).join('')
          : '<small>Crea entornos en Obra ▾ → Gestionar entornos.</small>'}</div>
        <div class="fila"><button class="btn btn-primary" id="n-crear-obra">Crear obra</button></div>` : ''}
      <p style="margin-top:12px"><button class="enlace" id="n-salir">Salir</button></p>
      <div class="error" id="n-error"></div>`);
    document.querySelectorAll('#n-obras [data-id]').forEach(b => {
      b.onclick = () => abrirObra(obras.find(o => o.id === b.dataset.id));
    });
    $('n-salir').onclick = () => Nube.salir();
    if ($('n-crear-obra')) $('n-crear-obra').onclick = async () => {
      const n = $('n-nueva').value.trim();
      if (!n) return;
      const ents = [...document.querySelectorAll('#n-nueva-ent input[data-ent]:checked')].map(x => x.dataset.ent);
      try { await Nube.crearObra(n, ents); elegirObra(); }
      catch (e) { $('n-error').textContent = Nube.traducirError(e); }
    };
  }

  function progreso(texto, frac) {
    pantalla(`${LOGO()}<h2>${esc(SESION.obraNombre)}</h2><p class="sub">${esc(texto)}</p>
      <div style="height:6px;background:#eef;border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${Math.round((frac || 0) * 100)}%;background:#3A7FC1"></div></div>`);
  }

  async function abrirObra(obra) {
    SESION.obraId = obra.id; SESION.obraNombre = obra.nombre;
    if (!obra.modeloVigente) {
      if (SESION.rol === 'admin') { recordarObra(obra.id); iniciarSubida(); return; }
      olvidarObra();
      pantallaObraNoAbre(obra, 'Esta obra aún no tiene modelo. El administrador debe cargarlo.');
      return;
    }
    try {
      const meta = await Nube.leerVersion(obra.id, obra.modeloVigente);
      const data = await obtenerModelo(obra.id, meta);
      Object.assign(PARAM_MAP, meta.paramMap || {});
      SESION.versionId = meta.id; SESION.obraVersionCargada = meta.id;
      try { localStorage.setItem('eurbe_ultima_version', JSON.stringify(
        { obraId: obra.id, obraNombre: obra.nombre, versionId: meta.id, huella: meta.huella, paramMap: meta.paramMap })); } catch (e) {}
      recordarObra(obra.id);
      ocultarPantalla();
      data.meta = Object.assign({}, data.meta, { sourceFile: obra.nombre + ' · ' + (meta.archivoOriginal || '') });
      loadModel(data);
      vigilarVersion(obra.id);
    } catch (e) {
      olvidarObra();
      if (esDeRed(e) && window.modoSinConexion) return window.modoSinConexion(Nube.traducirError(e));
      pantallaObraNoAbre(obra, Nube.traducirError(e));
    }
  }

  function recordarObra(id) { try { localStorage.setItem('eurbe_ultima_obra', id); } catch (e) {} }
  function olvidarObra() { try { localStorage.removeItem('eurbe_ultima_obra'); } catch (e) {} }
  // Volver no puede reabrir la misma obra (se olvido la preferencia); el admin
  // puede ademas subir una version nueva si la vigente no abre.
  function pantallaObraNoAbre(obra, msg) {
    pantalla(`${LOGO()}<h2>${esc(obra.nombre)}</h2><p class="sub">${esc(msg)}</p>
      <div class="fila">
        <button class="btn btn-secondary" id="n-volver">Volver</button>
        ${SESION.rol === 'admin' ? '<button class="btn btn-primary" id="n-subir">Subir versión</button>' : ''}
      </div>
      <p style="margin-top:12px"><button class="enlace" id="n-salir">Salir</button></p>`);
    $('n-volver').onclick = elegirObra;
    $('n-salir').onclick = () => Nube.salir();
    if ($('n-subir')) $('n-subir').onclick = () => { recordarObra(obra.id); iniciarSubida(); };
  }

  // Copia local si coincide la huella; si no, descarga (un reintento si la huella falla)
  async function obtenerModelo(obraId, meta) {
    const local = await CacheModelo.leer(obraId, meta.id, meta.huella);
    if (local) {
      progreso('Abriendo copia guardada…', 1);
      try { return await EurbePaquete.desempaquetar([local], meta.huella); }
      catch (e) { await CacheModelo.borrar(obraId); }   // dañada: se descarga de nuevo
    }
    for (let intento = 1; ; intento++) {
      const trozos = await Nube.descargarTrozos(obraId, meta, f => progreso('Descargando modelo…', f));
      try {
        const data = await EurbePaquete.desempaquetar(trozos, meta.huella);
        await CacheModelo.guardar(obraId, meta.id, meta.huella, EurbePaquete.unir(trozos));
        return data;
      } catch (e) {
        if (e.code !== 'huella' || intento >= 2) throw e;
      }
    }
  }

  // Aviso de version nueva mientras la app esta abierta (no se cambia sola)
  let dejarDeVigilar = null;
  function vigilarVersion(obraId) {
    if (dejarDeVigilar) dejarDeVigilar();
    dejarDeVigilar = Nube.escucharObra(obraId, obra => {
      if (!obra.modeloVigente || obra.modeloVigente === SESION.obraVersionCargada || SESION.subiendo) return;
      if (document.querySelector('.aviso-nube')) return;
      const d = document.createElement('div');
      d.className = 'aviso-nube';
      d.innerHTML = 'Hay una versión nueva del modelo <button class="btn btn-primary btn-sm">Recargar</button>';
      d.querySelector('button').onclick = () => location.reload();
      document.body.appendChild(d);
    });
  }

  // ── Subir version (admin) ──
  function iniciarSubida() {
    SESION.subiendo = true;
    ocultarPantalla();
    $('app').style.display = 'none';
    $('load-screen').style.display = 'flex';
    // El mapeo anterior queda precargado porque PARAM_MAP ya lo contiene
  }

  // Gancho llamado por index.html al terminar la lectura/mapeo de un archivo
  window.entregarModelo = async function (data) {
    if (!SESION.subiendo || SESION.rol !== 'admin') { loadModel(data); return; }
    const ids = new Set(data.elements.map(e => e.globalId));
    const faltan = EurbeCortes.elementosFaltantes(EurbeCortes.separar(STATE.cuts).activos, ids);
    if (faltan.length && !confirm('En esta versión faltan elementos de cortes existentes:\n\n' +
        faltan.map(f => `· ${f.number}: ${f.faltan} elemento(s)`).join('\n') +
        '\n\nEsos elementos seguirán en los cortes pero no se verán en el 3D ni sumarán cantidades. ¿Publicar igual?')) {
      location.reload(); return;
    }
    try {
      $('load-screen').style.display = 'none';
      progreso('Comprimiendo modelo…', 0);
      const paquete = await EurbePaquete.empaquetar(data);
      const versionId = await Nube.subirVersion(SESION.obraId, paquete,
        { archivoOriginal: (data.meta && data.meta.sourceFile) || '', nElementos: data.elements.length,
          paramMap: Object.assign({}, PARAM_MAP) },
        f => progreso(`Subiendo modelo (${(paquete.bytes / 1048576).toFixed(2)} MB)…`, f));
      await CacheModelo.guardar(SESION.obraId, versionId, paquete.huella, EurbePaquete.unir(paquete.trozos));
      location.reload();   // reabre limpio con la version vigente desde la cache
    } catch (e) {
      alert('No se pudo publicar el modelo.\n\n' + Nube.traducirError(e));
      location.reload();
    }
  };

  // Gancho llamado por loadModel al terminar de construir la escena
  window.alModeloCargado = function () {
    pintarCabecera();
    if (window.alModeloCargadoCortes) window.alModeloCargadoCortes();
  };

  // ── Cabecera: usuario y menu Obra ──
  function pintarCabecera() {
    const cab = $('nube-cabecera');
    cab.innerHTML = `<span>${esc(SESION.nombre)} <span class="rol">· ${esc(SESION.rol)}</span></span>
      <button class="btn btn-secondary btn-sm" id="n-menu">Obra ▾</button>`;
    $('n-menu').onclick = ev => { ev.stopPropagation(); abrirMenu(); };
  }
  function abrirMenu() {
    cerrarMenu();
    const m = document.createElement('div');
    m.className = 'nube-menu'; m.id = 'n-menu-lista';
    const op = (txt, fn, soloAdmin) => (soloAdmin && SESION.rol !== 'admin') ? '' :
      `<button data-op="${fn}">${txt}</button>`;
    m.innerHTML = op('⇄ Cambiar de obra', 'cambiar') +
      op('⬆ Subir nueva versión del modelo', 'subir', true) +
      op('🗂 Gestionar entornos', 'entornos', true) +
      op('👥 Gestionar accesos', 'accesos', true) +
      op('📥 Importar cortes', 'importar', true) +
      op('⎋ Salir', 'salir');
    m.onclick = ev => {
      const o = ev.target.dataset.op; if (!o) return;
      cerrarMenu();
      if (o === 'cambiar') { try { localStorage.removeItem('eurbe_ultima_obra'); } catch (e) {} location.reload(); }
      if (o === 'subir') iniciarSubida();
      if (o === 'accesos' && window.abrirAccesos) window.abrirAccesos();
      if (o === 'entornos' && window.abrirEntornos) window.abrirEntornos();
      if (o === 'importar' && window.abrirImportacion) window.abrirImportacion();
      if (o === 'salir') Nube.salir().then(() => location.reload());
    };
    document.body.appendChild(m);
    setTimeout(() => document.addEventListener('click', cerrarMenu, { once: true }), 0);
  }
  function cerrarMenu() { const m = $('n-menu-lista'); if (m) m.remove(); }

  // ── Arranque ──
  function arrancar() {
    try { Nube.iniciar(window.EURBE_FIREBASE_CONFIG); }
    catch (e) {
      if (window.modoSinConexion) return window.modoSinConexion(Nube.traducirError(e));
      pantalla(`${LOGO()}<h2>E-Urbe</h2><p class="sub">${esc(Nube.traducirError(e))}</p>`);
      return;
    }
    let conSesion = false;
    Nube.alCambiarSesion(u => {
      // Salir con la app abierta recarga limpio (la escena 3D se crea una vez)
      if (!u && conSesion) { location.reload(); return; }
      conSesion = !!u;
      trasSesion(u);
    });
  }
  window.UINube = { SESION, elegirObra, abrirObra, iniciarSubida, pantalla, progreso, LOGO };
  arrancar();
})();
