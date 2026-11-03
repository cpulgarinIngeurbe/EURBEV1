import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { HERRAMIENTAS, recortarHistorial, conversar, limpiarParaVoz } =
  createRequire(import.meta.url)('../../js/agente-ia-logica.js');

const llamada = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

test('las 8 herramientas del agente están descritas para el modelo', () => {
  assert.deepEqual(HERRAMIENTAS.map(h => h.function.name), ['filtrar_elementos', 'limpiar_filtros', 'seleccionar_visibles',
    'limpiar_seleccion', 'consultar_avance', 'consultar_cortes', 'registrar_corte', 'cambiar_estado_corte']);
});

test('ejecuta la herramienta que pide el modelo y devuelve su respuesta final', async () => {
  const pedidos = [];
  const respuestas = [
    { content: '', tool_calls: [llamada('a1', 'filtrar_elementos', { nivel: 'piso 3' })] },
    { content: 'Mostrando 68 elementos del piso 3.' },
  ];
  const r = await conversar({
    historial: [], dicho: 'muéstrame el piso 3',
    llamarModelo: async m => { pedidos.push(m); return respuestas.shift(); },
    herramientas: { filtrar_elementos: async p => `filtrado ${p.nivel}` },
  });
  assert.equal(r.texto, 'Mostrando 68 elementos del piso 3.');
  assert.equal(pedidos[0][0].role, 'system');
  const tool = pedidos[1].find(m => m.role === 'tool');
  assert.deepEqual(tool, { role: 'tool', tool_call_id: 'a1', content: 'filtrado piso 3' });
});

test('una herramienta que falla o no existe se le cuenta al modelo', async () => {
  const vistos = [];
  const respuestas = [
    { content: '', tool_calls: [llamada('a', 'consultar_avance', {}), llamada('b', 'inventada', {})] },
    { content: 'listo' },
  ];
  await conversar({
    historial: [], dicho: 'x',
    llamarModelo: async m => { vistos.push(m); return respuestas.shift(); },
    herramientas: { consultar_avance: async () => { throw new Error('boom'); } },
  });
  const tools = vistos[1].filter(m => m.role === 'tool').map(m => m.content);
  assert.match(tools[0], /error.*boom/);
  assert.match(tools[1], /no existe/);
});

test('argumentos mal formados no rompen la vuelta', async () => {
  let recibido;
  const respuestas = [
    { content: '', tool_calls: [{ id: 'z', type: 'function', function: { name: 'limpiar_filtros', arguments: '{malo' } }] },
    { content: 'ok' },
  ];
  await conversar({ historial: [], dicho: 'todo', llamarModelo: async () => respuestas.shift(),
    herramientas: { limpiar_filtros: async p => { recibido = p; return 'limpio'; } } });
  assert.deepEqual(recibido, {});
});

test('no se queda en bucle si el modelo pide herramientas sin parar', async () => {
  let n = 0;
  const r = await conversar({ historial: [], dicho: 'x', maxPasos: 3,
    llamarModelo: async () => ({ content: '', tool_calls: [llamada('i' + (n++), 'limpiar_filtros', {})] }),
    herramientas: { limpiar_filtros: async () => 'ok' } });
  assert.equal(n, 3);
  assert.match(r.texto, /repites/);
});

test('el historial se recorta en un mensaje de la persona', () => {
  const h = [];
  for (let i = 0; i < 10; i++) h.push({ role: 'user', content: 'u' + i },
    { role: 'assistant', content: '', tool_calls: [llamada('t' + i, 'limpiar_filtros', {})] },
    { role: 'tool', tool_call_id: 't' + i, content: 'ok' }, { role: 'assistant', content: 'listo' });
  const r = recortarHistorial(h, 10);
  assert.equal(r[0].role, 'user');
  assert.ok(r.length <= 10);
});

test('la respuesta se limpia para leerla en voz alta', () => {
  assert.equal(limpiarParaVoz('**Listo** 👍 se ven *68* elementos'), 'Listo se ven 68 elementos');
});
