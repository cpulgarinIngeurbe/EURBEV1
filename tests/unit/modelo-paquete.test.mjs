import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const P = createRequire(import.meta.url)('../../js/modelo-paquete.js');

function modeloFalso(n) {
  const elements = [];
  for (let i = 0; i < n; i++) elements.push({
    globalId: 'g' + i, actividad: 'Muro ' + (i % 7), nivel: 'N' + (i % 22), cantidad: i / 3,
    vertices: [[Math.random(), Math.random(), Math.random()], [i, i + 1, i + 2]], faces: [[0, 1, 0]],
  });
  return { meta: { sourceFile: 'x.json' }, bbox: { center: [1, 2, 3] }, elements };
}

test('ida y vuelta conserva el modelo exacto', async () => {
  const m = modeloFalso(500);
  const p = await P.empaquetar(m);
  assert.deepEqual(await P.desempaquetar(p.trozos, p.huella), m);
});
test('modelo grande se parte en trozos de como mucho 900 KB', async () => {
  const p = await P.empaquetar(modeloFalso(60000));
  assert.ok(p.trozos.length > 1, 'debe haber varios trozos');
  for (const t of p.trozos) assert.ok(t.length <= P.TAM_TROZO);
  assert.equal(p.trozos.reduce((s, t) => s + t.length, 0), p.bytes);
  assert.ok(p.bytes < p.bytesOriginales);
});
test('huella distinta → error con code huella', async () => {
  const p = await P.empaquetar(modeloFalso(10));
  await assert.rejects(P.desempaquetar(p.trozos, '0'.repeat(64)), e => e.code === 'huella');
});
test('trozo corrupto → error de huella, no un modelo a medias', async () => {
  const p = await P.empaquetar(modeloFalso(10));
  const malo = p.trozos.map(t => t.slice());
  malo[0][20] ^= 0xff;
  await assert.rejects(P.desempaquetar(malo, p.huella), e => e.code === 'huella');
});
