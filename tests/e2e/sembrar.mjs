const AUTH = 'http://127.0.0.1:9099', FS = 'http://127.0.0.1:8080', P = 'demo-eurbe';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
export async function limpiar() {
  await fetch(`${AUTH}/emulator/v1/projects/${P}/accounts`, { method: 'DELETE' });
  await fetch(`${FS}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });
}
export async function soloCuenta(email) {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${P}/accounts`,
    { method: 'POST', headers: H, body: JSON.stringify({ email, password: 'clave123', emailVerified: true }) });
}
export async function usuario(email, rol) {
  await soloCuenta(email);
  await fetch(`${FS}/v1/projects/${P}/databases/(default)/documents/accesos/${email}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ fields: {
      rol: { stringValue: rol }, nombre: { stringValue: rol }, activo: { booleanValue: true } } }) });
}
// Registra los textos que pasan por la pantalla #nube-box (para saber si hubo descarga)
export const espiaPantalla = () => {
  const prev = JSON.parse(sessionStorage.getItem('__textos') || '[]');
  window.__textos = prev;
  new MutationObserver(() => { const b = document.getElementById('nube-box');
    if (b) { window.__textos.push(b.innerText); sessionStorage.setItem('__textos', JSON.stringify(window.__textos.slice(-50))); } })
    .observe(document, { subtree: true, childList: true, characterData: true });
};
export async function entrar(page, email) {
  await page.goto('http://localhost:5173/');
  await page.fill('#n-correo', email, { timeout: 15000 });
  await page.fill('#n-clave', 'clave123');
  await page.click('#n-entrar');
}
// Admin crea una obra y sube model.json; devuelve la página con el visor abierto
export async function prepararObra(browser, nombre = 'Prueba') {
  const a = await (await browser.newContext()).newPage();
  await entrar(a, 'admin@ingeurbe.com');
  await a.fill('#n-nueva', nombre); await a.click('#n-crear-obra');
  await a.getByText(nombre).click();
  await a.waitForSelector('#load-screen', { state: 'visible', timeout: 15000 });
  await a.setInputFiles('#file-input', 'model.json');
  await a.click('#btn-confirm-mapping', { timeout: 20000 });
  await a.waitForSelector('#app', { state: 'visible', timeout: 60000 });
  await a.waitForTimeout(1000);
  return a;
}
export async function abrir(browser, email) {
  const p = await (await browser.newContext()).newPage();
  await entrar(p, email);
  await p.waitForSelector('#app', { state: 'visible', timeout: 60000 });
  await p.waitForTimeout(1000);
  return p;
}
// Selecciona los elementos [desde, desde+n) y registra
export async function registrar(p, desde, n = 3) {
  await p.evaluate(([d, k]) => { STATE.selected.clear(); STATE.elements.slice(d, d + k).forEach(e => STATE.selected.add(e.globalId)); updateCutForm(); }, [desde, n]);
  await p.evaluate(() => registerCut());
}
