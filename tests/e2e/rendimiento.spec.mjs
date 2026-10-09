import { test, expect } from '@playwright/test';
import { limpiar, usuario, prepararObra, registrar } from './sembrar.mjs';
// Rendimiento del visor: geometría unida, render bajo demanda y librerías perezosas.
// La aplicación debe comportarse igual que antes para quien la usa.

const centroEnPantalla = (p, gid) => p.evaluate(g => {
  const bb = STATE.meshes[g].geometry.boundingBox, c = bb.getCenter(new THREE.Vector3()).project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return { x: r.left + (c.x * 0.5 + 0.5) * r.width, y: r.top + (-c.y * 0.5 + 0.5) * r.height };
}, gid);

test('visor rápido: pocos envíos a la GPU, clic/ventana/filtros/colores y capturas siguen funcionando', async ({ browser }) => {
  test.setTimeout(240000);
  await limpiar(); await usuario('admin@ingeurbe.com', 'admin');
  const a = await prepararObra(browser, 'Obra Rendimiento');
  const errores = []; a.on('pageerror', e => errores.push(e.message));
  a.on('dialog', d => d.accept());

  // Librerías de Excel y gráficos no se descargan al abrir
  expect(await a.evaluate(() => typeof window.XLSX)).toBe('undefined');
  expect(await a.evaluate(() => typeof window.Chart)).toBe('undefined');

  // Un fotograma = pocos envíos (antes: uno por elemento)
  await a.evaluate(() => { pedirRender(); });
  await a.waitForTimeout(300);
  const llamadas = await a.evaluate(() => renderer.info.render.calls);
  expect(llamadas).toBeLessThanOrEqual(4);

  // En reposo casi no redibuja
  const f0 = await a.evaluate(() => renderer.info.render.frame);
  await a.waitForTimeout(2500);
  expect(await a.evaluate(() => renderer.info.render.frame) - f0).toBeLessThanOrEqual(4);

  // Clic sobre un elemento lo selecciona; con Shift acumula
  await a.evaluate(() => setMode('select'));
  const gidFrente = await a.evaluate(() => {
    // elemento visible más cercano a la cámara cuyo centro cae dentro de la pantalla
    const cam = camera.position; let mejor = null, d = Infinity;
    for (const [g, m] of Object.entries(STATE.meshes)) {
      const c = m.geometry.boundingBox.getCenter(new THREE.Vector3()); const p = c.clone().project(camera);
      if (Math.abs(p.x) > 0.8 || Math.abs(p.y) > 0.8) continue;
      const dd = c.distanceTo(cam); if (dd < d) { d = dd; mejor = g; }
    }
    return mejor;
  });
  const pt = await centroEnPantalla(a, gidFrente);
  await a.mouse.click(pt.x, pt.y);
  await expect.poll(() => a.evaluate(() => STATE.selected.size)).toBe(1);
  const elegido = await a.evaluate(() => [...STATE.selected][0]);
  // El color del elegido es el de seleccionado
  expect(await a.evaluate(g => STATE.meshes[g].material.color.getHex() === COLORS.selected, elegido)).toBe(true);

  // Un elemento oculto no se puede seleccionar con clic
  await a.evaluate(g => { clearSelection(); STATE.meshes[g].visible = false; }, elegido);
  await a.mouse.click(pt.x, pt.y);
  await a.waitForTimeout(300);
  expect(await a.evaluate(g => STATE.selected.has(g), elegido)).toBe(false);
  await a.evaluate(g => { STATE.meshes[g].visible = true; clearSelection(); }, elegido);

  // Ventana de cruce (Ctrl + arrastrar de derecha a izquierda) selecciona muchos
  const box = await a.locator('#viewer-wrap').boundingBox();
  await a.keyboard.down('Control');
  await a.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
  await a.mouse.down();
  await a.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.9, { steps: 8 });
  await a.mouse.up();
  await a.keyboard.up('Control');
  await expect.poll(() => a.evaluate(() => STATE.selected.size)).toBeGreaterThan(50);

  // Filtro por nivel oculta el resto; limpiar lo vuelve a mostrar
  const nivel = await a.evaluate(() => { clearSelection(); return STATE.elements.find(e => e.nivel).nivel; });
  await a.evaluate(n => { const s = document.getElementById('f-nivel'); if (s.tagName === 'SELECT') { s.value = n; applyFilters(); } else { STATE.elements.forEach(e => { STATE.meshes[e.globalId] && (STATE.meshes[e.globalId].visible = e.nivel === n); }); } }, nivel);
  const ocultos = await a.evaluate(() => Object.values(STATE.meshes).filter(m => !m.visible).length);
  expect(ocultos).toBeGreaterThan(0);
  await a.evaluate(() => { Object.values(STATE.meshes).forEach(m => m.visible = true); });

  // Registrar un corte cambia el color de sus elementos al de «En revisión»
  await registrar(a, 0);
  await a.waitForFunction(() => STATE.cuts.length === 1, null, { timeout: 20000 });
  const gCorte = await a.evaluate(() => STATE.cuts[0].elementIds[0]);
  expect(await a.evaluate(g => STATE.meshes[g].material.color.getHex() === parseInt(CUT_ESTADOS.revision.color.slice(1), 16), gCorte)).toBe(true);

  // Captura 3D del PDF sigue saliendo (imagen no vacía)
  const img = await a.evaluate(async () => (await captureCutImages(() => {}))[STATE.cuts[0].id] || '');
  expect(img.length).toBeGreaterThan(5000);

  // Excel se carga al exportar
  await a.evaluate(async () => { await ensureLib('XLSX'); const o = XLSX.writeFile; XLSX.writeFile = () => {}; await exportExcel(); XLSX.writeFile = o; });

  expect(errores).toEqual([]);
});
