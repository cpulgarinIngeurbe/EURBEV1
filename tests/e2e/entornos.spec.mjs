import { test, expect } from '@playwright/test';
import { limpiar, usuario, soloCuenta, prepararObra, entrar } from './sembrar.mjs';
// Entornos: cada persona solo ve las obras de sus entornos (docs/diseno-entornos.md)
const ok = (c, m) => expect(c, m).toBeTruthy();
const esp = (p, fn, ms = 20000) => p.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
const caja = p => p.locator('#nube-box').innerText();

test('entornos: migración, asignación y visibilidad por persona', async ({ browser: b }) => {
  test.setTimeout(240000);
  await limpiar(); await usuario('admin@ingeurbe.com', 'admin');
  await soloCuenta('r1@ingeurbe.com'); await soloCuenta('r2@ingeurbe.com'); await soloCuenta('r3@ingeurbe.com');
  // Admin: la migración crea «General» y la obra nueva queda en General
  const a = await prepararObra(b, 'Torre A');
  ok(await a.evaluate(async () => (await Nube.listarEntornos(SESION)).map(e => e.nombre).join() === 'General'), 'migración crea el entorno General');
  ok(await a.evaluate(async () => JSON.stringify((await Nube.listarObras(SESION))[0].entornos) === '["general"]'), 'obra creada con el único entorno preseleccionado');
  // Admin crea entorno «Calle 80» desde Gestionar entornos
  await a.click('#n-menu'); await a.getByText('Gestionar entornos').click();
  await a.fill('#ent-nombre', 'Calle 80'); await a.click('#ent-crear');
  await a.getByText('Entorno creado').waitFor({ timeout: 10000 });
  const idC80 = await a.evaluate(async () => (await Nube.listarEntornos(SESION)).find(e => e.nombre === 'Calle 80').id);
  await a.click('#ent-cerrar');
  await a.evaluate(id => Nube.crearObra('Torre B', [id]), idC80);
  // Accesos: r1 → General, r2 → Calle 80, r3 → ninguno
  await a.click('#n-menu'); await a.getByText('Gestionar accesos').click();
  const alta = async (correo, entId) => {
    await a.fill('#acc-correo', correo); await a.selectOption('#acc-rol', 'registrador');
    for (const cb of await a.locator('#acc-entornos input[data-ent]').all()) await cb.setChecked((await cb.getAttribute('data-ent')) === entId);
    await a.click('#acc-alta'); await a.getByText('Acceso creado para ' + correo).waitFor({ timeout: 10000 });
  };
  await alta('r1@ingeurbe.com', 'general'); await alta('r2@ingeurbe.com', idC80); await alta('r3@ingeurbe.com', '-');
  const colAdmin = await a.locator('tr', { hasText: 'admin@ingeurbe.com' }).innerText();
  ok(/Todos/.test(colAdmin), 'admin muestra «Todos» en entornos');
  await a.click('#acc-cerrar');
  // r1 solo ve Torre A (y se abre sola)
  const r1 = await (await b.newContext()).newPage(); await entrar(r1, 'r1@ingeurbe.com');
  ok(await esp(r1, () => typeof STATE !== 'undefined' && STATE.elements.length === 1320, 60000), 'r1 (General) abre Torre A directamente');
  ok(await r1.evaluate(async () => (await Nube.listarObras(SESION)).map(o => o.nombre).join() === 'Torre A'), 'r1 solo lista Torre A');
  // r2 solo ve Torre B (sin modelo)
  const r2 = await (await b.newContext()).newPage(); await entrar(r2, 'r2@ingeurbe.com');
  ok(await esp(r2, () => /aún no tiene modelo/.test(document.getElementById('nube-box').innerText)), 'r2 (Calle 80) solo tiene Torre B, sin modelo');
  // r3 sin entornos
  const r3 = await (await b.newContext()).newPage(); await entrar(r3, 'r3@ingeurbe.com');
  ok(await esp(r3, () => /no tienes entornos asignados/i.test(document.getElementById('nube-box').innerText)), 'r3 sin entornos ve el aviso');
  // Admin pone Torre A también en Calle 80 → r2 ve ambas agrupadas bajo Calle 80
  await a.click('#n-menu'); await a.getByText('Gestionar entornos').click();
  await a.click(`[data-abrir="${idC80}"]`);
  await a.locator(`input[data-obra]`, { has: a.locator('xpath=.') }).first().waitFor();
  const torreA = await a.evaluate(async () => (await Nube.listarObras(SESION)).find(o => o.nombre === 'Torre A').id);
  await a.locator(`input[data-obra="${torreA}"]`).check(); await a.click('#ent-guardar-obras');
  await a.getByText('Obras guardadas').waitFor({ timeout: 10000 });
  await r2.reload();
  ok(await esp(r2, () => /Elige la obra/.test(document.getElementById('nube-box').innerText) && /Torre A/.test(document.getElementById('nube-box').innerText) && /Torre B/.test(document.getElementById('nube-box').innerText)), 'r2 ve Torre A y Torre B en Calle 80');
  ok(/Calle 80/i.test(await caja(r2)) && !/General/i.test(await caja(r2)), 'la lista de r2 está agrupada solo bajo Calle 80');
  // Admin ve la lista agrupada con ambos entornos
  await a.evaluate(() => { localStorage.removeItem('eurbe_ultima_obra'); }); await a.reload();
  ok(await esp(a, () => { const t = document.getElementById('nube-box').innerText; return /General/i.test(t) && /Calle 80/i.test(t); }), 'admin ve los dos entornos agrupados');
});
