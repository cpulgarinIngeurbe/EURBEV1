// Decide a qué Firebase se conecta la app. En localhost, por defecto, a los
// emuladores (las pruebas automáticas nunca tocan datos reales). Con
// ?nube=real se usa el Firebase real, para probar la rama desarrollo en el PC
// (scripts/probar_rama_desarrollo.bat); se recuerda en la pestaña hasta
// ?nube=emuladores. Fuera de localhost siempre es la nube real.
(function (raiz) {
  const CLAVE = 'eurbe-nube';

  // recordar: 'real' = guardarlo, null = borrarlo, undefined = no tocarlo
  function elegirNube({ hostname, search, recordado }) {
    const local = ['localhost', '127.0.0.1'].includes(hostname);
    if (!local) return { modo: 'real', local: false, recordar: undefined };
    const pedido = new URLSearchParams(search || '').get('nube');
    if (pedido === 'real') return { modo: 'real', local: true, recordar: 'real' };
    if (pedido === 'emuladores') return { modo: 'emuladores', local: true, recordar: null };
    return { modo: recordado === 'real' ? 'real' : 'emuladores', local: true, recordar: undefined };
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { elegirNube }; return; }

  // sessionStorage puede lanzar (privado, bloqueado): entonces no se recuerda nada
  let recordado = null;
  try { recordado = sessionStorage.getItem(CLAVE); } catch (e) {}
  const r = elegirNube({ hostname: location.hostname, search: location.search, recordado });
  try {
    if (r.recordar === 'real') sessionStorage.setItem(CLAVE, 'real');
    else if (r.recordar === null) sessionStorage.removeItem(CLAVE);
  } catch (e) {}

  raiz.EurbeEntornoNube = { elegirNube };
  raiz.EURBE_NUBE = { modo: r.modo, local: r.local };

  // Franja fija para no confundir esta pestaña con la de producción
  if (r.local && r.modo === 'real') {
    const pintar = () => {
      const f = document.createElement('div');
      f.id = 'franja-desarrollo';
      f.textContent = 'DESARROLLO · Firebase real';
      f.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:99999;'
        + 'background:#C0392B;color:#fff;font:600 11px/1 sans-serif;letter-spacing:.08em;'
        + 'padding:4px 12px;border-radius:0 0 6px 6px;pointer-events:none;';
      document.body.appendChild(f);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pintar);
    else pintar();
  }
})(typeof window !== 'undefined' ? window : globalThis);
