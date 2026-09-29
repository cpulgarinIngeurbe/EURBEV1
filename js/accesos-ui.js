// Ventana de accesos: alta por correo, rol, entornos y desactivacion.
(function () {
  const ROLES = { admin: 'Administrador', registrador: 'Registrador', consulta: 'Consulta' };
  window.abrirAccesos = async function () {
    const fondo = document.createElement('div');
    fondo.className = 'nube-screen'; fondo.style.background = 'rgba(20,24,40,.35)';
    fondo.innerHTML = '<div class="nube-box" style="width:min(820px,calc(100vw - 32px))"><p>Cargando…</p></div>';
    document.body.appendChild(fondo);
    const caja = fondo.firstChild;
    const pintar = async (msg) => {
      let lista, entornos;
      try { [lista, entornos] = await Promise.all([Nube.listarAccesos(), Nube.listarEntornos(SESION)]); }
      catch (e) { caja.innerHTML = `<p>${esc(Nube.traducirError(e))}</p>`; return; }
      entornos.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
      const sel = (v) => Object.entries(ROLES).map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t}</option>`).join('');
      // El admin ve todo: no lleva casillas de entornos
      const marcas = (actuales, rol) => rol === 'admin' ? '<small>Todos</small>' : (entornos.length
        ? entornos.map(e => `<label style="white-space:nowrap;margin-right:8px"><input type="checkbox" data-ent="${esc(e.id)}"
            ${(actuales || []).includes(e.id) ? ' checked' : ''}> ${esc(e.nombre)}</label>`).join('')
        : '<small>Sin entornos creados</small>');
      caja.innerHTML = `<h2>Accesos</h2>
        <p class="sub">La persona crea su contraseña al entrar por primera vez con «Crear mi contraseña».
          Cada persona solo ve las obras de los entornos marcados; los administradores ven todo.</p>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <tr><th align="left">Correo</th><th align="left">Nombre</th><th>Rol</th><th align="left">Entornos</th><th>Activo</th><th></th></tr>
          ${lista.map((a, i) => `<tr data-i="${i}">
            <td>${esc(a.correo)}</td>
            <td><input value="${esc(a.nombre || '')}" data-k="nombre"></td>
            <td><select data-k="rol">${sel(a.rol)}</select></td>
            <td class="acc-ents">${marcas(a.entornos, a.rol)}</td>
            <td align="center"><input type="checkbox" data-k="activo"${a.activo ? ' checked' : ''}
                ${a.correo === SESION.correo ? ' disabled title="No puedes desactivarte a ti mismo"' : ''}></td>
            <td><button class="btn btn-secondary btn-sm" data-guardar="${i}">Guardar</button></td>
          </tr>`).join('')}
        </table>
        <h3 style="margin-top:18px;font-size:14px">Dar acceso</h3>
        <div style="display:grid;grid-template-columns:2fr 1.5fr 1fr auto;gap:6px">
          <input id="acc-correo" placeholder="correo@ingeurbe.com">
          <input id="acc-nombre" placeholder="Nombre">
          <select id="acc-rol">${sel('consulta')}</select>
          <button class="btn btn-primary btn-sm" id="acc-alta">Añadir</button>
        </div>
        <div id="acc-entornos" style="margin-top:6px;font-size:12px">Entornos: ${marcas([], 'nuevo')}</div>
        <div class="error" id="acc-error">${esc(msg || '')}</div>
        <div class="fila"><button class="btn btn-secondary" id="acc-cerrar">Cerrar</button></div>`;
      const marcados = cont => [...cont.querySelectorAll('input[data-ent]:checked')].map(x => x.dataset.ent);
      caja.querySelectorAll('[data-guardar]').forEach(b => b.onclick = async () => {
        const i = +b.dataset.guardar, fila = caja.querySelector(`tr[data-i="${i}"]`);
        const v = k => fila.querySelector(`[data-k="${k}"]`);
        // Si la fila era de admin no tenia casillas: se conservan sus entornos
        const ents = lista[i].rol === 'admin' ? (lista[i].entornos || []) : marcados(fila);
        try {
          await Nube.guardarAcceso(lista[i].correo, { rol: v('rol').value, nombre: v('nombre').value,
            activo: v('activo').checked, entornos: ents });
          pintar('Guardado.');
        } catch (e) { pintar(Nube.traducirError(e)); }
      });
      caja.querySelector('#acc-alta').onclick = async () => {
        const c = caja.querySelector('#acc-correo').value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { caja.querySelector('#acc-error').textContent = 'Correo no válido.'; return; }
        try {
          await Nube.guardarAcceso(c, { rol: caja.querySelector('#acc-rol').value,
            nombre: caja.querySelector('#acc-nombre').value, activo: true,
            entornos: marcados(caja.querySelector('#acc-entornos')) });
          pintar('Acceso creado para ' + c + '.');
        } catch (e) { pintar(Nube.traducirError(e)); }
      };
      caja.querySelector('#acc-cerrar').onclick = () => fondo.remove();
    };
    pintar();
  };
})();
