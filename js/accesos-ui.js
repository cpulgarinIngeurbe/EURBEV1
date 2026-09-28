// Ventana de accesos: alta por correo, cambio de rol y desactivacion.
(function () {
  const ROLES = { admin: 'Administrador', registrador: 'Registrador', consulta: 'Consulta' };
  window.abrirAccesos = async function () {
    const fondo = document.createElement('div');
    fondo.className = 'nube-screen'; fondo.style.background = 'rgba(20,24,40,.35)';
    fondo.innerHTML = '<div class="nube-box" style="width:min(640px,calc(100vw - 32px))"><p>Cargando…</p></div>';
    document.body.appendChild(fondo);
    const caja = fondo.firstChild;
    const pintar = async (msg) => {
      let lista;
      try { lista = await Nube.listarAccesos(); }
      catch (e) { caja.innerHTML = `<p>${esc(Nube.traducirError(e))}</p>`; return; }
      const sel = (v) => Object.entries(ROLES).map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t}</option>`).join('');
      caja.innerHTML = `<h2>Accesos</h2>
        <p class="sub">La persona crea su contraseña al entrar por primera vez con «Crear mi contraseña».</p>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <tr><th align="left">Correo</th><th align="left">Nombre</th><th>Rol</th><th>Activo</th><th></th></tr>
          ${lista.map((a, i) => `<tr data-i="${i}">
            <td>${esc(a.correo)}</td>
            <td><input value="${esc(a.nombre || '')}" data-k="nombre"></td>
            <td><select data-k="rol">${sel(a.rol)}</select></td>
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
        <div class="error" id="acc-error">${esc(msg || '')}</div>
        <div class="fila"><button class="btn btn-secondary" id="acc-cerrar">Cerrar</button></div>`;
      caja.querySelectorAll('[data-guardar]').forEach(b => b.onclick = async () => {
        const i = +b.dataset.guardar, fila = caja.querySelector(`tr[data-i="${i}"]`);
        const v = k => fila.querySelector(`[data-k="${k}"]`);
        try {
          await Nube.guardarAcceso(lista[i].correo, { rol: v('rol').value, nombre: v('nombre').value, activo: v('activo').checked });
          pintar('Guardado.');
        } catch (e) { pintar(Nube.traducirError(e)); }
      });
      caja.querySelector('#acc-alta').onclick = async () => {
        const c = caja.querySelector('#acc-correo').value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { caja.querySelector('#acc-error').textContent = 'Correo no válido.'; return; }
        try {
          await Nube.guardarAcceso(c, { rol: caja.querySelector('#acc-rol').value,
            nombre: caja.querySelector('#acc-nombre').value, activo: true });
          pintar('Acceso creado para ' + c + '.');
        } catch (e) { pintar(Nube.traducirError(e)); }
      };
      caja.querySelector('#acc-cerrar').onclick = () => fondo.remove();
    };
    pintar();
  };
})();
