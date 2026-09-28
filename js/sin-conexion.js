// Sin SDK (red bloqueada) o sin conexion: abre la ultima copia del modelo en
// solo lectura. Nunca permite registrar: al ser datos de pago podrian chocar.
(function () {
  window.pintarAvisoConexion = function () {
    let a = document.getElementById('aviso-conexion');
    if (!SESION.soloLectura) { if (a) a.remove(); return; }
    if (a) return;
    a = document.createElement('div');
    a.id = 'aviso-conexion'; a.className = 'aviso-nube';
    a.textContent = 'Sin conexión — no se pueden registrar cortes';
    document.body.appendChild(a);
  };

  window.modoSinConexion = async function (mensaje) {
    const U = window.UINube;
    let ult = null;
    try { ult = JSON.parse(localStorage.getItem('eurbe_ultima_version') || 'null'); } catch (e) {}
    const copia = ult && await CacheModelo.leerCualquiera(ult.obraId);
    if (!copia) {
      U.pantalla(`${U.LOGO()}<h2>E-Urbe</h2><p class="sub">${esc(mensaje)}</p>
        <p class="sub">Este equipo no tiene una copia guardada del modelo.</p>`);
      return;
    }
    U.pantalla(`${U.LOGO()}<h2>${esc(ult.obraNombre)}</h2><p class="sub">${esc(mensaje)}</p>
      <button class="btn btn-primary" id="n-ro">Abrir la última copia (solo lectura)</button>`);
    document.getElementById('n-ro').onclick = async () => {
      const data = await EurbePaquete.desempaquetar([copia.comprimido], copia.huella);
      Object.assign(PARAM_MAP, ult.paramMap || {});
      Object.assign(SESION, { obraId: ult.obraId, obraNombre: ult.obraNombre, rol: 'consulta',
        nombre: 'Sin conexión', soloLectura: true, versionId: copia.versionId });
      window.alModeloCargadoCortes = () => {};   // sin SDK no hay cortes que escuchar
      document.getElementById('nube-screen').style.display = 'none';
      data.meta = Object.assign({}, data.meta, { sourceFile: ult.obraNombre + ' · copia local' });
      loadModel(data);
      window.pintarAvisoConexion();
      notify('Sin conexión: se muestra el modelo, los cortes no están disponibles.');
    };
  };
})();
