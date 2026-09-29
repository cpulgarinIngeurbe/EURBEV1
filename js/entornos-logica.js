// Entornos de trabajo: agrupan obras. Sin DOM ni Firebase.
(function (raiz) {
  const GENERAL = { id: 'general', nombre: 'General' };
  const porNombre = (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es');

  // Grupos {entorno, obras} para la pantalla «Elige la obra». Una obra en dos
  // entornos sale en los dos. El admin ve tambien entornos vacios y las obras
  // sin entorno (que solo el ve).
  function agruparObras(obras, entornos, esAdmin) {
    const grupos = [...entornos].sort(porNombre).map(e => ({
      entorno: { id: e.id, nombre: e.nombre },
      obras: obras.filter(o => (o.entornos || []).includes(e.id)).sort(porNombre),
    })).filter(g => esAdmin || g.obras.length);
    if (esAdmin) {
      const ids = new Set(entornos.map(e => e.id));
      const sueltas = obras.filter(o => !(o.entornos || []).some(id => ids.has(id))).sort(porNombre);
      if (sueltas.length) grupos.push({ entorno: { id: null, nombre: 'Sin entorno' }, obras: sueltas });
    }
    return grupos;
  }

  // Primera vez tras la actualizacion (no hay ningun entorno): todo lo que
  // existia pasa a «General» para que nadie pierda acceso.
  function planMigracion({ entornos, obras, accesos }) {
    if (entornos.length) return { crearGeneral: false, obras: [], accesos: [] };
    return {
      crearGeneral: true,
      obras: obras.filter(o => !Array.isArray(o.entornos)).map(o => o.id),
      accesos: accesos.filter(a => a.rol !== 'admin' && !Array.isArray(a.entornos)).map(a => a.correo),
    };
  }

  const api = { GENERAL, agruparObras, planMigracion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.EurbeEntornos = api;
})(typeof window !== 'undefined' ? window : globalThis);
