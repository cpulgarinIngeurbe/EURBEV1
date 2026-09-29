import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const E = createRequire(import.meta.url)('../../js/entornos-logica.js');

const ent = [{ id: 'b', nombre: 'Calle 80' }, { id: 'a', nombre: 'PZA' }];
const obras = [
  { id: 'o1', nombre: 'Torre 2', entornos: ['a'] },
  { id: 'o2', nombre: 'Torre 1', entornos: ['a', 'b'] },
  { id: 'o3', nombre: 'Huérfana' },
];

test('agrupa por entorno, ordenado por nombre; una obra puede salir en dos grupos', () => {
  const g = E.agruparObras(obras, ent, false);
  assert.deepEqual(g.map(x => [x.entorno.nombre, x.obras.map(o => o.nombre)]),
    [['Calle 80', ['Torre 1']], ['PZA', ['Torre 1', 'Torre 2']]]);
});
test('el admin ve además un grupo «Sin entorno»', () => {
  const g = E.agruparObras(obras, ent, true);
  assert.deepEqual(g.at(-1).entorno, { id: null, nombre: 'Sin entorno' });
  assert.deepEqual(g.at(-1).obras.map(o => o.id), ['o3']);
});
test('entornos sin obras no aparecen para usuarios; sí para el admin', () => {
  const e2 = [...ent, { id: 'c', nombre: 'Vacío' }];
  assert.equal(E.agruparObras(obras, e2, false).some(x => x.entorno.id === 'c'), false);
  assert.equal(E.agruparObras(obras, e2, true).some(x => x.entorno.id === 'c'), true);
});
test('migración: sin entornos crea General y lo asigna a obras y personas no admin', () => {
  const m = E.planMigracion({ entornos: [], obras, accesos: [
    { correo: 'a@x', rol: 'admin' }, { correo: 'r@x', rol: 'registrador' }, { correo: 'c@x', rol: 'consulta', entornos: ['a'] }] });
  assert.equal(m.crearGeneral, true);
  assert.deepEqual(m.obras, ['o3']);
  assert.deepEqual(m.accesos, ['r@x']);
});
test('migración: si ya hay entornos no hace nada', () => {
  const m = E.planMigracion({ entornos: ent, obras, accesos: [{ correo: 'r@x', rol: 'registrador' }] });
  assert.deepEqual(m, { crearGeneral: false, obras: [], accesos: [] });
});
