// Ventana de entornos (solo admin): crear, renombrar y marcar sus obras.
// Una obra puede estar en varios entornos: marcarla aqui no la quita de otros.
(function () {
  window.abrirEntornos = async function () {
    const fondo = document.createElement('div');
    fondo.className = 'nube-screen'; fondo.style.background = 'rgba(20,24,40,.35)';
    fondo.innerHTML = '<div class="nube-box" style="width:min(640px,calc(100vw - 32px))"><p>Cargando…</p></div>';
    document.body.appendChild(fondo);
    const caja = fondo.firstChild;
    const porNombre = (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es');

    const pintar = async (msg, abierto) => {
      let entornos, obras, accesos;
      try {
        [entornos, obras, accesos] = await Promise.all([Nube.listarEntornos(SESION), Nube.listarObras(SESION), Nube.listarAccesos()]);
      } catch (e) { caja.innerHTML = `<p>${esc(Nube.traducirError(e))}</p>`; return; }
      entornos.sort(porNombre); obras.sort(porNombre);
      const cuenta = (lista, id) => lista.filter(x => (x.entornos || []).includes(id)).length;
      const ent = entornos.find(e => e.id === abierto);
      caja.innerHTML = `<h2>Entornos</h2>
        <p class="sub">Cada persona ve solo las obras de sus entornos (se asignan en «Gestionar accesos»).</p>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <tr><th align="left">Nombre</th><th>Obras</th><th>Personas</th><th></th></tr>
          ${entornos.map(e => `<tr>
            <td><input value="${esc(e.nombre)}" data-nombre="${esc(e.id)}" maxlength="100"></td>
            <td align="center">${cuenta(obras, e.id)}</td>
            <td align="center">${accesos.filter(a => a.rol !== 'admin' && (a.entornos || []).includes(e.id)).length}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-secondary btn-sm" data-renombrar="${esc(e.id)}">Guardar nombre</button>
              <button class="btn btn-primary btn-sm" data-abrir="${esc(e.id)}">Obras…</button></td>
          </tr>`).join('')}
        </table>
        <h3 style="margin-top:16px;font-size:14px">Nuevo entorno</h3>
        <div style="display:grid;grid-template-columns:1fr auto;gap:6px">
          <input id="ent-nombre" placeholder="Ej: PZA, Calle 80…" maxlength="100">
          <button class="btn btn-primary btn-sm" id="ent-crear">Crear</button>
        </div>
        ${ent ? `<h3 style="margin-top:16px;font-size:14px">Obras del entorno «${esc(ent.nombre)}»</h3>
          <div id="ent-obras" class="ent-marcas">${obras.length ? obras.map(o => `
            <label><input type="checkbox" data-obra="${esc(o.id)}"${(o.entornos || []).includes(ent.id) ? ' checked' : ''}>
              ${esc(o.nombre)}</label>`).join('') : '<small>Aún no hay obras.</small>'}</div>
          <div class="fila"><button class="btn btn-primary" id="ent-guardar-obras">Guardar obras</button></div>` : ''}
        <div class="error" id="ent-error">${esc(msg || '')}</div>
        <div class="fila"><button class="btn btn-secondary" id="ent-cerrar">Cerrar</button></div>`;

      const $c = s => caja.querySelector(s);
      const fallo = e => { $c('#ent-error').textContent = Nube.traducirError(e); };
      $c('#ent-crear').onclick = async () => {
        const n = $c('#ent-nombre').value.trim();
        if (!n) { $c('#ent-error').textContent = 'Escribe el nombre del entorno.'; return; }
        if (entornos.some(e => e.nombre.toLowerCase() === n.toLowerCase())) { $c('#ent-error').textContent = 'Ya existe un entorno con ese nombre.'; return; }
        try { const id = await Nube.crearEntorno(n); pintar('Entorno creado. Marca ahora sus obras.', id); } catch (e) { fallo(e); }
      };
      caja.querySelectorAll('[data-renombrar]').forEach(b => b.onclick = async () => {
        const id = b.dataset.renombrar, n = caja.querySelector(`[data-nombre="${CSS.escape(id)}"]`).value.trim();
        if (!n) { $c('#ent-error').textContent = 'El nombre no puede quedar vacío.'; return; }
        try { await Nube.renombrarEntorno(id, n); pintar('Nombre guardado.', abierto); } catch (e) { fallo(e); }
      });
      caja.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => pintar('', b.dataset.abrir));
      if (ent) $c('#ent-guardar-obras').onclick = async () => {
        const marcadas = new Set([...caja.querySelectorAll('#ent-obras input[data-obra]:checked')].map(x => x.dataset.obra));
        try { await Nube.fijarObrasDeEntorno(ent.id, marcadas, obras); pintar('Obras guardadas.', ent.id); } catch (e) { fallo(e); }
      };
      $c('#ent-cerrar').onclick = () => fondo.remove();
    };
    pintar();
  };
})();
