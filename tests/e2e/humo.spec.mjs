import { test, expect } from '@playwright/test';
import { limpiar, usuario, soloCuenta } from './sembrar.mjs';

async function entrar(page, email) {
  await page.goto('/');
  await page.fill('#n-correo', email);
  await page.fill('#n-clave', 'clave123');
  await page.click('#n-entrar');
}

async function seleccionarUno(page) {
  // Ventana de cruce (Ctrl + arrastrar de derecha a izquierda): selecciona todo
  // lo que toca. Un clic en el centro puede caer en un hueco del modelo.
  const box = await page.locator('#viewer-wrap').boundingBox();
  await page.keyboard.down('Control');
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.9, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect.poll(() => page.evaluate(() => STATE.selected.size)).toBeGreaterThan(0);
}

test.beforeAll(async () => {
  await limpiar();
  await usuario('admin@ingeurbe.com', 'admin');
  await usuario('reg@ingeurbe.com', 'registrador');
  await soloCuenta('nadie@ingeurbe.com');
});

test('flujo completo: obra, modelo una vez, registro simultáneo, notas seguras', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  a.on('dialog', d => d.accept());   // aviso de duplicados u otros confirm()
  await entrar(a, 'admin@ingeurbe.com');
  await a.fill('#n-nueva', 'Obra Humo');
  await a.click('#n-crear-obra');
  await a.getByText('Obra Humo').click();
  await a.setInputFiles('#file-input', 'model.json');
  await a.click('#btn-confirm-mapping');
  await expect(a.locator('#app')).toBeVisible({ timeout: 90000 });

  // Recarga: reabre la ultima obra desde la copia local, sin pantalla de carga
  await a.reload();
  await expect(a.locator('#app')).toBeVisible({ timeout: 30000 });
  await expect(a.locator('#load-screen')).toBeHidden();

  // Registrador en otro navegador
  const r = await (await browser.newContext()).newPage();
  r.on('dialog', d => d.accept());
  await entrar(r, 'reg@ingeurbe.com');
  await expect(r.locator('#app')).toBeVisible({ timeout: 60000 });

  // Registro simultáneo
  await seleccionarUno(a); await seleccionarUno(r);
  await a.fill('#cut-notes-input', '<img src=x onerror="window.__xss=1">');
  await Promise.all([a.click('#btn-register'), r.click('#btn-register')]);
  await expect(a.locator('#history-list .cut-number')).toHaveCount(2, { timeout: 15000 });
  await expect(r.locator('#history-list .cut-number')).toHaveCount(2, { timeout: 15000 });
  const nums = await a.locator('#history-list .cut-number').allTextContents();
  expect(new Set(nums).size).toBe(2);

  // La nota maliciosa se ve como texto y no se ejecuta
  await r.locator('#history-list .cut-card-header').last().click();
  expect(await r.evaluate(() => window.__xss)).toBeUndefined();
});

test('cuenta sin acceso no entra', async ({ page }) => {
  await entrar(page, 'nadie@ingeurbe.com');
  await expect(page.getByText('No tienes acceso a E-Urbe')).toBeVisible();
});
