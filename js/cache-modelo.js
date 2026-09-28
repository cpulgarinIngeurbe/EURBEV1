// Copia local del modelo comprimido en IndexedDB, para no descargarlo en cada
// apertura. Clave: obraId. Si algo falla (modo privado, cuota), se comporta
// como si no hubiera copia: la app descarga de nuevo.
(function () {
  const BD = 'eurbe', ALMACEN = 'modelos';

  function abrir() {
    return new Promise((ok, mal) => {
      const r = indexedDB.open(BD, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
  }
  function op(modo, fn) {
    return abrir().then(db => new Promise((ok, mal) => {
      const tx = db.transaction(ALMACEN, modo);
      const req = fn(tx.objectStore(ALMACEN));
      tx.oncomplete = () => { db.close(); ok(req && req.result); };
      tx.onerror = () => { db.close(); mal(tx.error); };
    }));
  }

  async function leer(obraId, versionId, huella) {
    try {
      const v = await op('readonly', s => s.get(obraId));
      return (v && v.versionId === versionId && v.huella === huella) ? v.comprimido : null;
    } catch (e) { return null; }
  }
  async function guardar(obraId, versionId, huella, comprimido) {
    // Un solo registro por obra: guardar la version vigente ya poda la anterior
    try { await op('readwrite', s => s.put({ versionId, huella, comprimido, fecha: Date.now() }, obraId)); }
    catch (e) { console.warn('No se pudo guardar la copia local del modelo', e); }
  }
  async function leerCualquiera(obraId) {
    try { return (await op('readonly', s => s.get(obraId))) || null; } catch (e) { return null; }
  }
  async function borrar(obraId) {
    try { await op('readwrite', s => s.delete(obraId)); } catch (e) {}
  }
  // Con un registro por obra no hay nada extra que borrar; se deja por contrato.
  async function podar() {}

  window.CacheModelo = { leer, guardar, leerCualquiera, borrar, podar };
})();
