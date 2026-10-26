import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { normalizar, numeroDe, emparejar, normalizarEstado, crearConfirmador, transicionPermitida, estadoDeFiltro } =
  createRequire(import.meta.url)('../../js/agente-voz-logica.js');

const NIVELES = ['Piso 1', 'Piso 2', 'Piso 3', 'Piso 10'];
const ACTIVIDADES = ['Columnas', 'Vigas', 'Losa de entrepiso', 'Mampostería de fachada', 'Mampostería interna'];

test('normalizar quita tildes y mayúsculas', () => {
  assert.equal(normalizar('  Mampostería INTERNA '), 'mamposteria interna');
});

test('numeroDe entiende dígitos, cardinales y ordinales', () => {
  assert.equal(numeroDe('nivel 2'), 2);
  assert.equal(numeroDe('piso dos'), 2);
  assert.equal(numeroDe('segundo piso'), 2);
  assert.equal(numeroDe('el décimo'), 10);
  assert.equal(numeroDe('cubierta'), null);
});

test('niveles: nivel 2, piso dos y segundo piso dan Piso 2', () => {
  for (const dicho of ['nivel 2', 'piso dos', 'segundo piso', 'planta 2', '2']) {
    assert.deepEqual(emparejar(dicho, NIVELES, { nivel: true }).valores, ['Piso 2'], dicho);
  }
});

test('nivel 10 no se confunde con Piso 1', () => {
  assert.deepEqual(emparejar('nivel 10', NIVELES, { nivel: true }).valores, ['Piso 10']);
});

test('nivel por nombre cuando no hay número', () => {
  const r = emparejar('cubierta', ['Piso 1', 'Cubierta'], { nivel: true });
  assert.deepEqual(r.valores, ['Cubierta']);
});

test('varios valores con «y» en un filtro múltiple', () => {
  const r = emparejar('columnas y vigas', ACTIVIDADES, { multi: true });
  assert.deepEqual(r.valores, ['Columnas', 'Vigas']);
  assert.equal(r.ambiguo, false);
});

test('una palabra contenida en varias opciones las toma todas si el filtro es múltiple', () => {
  const r = emparejar('mampostería', ACTIVIDADES, { multi: true });
  assert.deepEqual(r.valores, ['Mampostería de fachada', 'Mampostería interna']);
});

test('singular y plural se emparejan', () => {
  assert.deepEqual(emparejar('columna', ACTIVIDADES, { multi: true }).valores, ['Columnas']);
  assert.deepEqual(emparejar('viga', ACTIVIDADES, { multi: true }).valores, ['Vigas']);
});

test('orden distinto y conectores no importan', () => {
  assert.deepEqual(emparejar('fachada mamposteria', ACTIVIDADES, { multi: true }).valores, ['Mampostería de fachada']);
});

test('lo que no existe devuelve vacío', () => {
  const r = emparejar('pintura', ACTIVIDADES, { multi: true });
  assert.deepEqual(r.valores, []);
  assert.equal(r.ambiguo, false);
});

test('varias coincidencias en un filtro simple quedan ambiguas con candidatos', () => {
  const r = emparejar('mampostería', ACTIVIDADES, { multi: false });
  assert.equal(r.ambiguo, true);
  assert.deepEqual(r.candidatos, ['Mampostería de fachada', 'Mampostería interna']);
});

test('coincidencia exacta gana aunque otra opción la contenga', () => {
  const r = emparejar('Mampostería', ['Mampostería', 'Mampostería de fachada'], { multi: false });
  assert.deepEqual(r.valores, ['Mampostería']);
  assert.equal(r.ambiguo, false);
});

test('estados hablados', () => {
  assert.equal(normalizarEstado('en revisión'), 'revision');
  assert.equal(normalizarEstado('aprobación'), 'aprobacion');
  assert.equal(normalizarEstado('aprobacion'), 'aprobacion');
  assert.equal(normalizarEstado('pagado'), 'pagado');
  assert.equal(normalizarEstado('pago'), 'pagado');
  assert.equal(normalizarEstado('anular'), 'anulado');
  assert.equal(normalizarEstado('otro'), null);
});

test('confirmador: sin propuesta no confirma', () => {
  const c = crearConfirmador(() => 0);
  assert.equal(c.confirmar('a'), null);
});

test('confirmador: válida y de un solo uso', () => {
  const c = crearConfirmador(() => 0);
  c.proponer('a', { x: 1 });
  assert.deepEqual(c.confirmar('a'), { x: 1 });
  assert.equal(c.confirmar('a'), null);
});

test('confirmador: otra clave no confirma', () => {
  const c = crearConfirmador(() => 0);
  c.proponer('a', { x: 1 });
  assert.equal(c.confirmar('b'), null);
});

test('confirmador: vencida a los 120 s', () => {
  let t = 0;
  const c = crearConfirmador(() => t);
  c.proponer('a', { x: 1 });
  t = 120001;
  assert.equal(c.confirmar('a'), null);
});

test('transiciones de estado iguales a firestore.rules', () => {
  assert.equal(transicionPermitida('revision', 'aprobacion', 'registrador'), true);
  assert.equal(transicionPermitida('revision', 'pagado', 'registrador'), false);
  assert.equal(transicionPermitida('revision', 'pagado', 'admin'), true);
  assert.equal(transicionPermitida('aprobacion', 'revision', 'registrador'), false);
  assert.equal(transicionPermitida('aprobacion', 'revision', 'admin'), true);
  assert.equal(transicionPermitida('aprobacion', 'pagado', 'admin'), true);
  assert.equal(transicionPermitida('pagado', 'aprobacion', 'admin'), true);
  assert.equal(transicionPermitida('pagado', 'revision', 'admin'), false);
  assert.equal(transicionPermitida('revision', 'aprobacion', 'consulta'), false);
});

test('un nivel con número que no existe no se ofrece como ambiguo', () => {
  const r = emparejar('piso 9', NIVELES, { nivel: true });
  assert.deepEqual(r, { valores: [], ambiguo: false, candidatos: [] });
});

test('estado del filtro: pendiente, en corte y estados de pago', () => {
  assert.equal(estadoDeFiltro('pendiente'), 'pending');
  assert.equal(estadoDeFiltro('lo que falta'), 'pending');
  assert.equal(estadoDeFiltro('en corte'), 'cut');
  assert.equal(estadoDeFiltro('ejecutado'), 'cut');
  assert.equal(estadoDeFiltro('ejecutada'), 'cut');
  assert.equal(estadoDeFiltro('pagado'), 'pagado');
  assert.equal(estadoDeFiltro('lo pagado'), 'pagado');
  assert.equal(estadoDeFiltro('aprobado'), 'aprobacion');
  assert.equal(estadoDeFiltro('en aprobación'), 'aprobacion');
  assert.equal(estadoDeFiltro('en revisión'), 'revision');
  assert.equal(estadoDeFiltro('todos'), 'all');
  assert.equal(estadoDeFiltro('azul'), null);
});

test('rechazado: estado hablado, filtro y transiciones', () => {
  assert.equal(normalizarEstado('rechazado'), 'rechazado');
  assert.equal(normalizarEstado('rechazar'), 'rechazado');
  assert.equal(estadoDeFiltro('lo rechazado'), 'rechazado');
  assert.equal(transicionPermitida('revision', 'rechazado', 'admin'), true);
  assert.equal(transicionPermitida('aprobacion', 'rechazado', 'admin'), true);
  assert.equal(transicionPermitida('revision', 'rechazado', 'registrador'), false);
  assert.equal(transicionPermitida('pagado', 'rechazado', 'admin'), false);
  assert.equal(transicionPermitida('rechazado', 'revision', 'admin'), true);
});
