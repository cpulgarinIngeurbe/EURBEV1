import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp,
} from 'firebase/firestore';

const ADMIN = 'admin@ingeurbe.com', REG = 'reg@ingeurbe.com', REG2 = 'reg2@ingeurbe.com';
const CONS = 'cons@ingeurbe.com', NADIE = 'nadie@ingeurbe.com', INACT = 'inact@ingeurbe.com';
let env;

const ctx = (email, verificado = true) =>
  env.authenticatedContext(email, { email, email_verified: verificado }).firestore();

const corteBase = (n, por) => ({
  numeroSec: n, number: 'Corte ' + String(n).padStart(2, '0'), date: '2026-09-28', notes: '',
  elementIds: ['g1', 'g2'], totalElements: 2, qtyByUnit: { 'm²': 3.5 },
  actividad: 'Muro 15', nivel: 'N1', edificacion: 'T1', descGrupo: 'Muros',
  registeredAt: '2026-09-28T10:00:00.000Z', estado: 'revision', creadoPor: por,
  modeloVersion: 'v1', historial: [{ estado: 'revision', por, fecha: '2026-09-28T10:00:00.000Z' }],
  ultimoCambio: serverTimestamp(),
});

// Registro como lo hará nube.js: transacción contador + corte
async function registrar(db, por) {
  return runTransaction(db, async tx => {
    const obra = doc(db, 'obras/o1');
    const n = (await tx.get(obra)).data().contadorCortes + 1;
    tx.update(obra, { contadorCortes: n });
    tx.set(doc(db, 'obras/o1/cortes/n' + n), corteBase(n, por));
    return n;
  });
}

// Cambio de estado como lo hará nube.js
function cambio(db, id, anterior, estado, por, extra = {}) {
  return updateDoc(doc(db, 'obras/o1/cortes/' + id), {
    estado, ultimoCambio: serverTimestamp(),
    historial: [...anterior, { estado, por, fecha: new Date().toISOString(), ...(extra.motivo ? { motivo: extra.motivo } : {}) }],
    ...(estado === 'anulado' ? { anuladoPor: por, motivoAnulacion: extra.motivo } : {}),
  });
}

async function sembrarCorte(id, datos) {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'obras/o1/cortes/' + id), datos);
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-eurbe',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    const acc = (rol, activo = true) => ({ rol, nombre: rol, activo, creadoPor: ADMIN, fecha: '2026-09-28' });
    await setDoc(doc(db, 'accesos/' + ADMIN), acc('admin'));
    await setDoc(doc(db, 'accesos/' + REG), acc('registrador'));
    await setDoc(doc(db, 'accesos/' + REG2), acc('registrador'));
    await setDoc(doc(db, 'accesos/' + CONS), acc('consulta'));
    await setDoc(doc(db, 'accesos/' + INACT), acc('registrador', false));
    await setDoc(doc(db, 'obras/o1'), { nombre: 'PZA', modeloVigente: 'v1', contadorCortes: 0, creadaPor: ADMIN, fecha: '2026-09-28' });
  });
});

// ── Lectura ──
test('consulta lee obras', async () => { await assertSucceeds(getDoc(doc(ctx(CONS), 'obras/o1'))); });
test('sin fila en accesos no lee', async () => { await assertFails(getDoc(doc(ctx(NADIE), 'obras/o1'))); });
test('correo sin verificar no lee', async () => { await assertFails(getDoc(doc(ctx(REG, false), 'obras/o1'))); });
test('acceso inactivo no lee', async () => { await assertFails(getDoc(doc(ctx(INACT), 'obras/o1'))); });
test('cada uno lee su propio acceso', async () => { await assertSucceeds(getDoc(doc(ctx(NADIE), 'accesos/' + NADIE))); });
test('registrador no lee accesos ajenos', async () => { await assertFails(getDoc(doc(ctx(REG), 'accesos/' + ADMIN))); });

// ── Administración ──
test('admin crea obra y acceso', async () => {
  const db = ctx(ADMIN);
  await assertSucceeds(setDoc(doc(db, 'obras/o2'), { nombre: 'X', modeloVigente: null, contadorCortes: 0, creadaPor: ADMIN, fecha: 'f' }));
  await assertSucceeds(setDoc(doc(db, 'accesos/nuevo@ingeurbe.com'), { rol: 'consulta', nombre: 'N', activo: true, creadoPor: ADMIN, fecha: 'f' }));
});
test('registrador no crea obra ni da accesos', async () => {
  const db = ctx(REG);
  await assertFails(setDoc(doc(db, 'obras/o2'), { nombre: 'X', modeloVigente: null, contadorCortes: 0, creadaPor: REG, fecha: 'f' }));
  await assertFails(setDoc(doc(db, 'accesos/' + REG), { rol: 'admin', nombre: 'yo', activo: true, creadoPor: REG, fecha: 'f' }));
});
test('rol inválido rechazado', async () => {
  await assertFails(setDoc(doc(ctx(ADMIN), 'accesos/x@ingeurbe.com'), { rol: 'jefe', nombre: 'x', activo: true, creadoPor: ADMIN, fecha: 'f' }));
});
test('solo admin sube modelo y trozos; nadie los borra', async () => {
  await assertSucceeds(setDoc(doc(ctx(ADMIN), 'obras/o1/modelos/v2/trozos/0'), { datos: 'x' }));
  await assertSucceeds(setDoc(doc(ctx(ADMIN), 'obras/o1/modelos/v2'), { nTrozos: 1 }));
  await assertFails(setDoc(doc(ctx(REG), 'obras/o1/modelos/v3'), { nTrozos: 1 }));
  await assertFails(deleteDoc(doc(ctx(ADMIN), 'obras/o1/modelos/v2')));
});
test('registrador no cambia modeloVigente', async () => {
  await assertFails(updateDoc(doc(ctx(REG), 'obras/o1'), { modeloVigente: 'v9' }));
});

// ── Registro ──
test('registrador registra con transacción', async () => {
  await assertSucceeds(registrar(ctx(REG), REG));
});
test('consulta no registra', async () => { await assertFails(registrar(ctx(CONS), CONS)); });
test('no se puede registrar sin mover el contador', async () => {
  await assertFails(setDoc(doc(ctx(REG), 'obras/o1/cortes/n1'), corteBase(1, REG)));
});
test('no se puede registrar a nombre de otro', async () => {
  await assertFails(registrar(ctx(REG), REG2));
});
test('no se puede nacer pagado', async () => {
  const db = ctx(REG);
  await assertFails(runTransaction(db, async tx => {
    tx.update(doc(db, 'obras/o1'), { contadorCortes: 1 });
    tx.set(doc(db, 'obras/o1/cortes/n1'), { ...corteBase(1, REG), estado: 'pagado' });
  }));
});
test('dos registros seguidos dan números 1 y 2', async () => {
  const a = await registrar(ctx(REG), REG), b = await registrar(ctx(REG2), REG2);
  if (a !== 1 || b !== 2) throw new Error(`numeros ${a},${b}`);
});

// ── Estados ──
const h0 = (por) => [{ estado: 'revision', por, fecha: 'f' }];
test('registrador: revision → aprobacion', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG), ultimoCambio: 'x', historial: h0(REG) });
  await assertSucceeds(cambio(ctx(REG), 'n1', h0(REG), 'aprobacion', REG));
});
test('registrador no marca pagado', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG), ultimoCambio: 'x', historial: h0(REG) });
  await assertFails(cambio(ctx(REG), 'n1', h0(REG), 'pagado', REG));
});
test('admin marca pagado y lo devuelve', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG), ultimoCambio: 'x', historial: h0(REG) });
  await assertSucceeds(cambio(ctx(ADMIN), 'n1', h0(REG), 'pagado', ADMIN));
  // withSecurityRulesDisabled no devuelve el valor del callback: se captura fuera
  let h1;
  await env.withSecurityRulesDisabled(async c => { h1 = (await getDoc(doc(c.firestore(), 'obras/o1/cortes/n1'))).data().historial; });
  await assertSucceeds(cambio(ctx(ADMIN), 'n1', h1, 'aprobacion', ADMIN));
});
test('pagado no se edita en otros campos', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG), estado: 'pagado', ultimoCambio: 'x', historial: h0(REG) });
  await assertFails(updateDoc(doc(ctx(ADMIN), 'obras/o1/cortes/n1'), { notes: 'cambiada' }));
});
test('historial no se reescribe', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG), ultimoCambio: 'x', historial: h0(REG) });
  await assertFails(updateDoc(doc(ctx(ADMIN), 'obras/o1/cortes/n1'), {
    estado: 'aprobacion', ultimoCambio: serverTimestamp(),
    historial: [{ estado: 'aprobacion', por: ADMIN, fecha: 'f' }],
  }));
});
test('historial debe firmarlo quien cambia', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG), ultimoCambio: 'x', historial: h0(REG) });
  await assertFails(cambio(ctx(REG), 'n1', h0(REG), 'aprobacion', REG2));
});

// ── Anular ──
test('registrador anula su corte en revision con motivo', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG), ultimoCambio: 'x', historial: h0(REG) });
  await assertSucceeds(cambio(ctx(REG), 'n1', h0(REG), 'anulado', REG, { motivo: 'Duplicado' }));
});
test('registrador no anula corte ajeno', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG2), ultimoCambio: 'x', historial: h0(REG2) });
  await assertFails(cambio(ctx(REG), 'n1', h0(REG2), 'anulado', REG, { motivo: 'Duplicado' }));
});
test('anular exige motivo', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG), ultimoCambio: 'x', historial: h0(REG) });
  await assertFails(cambio(ctx(ADMIN), 'n1', h0(REG), 'anulado', ADMIN, { motivo: '' }));
});
test('admin no anula pagado', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG), estado: 'pagado', ultimoCambio: 'x', historial: h0(REG) });
  await assertFails(cambio(ctx(ADMIN), 'n1', h0(REG), 'anulado', ADMIN, { motivo: 'Error' }));
});
test('anulado es final', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG), estado: 'anulado', ultimoCambio: 'x', historial: h0(REG) });
  await assertFails(cambio(ctx(ADMIN), 'n1', h0(REG), 'revision', ADMIN));
});
test('nadie borra cortes', async () => {
  await sembrarCorte('n1', { ...corteBase(1, REG), ultimoCambio: 'x' });
  await assertFails(deleteDoc(doc(ctx(ADMIN), 'obras/o1/cortes/n1')));
});

// ── Importación ──
test('admin importa corte pagado; registrador no', async () => {
  const imp = { ...corteBase(7, ADMIN), estado: 'pagado', importado: true,
    historial: [{ estado: 'pagado', por: ADMIN, fecha: 'f', motivo: 'importado desde versión local' }] };
  await assertSucceeds(setDoc(doc(ctx(ADMIN), 'obras/o1/cortes/n7'), imp));
  await assertFails(setDoc(doc(ctx(REG), 'obras/o1/cortes/n8'), { ...imp, numeroSec: 8, creadoPor: REG }));
});

test('tras importar hasta el 2, el registro normal es el 3', async () => {
  const db = ctx(ADMIN);
  const imp = n => ({ ...corteBase(n, ADMIN), importado: true, modeloVersion: '',
    historial: [{ estado: 'revision', por: ADMIN, fecha: 'f', motivo: 'importado desde versión local' }] });
  await assertSucceeds(setDoc(doc(db, 'obras/o1/cortes/n1'), imp(1)));
  await assertSucceeds(setDoc(doc(db, 'obras/o1/cortes/n2'), imp(2)));
  await assertSucceeds(updateDoc(doc(db, 'obras/o1'), { contadorCortes: 2 }));
  const n = await assertSucceeds(registrar(db, ADMIN));
  if (n !== 3) throw new Error('numero ' + n);
});
