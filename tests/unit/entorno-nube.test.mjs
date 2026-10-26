import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { elegirNube } = createRequire(import.meta.url)('../../js/entorno-nube.js');

test('localhost sin parámetro usa emuladores', () => {
  const r = elegirNube({ hostname: 'localhost', search: '', recordado: null });
  assert.equal(r.modo, 'emuladores');
  assert.equal(r.local, true);
  assert.equal(r.recordar, undefined);
});
test('?nube=real en localhost usa la nube real y lo recuerda', () => {
  const r = elegirNube({ hostname: 'localhost', search: '?nube=real', recordado: null });
  assert.deepEqual(r, { modo: 'real', local: true, recordar: 'real' });
});
test('lo recordado se mantiene al recargar sin parámetro', () => {
  const r = elegirNube({ hostname: 'localhost', search: '', recordado: 'real' });
  assert.equal(r.modo, 'real');
});
test('?nube=emuladores vuelve a emuladores y olvida lo recordado', () => {
  const r = elegirNube({ hostname: 'localhost', search: '?nube=emuladores', recordado: 'real' });
  assert.deepEqual(r, { modo: 'emuladores', local: true, recordar: null });
});
test('127.0.0.1 se trata igual que localhost', () => {
  assert.equal(elegirNube({ hostname: '127.0.0.1', search: '', recordado: null }).modo, 'emuladores');
  assert.equal(elegirNube({ hostname: '127.0.0.1', search: '?nube=real', recordado: null }).modo, 'real');
});
test('fuera de localhost siempre es la nube real, diga lo que diga la URL', () => {
  const r = elegirNube({ hostname: 'cpulgariningeurbe.github.io', search: '?nube=emuladores', recordado: null });
  assert.deepEqual(r, { modo: 'real', local: false, recordar: undefined });
});
