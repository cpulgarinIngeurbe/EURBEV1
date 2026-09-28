// Importa el archivo de «Exportar cortes (JSON)» de la version local.
(function () {
  window.abrirImportacion = function () {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      let datos;
      try { datos = JSON.parse(await f.text()); } catch (e) { alert('El archivo no es un JSON válido.'); return; }
      if (!datos || datos.formato !== 'eurbe-cortes' || !Array.isArray(datos.cortes)) {
        alert('Este archivo no es una exportación de cortes de E-Urbe.'); return;
      }
      const existentes = new Set(STATE.cuts.concat(STATE.cutsAnulados || []).map(c => c.numeroSec));
      const ids = new Set(STATE.elements.map(e => e.globalId));
      const r = EurbeCortes.prepararImportacion(datos.cortes, existentes, ids, SESION.correo, new Date().toISOString());
      const lineas = [`Obra: ${SESION.obraNombre}`, `Se importarán ${r.docs.length} corte(s).`];
      if (r.omitidos.length) lineas.push('', 'No se importan:', ...r.omitidos.map(o => `· ${o.number}: ${o.motivo}`));
      if (r.faltantes.length) lineas.push('', 'Elementos que no existen en el modelo vigente:',
        ...r.faltantes.map(x => `· ${x.number}: ${x.faltan} elemento(s)`));
      if (!r.docs.length) { alert(lineas.join('\n')); return; }
      if (!confirm(lineas.join('\n') + '\n\n¿Importar?')) return;
      try { await Nube.importarCortes(SESION.obraId, r.docs, r.maxSec); notify(`✔ ${r.docs.length} cortes importados`); }
      catch (e) { alert('No se completó la importación.\n\n' + Nube.traducirError(e)); }
    };
    inp.click();
  };
})();
