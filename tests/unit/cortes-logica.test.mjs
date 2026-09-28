import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../../js/cortes-logica.js');

const c = (estado, creadoPor = 'r@x', extra = {}) => ({ estado, creadoPor, ...extra });

test('registrador en revisión propio: aprobación y anular', () => {
  assert.deepEqual(L.destinosPermitidos('registrador', c('revision', 'r@x'), 'r@x').sort(), ['anulado', 'aprobacion']);
});
test('registrador en revisión ajeno: solo aprobación', () => {
  assert.deepEqual(L.destinosPermitidos('registrador', c('revision', 'otro@x'), 'r@x'), ['aprobacion']);
});
test('registrador en aprobación: nada', () => {
  assert.deepEqual(L.destinosPermitidos('registrador', c('aprobacion'), 'r@x'), []);
});
test('admin en pagado: solo devolver a aprobación', () => {
  assert.deepEqual(L.destinosPermitidos('admin', c('pagado'), 'a@x'), ['aprobacion']);
});
test('admin en aprobación: revision, pagado, anulado', () => {
  assert.deepEqual(L.destinosPermitidos('admin', c('aprobacion'), 'a@x').sort(), ['anulado', 'pagado', 'revision']);
});
test('consulta y anulado: nada', () => {
  assert.deepEqual(L.destinosPermitidos('consulta', c('revision'), 'r@x'), []);
  assert.deepEqual(L.destinosPermitidos('admin', c('anulado'), 'a@x'), []);
});
test('numeración', () => {
  assert.equal(L.numeroCorte(7), 'Corte 07');
  assert.equal(L.numeroCorte(123), 'Corte 123');
  assert.equal(L.numeroSecDe('Corte 07'), 7);
  assert.equal(L.numeroSecDe('corte 12 bis'), 12);
  assert.equal(L.numeroSecDe('Revisión'), null);
});
test('separar activos y anulados', () => {
  const r = L.separar([c('revision'), c('anulado'), c('pagado')]);
  assert.equal(r.activos.length, 2);
  assert.equal(r.anulados.length, 1);
});
test('enOtrosCortes cuenta por corte', () => {
  const activos = [{ number: 'Corte 01', elementIds: ['a', 'b', 'c'] }, { number: 'Corte 02', elementIds: ['z'] }];
  assert.deepEqual(L.enOtrosCortes(['a', 'c', 'q'], activos), [{ number: 'Corte 01', cuantos: 2 }]);
});
test('elementosFaltantes frente a versión nueva', () => {
  const activos = [{ number: 'Corte 01', elementIds: ['a', 'b'] }, { number: 'Corte 02', elementIds: ['c'] }];
  assert.deepEqual(L.elementosFaltantes(activos, new Set(['a', 'c'])), [{ number: 'Corte 01', faltan: 1 }]);
});
test('prepararImportacion conserva estado, omite repetidos y sin número', () => {
  const locales = [
    { number: 'Corte 01', date: 'd', notes: 'n', elementIds: ['a'], totalElements: 1, qtyByUnit: {}, estado: 'pagado' },
    { number: 'Corte 02', elementIds: ['zz'], estado: undefined },
    { number: 'Corte 03', elementIds: ['a'] },
    { number: 'Extra', elementIds: ['a'] },
  ];
  const r = L.prepararImportacion(locales, new Set([3]), new Set(['a']), 'adm@x', 'T');
  assert.deepEqual(r.docs.map(d => d.id), ['n1', 'n2']);
  assert.equal(r.docs[0].datos.estado, 'pagado');
  assert.equal(r.docs[1].datos.estado, 'revision');
  assert.equal(r.docs[0].datos.importado, true);
  assert.equal(r.docs[0].datos.creadoPor, 'adm@x');
  assert.deepEqual(r.docs[0].datos.historial, [{ estado: 'pagado', por: 'adm@x', fecha: 'T', motivo: 'importado desde versión local' }]);
  assert.deepEqual(r.omitidos.map(o => o.number), ['Corte 03', 'Extra']);
  assert.deepEqual(r.faltantes, [{ number: 'Corte 02', faltan: 1 }]);
  assert.equal(r.maxSec, 2);
});
test('prepararImportacion recorta notas a 2000 caracteres (límite de las reglas)', () => {
  const r = L.prepararImportacion([{ number: 'Corte 01', notes: 'x'.repeat(2500), elementIds: [] }], new Set(), new Set(), 'a@x', 'T');
  assert.equal(r.docs[0].datos.notes.length, 2000);
});
test('lotesPorTamano no pasa del tamaño ni de 400 documentos por lote', () => {
  const grande = { id: 'n1', datos: { elementIds: Array(20000).fill('0123456789abcdefghijkl') } };  // ~0,5 MB
  const chico = i => ({ id: 'n' + i, datos: { notes: 'x' } });
  const lotes = L.lotesPorTamano([grande, grande, grande, ...Array.from({ length: 900 }, (_, i) => chico(i))], 1024 * 1024);
  for (const l of lotes) {
    assert.ok(l.length <= 400);
    assert.ok(l.length === 1 || JSON.stringify(l).length <= 1024 * 1024);
  }
  assert.equal(lotes.flat().length, 903);
});
