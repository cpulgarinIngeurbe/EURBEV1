import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { limpiar, usuario, prepararObra, abrir } from './sembrar.mjs';

test('admin descarga el modelo vigente como JSON y lo puede volver a subir; registrador no ve la opción', async ({ browser }) => {
  test.setTimeout(240000);
  await limpiar(); await usuario('admin@ingeurbe.com', 'admin'); await usuario('reg@ingeurbe.com', 'registrador');
  const a = await prepararObra(browser, 'Obra Descarga');

  await a.click('#n-menu');
  const [dl] = await Promise.all([a.waitForEvent('download', { timeout: 60000 }), a.getByText('Descargar modelo (JSON)').click()]);
  expect(dl.suggestedFilename()).toMatch(/^Obra Descarga.*\.json$/);
  const ruta = await dl.path();
  const data = JSON.parse(readFileSync(ruta, 'utf8'));
  expect(data.elements.length).toBe(1320);
  expect(data.elements[0].vertices.length).toBeGreaterThan(0);

  // Se vuelve a subir como versión nueva y abre igual
  await a.click('#n-menu'); await a.getByText('Subir nueva versión del modelo').click();
  await a.setInputFiles('#file-input', ruta);
  await a.click('#btn-confirm-mapping', { timeout: 20000 });
  await expect.poll(() => a.evaluate(() => typeof STATE !== 'undefined' && STATE.elements.length), { timeout: 90000 }).toBe(1320);
  expect(await a.evaluate(() => STATE.elements.filter(e => e.nivel).length)).toBeGreaterThan(0);

  const r = await abrir(browser, 'reg@ingeurbe.com');
  await r.click('#n-menu');
  await expect(r.getByText('Descargar modelo (JSON)')).toHaveCount(0);
});
