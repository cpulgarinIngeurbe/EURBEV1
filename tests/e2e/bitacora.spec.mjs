import { test, expect } from '@playwright/test';
import { limpiar, usuario, prepararObra, registrar } from './sembrar.mjs';
// Funciones de Bitácora BIM V9 funcionando sobre la versión en la nube

test('V9 en la nube: módulo de contratos, color por material, contrato en el corte, fechas y Excel', async ({ browser }) => {
  test.setTimeout(240000);
  await limpiar(); await usuario('admin@ingeurbe.com', 'admin');
  const a = await prepararObra(browser, 'Obra V9');
  const errores = [];
  a.on('pageerror', e => errores.push(e.message));

  // Módulo de contratos: el visor se muda y vuelve
  await a.evaluate(() => setModulo('contratos'));
  await expect(a.locator('#mod-contratos')).toBeVisible();
  expect(await a.evaluate(() => document.getElementById('viewer-wrap').parentElement.id)).toBe('ct-visor');
  await a.evaluate(() => setModulo('cortes'));
  await expect(a.locator('#mod-cortes')).toBeVisible();
  expect(await a.evaluate(() => document.getElementById('viewer-wrap').parentElement.id)).toBe('main');

  // Color por material y de vuelta a estados
  await a.evaluate(() => { setColorMode('material'); setColorMode('state'); });

  // Registrar: el corte guarda el contrato en Firestore
  const conFecha = async (desde, fecha, n) => {
    await a.evaluate(([d, f]) => { STATE.selected.clear(); STATE.elements.slice(d, d + 3).forEach(e => STATE.selected.add(e.globalId));
      updateCutForm(); document.getElementById('cut-date-input').value = f; }, [desde, fecha]);
    await a.evaluate(() => registerCut());
    await a.waitForFunction(k => STATE.cuts.length === k, n, { timeout: 20000 });
  };
  await conFecha(0, '2026-09-01', 1);
  expect(await a.evaluate(() => typeof STATE.cuts[0].contrato)).toBe('string');
  await conFecha(10, '2026-10-01', 2);

  // Seguimiento por fechas: aparece con dos fechas distintas
  await expect(a.locator('#seg-fechas')).toBeVisible();

  // Excel con la columna Contrato además de Registrado por
  const cab = await a.evaluate(async () => {
    let wb; const o = XLSX.writeFile; XLSX.writeFile = w => { wb = w; };
    await exportExcel(); XLSX.writeFile = o;
    return XLSX.utils.sheet_to_json(wb.Sheets['Historial Cortes'], { header: 1 })[0];
  });
  expect(cab).toEqual(expect.arrayContaining(['Contrato', 'Registrado por', 'Historial de estados']));

  expect(errores).toEqual([]);
});
