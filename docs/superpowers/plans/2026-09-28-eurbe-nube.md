# E-Urbe en la nube · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir E-Urbe en una aplicación web compartida (GitHub Pages + Firebase) con varias obras, el modelo cargado una sola vez y cortes en la nube con permisos por rol.

**Architecture:** `index.html` pasa a ser la app en la nube (copia de `eurbe.html` con ganchos mínimos). La lógica nueva va en archivos `js/` pequeños: dos módulos puros, probados en Node (`modelo-paquete.js`, `cortes-logica.js`), uno de acceso a Firebase (`nube.js`), uno de caché IndexedDB (`cache-modelo.js`) y uno de pantallas y orquestación (`ui-nube.js`). Los permisos los impone `firestore.rules`, probado contra el emulador. `eurbe.html` sigue siendo la versión local, con correcciones y un botón para exportar cortes.

**Tech Stack:** HTML/JS clásico (sin bundler) · Firebase JS SDK 12.x *compat* por CDN (`gstatic.com`) · Cloud Firestore + Firebase Auth (correo/contraseña), plan Spark · IndexedDB · `CompressionStream` gzip · Node 24 `node:test` · `firebase-tools` 15.x (emuladores) · `@firebase/rules-unit-testing` 5.x · `@playwright/test` 1.x · JDK 21 portátil (lo exige el emulador).

**Spec:** [`docs/diseno-nube.md`](../../diseno-nube.md). Léelo antes de empezar; este plan lo implementa.

## Global Constraints

- Contexto técnico y trampas conocidas: `CLAUDE.md`. Todas siguen vigentes.
- El avance lo definen **solo los cortes activos** (`STATE.cuts`); los anulados nunca entran ahí.
- Ningún nombre de parámetro fijo: todo pasa por `PARAM_MAP`.
- Elementos guardados siempre en **Z-up**. El paquete del modelo guarda el `data` exacto que recibe `loadModel()`.
- Cantidades con `.toFixed(2)` en interfaz e informes.
- Colecciones: `accesos/{correo en minúsculas}`, `obras/{obraId}`, `obras/{obraId}/modelos/{versionId}`, `…/modelos/{versionId}/trozos/{n}`, `obras/{obraId}/cortes/n{numeroSec}`.
- Roles exactos: `'admin' | 'registrador' | 'consulta'`. Estados exactos: `'revision' | 'aprobacion' | 'pagado' | 'anulado'`.
- Trozos del modelo ≤ **900 KB** (`900 * 1024` bytes) como Firestore `Bytes`.
- Sin Cloud Storage, sin tarjeta: solo Firestore + Auth del plan Spark.
- No imitar la pantalla de inicio de sesión de Microsoft. Pantalla con marca E-Urbe y la nota «Inicio con cuenta Microsoft: próximamente».
- Sin registros de cortes sin conexión. Toda escritura de cortes va por **transacción**, que falla offline y no se encola.
- Nada de `*.json` de modelos, `*.ifc` ni respaldos en git (el repo es público).
- Todo texto que venga de datos (notas, nombres, motivos, correos) se inserta en HTML con `esc()`.
- Edición de archivos HTML: reemplazos quirúrgicos con Python y `assert old in c`; después `node --check` sobre el `<script>` extraído (comando en `CLAUDE.md`).

## Review Focus

1. **Dos personas registran a la vez**: deben salir números distintos (Corte 07 y Corte 08) y ambas ver los dos cortes. Lo prueba la transacción en la Task 7 y el e2e con dos navegadores en la Task 12.
2. **Versión nueva del modelo en la que faltan elementos de cortes existentes**: aviso con nombre de corte y cantidad antes de publicar, sin perder nada. Lo prueba `elementosFaltantes` en la Task 4 y la verificación manual en la Task 6.
3. **Observaciones con HTML o `<script>`** escritas por otra persona: se ven como texto, no se ejecutan. Lo prueba `esc` en la Task 1 y el e2e en la Task 12.
4. **Descarga del modelo corrupta o interrumpida**: la huella no coincide, se reintenta una vez y luego sale un mensaje claro. Nunca se abre un modelo a medias. Lo prueba `desempaquetar` con huella errónea en la Task 5.
5. **Usuario con cuenta pero sin fila en `accesos`, o sin verificar el correo**: no lee nada. Lo prueban las reglas en la Task 3 y el e2e en la Task 12.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `eurbe.html` | Versión local (`file://`). Correcciones previas + botón «Exportar cortes (JSON)». |
| `index.html` | App en la nube: copia de `eurbe.html` + pantallas nuevas + ganchos. |
| `firebase-config.js` | `window.EURBE_FIREBASE_CONFIG`: configuración web pública. |
| `js/modelo-paquete.js` | Puro. Comprimir, trocear, huella SHA-256 y reconstruir el modelo. |
| `js/cortes-logica.js` | Puro. Transiciones por rol, numeración, duplicados, faltantes, importación. Espejo en cliente de las reglas. |
| `js/cache-modelo.js` | IndexedDB: guardar, leer y podar la copia local del modelo comprimido. |
| `js/nube.js` | Todo el acceso a Firebase (auth, accesos, obras, modelos, cortes). Nada de DOM. |
| `js/ui-nube.js` | Pantallas de entrada, obra y accesos, menú «Obra ▾», orquestación de arranque, modo sin conexión. |
| `firestore.rules` | Permisos en el servidor. |
| `firebase.json`, `.firebaserc` | Config de emuladores y despliegue de reglas. |
| `package.json` | Scripts de pruebas y dependencias de desarrollo. |
| `tests/unit/*.test.mjs` | Pruebas de módulos puros (`node --test`). |
| `tests/rules/reglas.test.mjs` | Pruebas de reglas contra el emulador. |
| `tests/e2e/*.spec.mjs`, `playwright.config.mjs` | Humo en navegador real contra emuladores. |

**Contrato de ganchos entre `index.html` y `ui-nube.js`**. Estas son las únicas llamadas cruzadas:
- `index.html` llama a `entregarModelo(data)` donde antes llamaba a `loadModel(data)` en las rutas de carga de archivo.
- `index.html` llama a `window.alModeloCargado()` donde antes llamaba a `loadCutsFromStorage()`.
- `index.html` llama a `accionesCorte*`. Las funciones `registerCut`, `cambiarEstadoCorte` y `deleteCut` se reemplazan (Task 7).
- `ui-nube.js` usa las globales existentes: `STATE`, `PARAM_MAP`, `loadModel`, `rebuildCutIndex`, `refreshAllColors`, `renderHistory`, `updateCutForm`, `renderDashboard`, `notify`, `showMappingScreen`.

---

### Task 1: Correcciones previas en `eurbe.html`

Las tres del análisis inicial más dos detectadas al planificar (arrastrar un JSON se salta el mapeo; notas sin escapar).

**Files:**
- Modify: `eurbe.html` (filtro de estado ~649 y ~2342, `exportPendientesCSV` ~2920, `renderPendientes` ~2744, hoja 4 del Excel ~2893, pendientes del PDF ~3252, `renderHistory` ~2198, arrastrar y soltar ~2460, lector JSON ~1487)
- Create: `js/texto.js`
- Test: `tests/unit/texto.test.mjs`

**Interfaces:**
- Produces: `esc(s: any) → string` (global en navegador, `module.exports.esc` en Node). Escapa `& < > " '`; `null`/`undefined` → `''`.
- Produces: `leerArchivoJSON(file: File)` en `eurbe.html`, que usan tanto el `<input>` como el arrastrar y soltar.

- [ ] **Step 1: Preparar herramientas de prueba**

Crea `package.json`:

```json
{
  "name": "eurbe",
  "private": true,
  "type": "module",
  "scripts": {
    "test:unit": "node --test tests/unit/",
    "test:rules": "firebase emulators:exec --only firestore --project demo-eurbe \"node --test tests/rules/\"",
    "emuladores": "firebase emulators:start --only auth,firestore --project demo-eurbe",
    "servir": "npx --yes http-server -p 5173 -c-1 .",
    "test:e2e": "playwright test"
  }
}
```

Añade al `.gitignore`, justo debajo de `!firestore.indexes.json`:

```
!package-lock.json
```

y al final:

```
.tools/
test-results/
playwright-report/
```

- [ ] **Step 2: Prueba que falla para `esc`**

`tests/unit/texto.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { esc } = createRequire(import.meta.url)('../../js/texto.js');

test('escapa los cinco caracteres peligrosos', () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`),
    '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
});
test('null y undefined dan cadena vacía; números se convierten', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(12.5), '12.5');
});
```

Run: `npm run test:unit`
Expected: FAIL (`Cannot find module '../../js/texto.js'`).

- [ ] **Step 3: Implementar `js/texto.js`**

```js
// Escapa texto para insertarlo en HTML. Todo lo que venga de datos (notas,
// nombres, motivos) pasa por aqui: con varios usuarios, una nota con <script>
// se ejecutaria en el navegador de los demas.
(function (raiz) {
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { esc };
  else raiz.esc = esc;
})(typeof window !== 'undefined' ? window : globalThis);
```

`js/texto.js` usa `module.exports`, y como `package.json` declara `"type": "module"`, Node lo trataría como ESM. Crea también `js/package.json` con `{ "type": "commonjs" }` para que los archivos de `js/` se carguen como scripts clásicos en Node. Al navegador no le afecta.

Run: `npm run test:unit`
Expected: PASS (2 tests).

- [ ] **Step 4: Aplicar las correcciones en `eurbe.html`**

Guarda como `.tools/fix_task1.py` y ejecútalo con `python .tools/fix_task1.py`:

```python
import io
p = 'eurbe.html'
c = io.open(p, encoding='utf-8').read()

def rep(old, new, count=1):
    global c
    assert c.count(old) == count, (old[:60], c.count(old))
    c = c.replace(old, new)

# 1) El filtro «Ejecutados (IFC)» siempre dejaba la vista vacía: ejecutado es
#    siempre false (el avance lo definen los cortes). Se elimina.
rep('      <option value="executed">Ejecutados (IFC)</option>\n', '')
rep("    if (estado === 'executed' && !el.ejecutado) show = false;\n", '')
rep("    if (estado === 'pending' && (el.ejecutado || STATE.cutElements.has(el.globalId))) show = false;",
    "    if (estado === 'pending' && STATE.cutElements.has(el.globalId)) show = false;")

# 2) CSV de pendientes: columnas reales + edificación
rep("""  const rows = buildPendientesData('','');
  const csv = ['Actividad,Nivel,Grupo,Unidad,Total IFC,Ejecutado IFC,En cortes E-Urbe,Pendiente,% Avance'];
  rows.forEach(r => {
    csv.push([
      `"${r.actividad}"`,`"${r.nivel}"`,`"${r.descGrupo}"`,r.unidad,
      r.totalQty, r.ejecutadoQty, r.corteQty, r.pendiente, r.pctDone.toFixed(1)+'%'
    ].join(','));
  });""",
"""  const rows = buildPendientesData('','','');
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const csv = ['Edificación,Actividad,Nivel,Grupo,Unidad,Total modelo,Ejecutado (cortes),Pendiente,% Avance'];
  rows.forEach(r => {
    csv.push([
      q(r.edificacion), q(r.actividad), q(r.nivel), q(r.descGrupo), q(r.unidad),
      r.totalQty.toFixed(2), r.ejecutadoQty.toFixed(2), r.pendiente.toFixed(2), r.pctDone.toFixed(1)+'%'
    ].join(','));
  });""")

# 3) Dos decimales en pendientes: pantalla, Excel y PDF
rep("""      <td>${r.totalQty} <span class="chip-unit">${r.unidad}</span></td>
      <td class="qty-done">${r.ejecutadoQty}</td>
      <td class="${pendCls}">${r.pendiente}</td>""",
"""      <td>${r.totalQty.toFixed(2)} <span class="chip-unit">${esc(r.unidad)}</span></td>
      <td class="qty-done">${r.ejecutadoQty.toFixed(2)}</td>
      <td class="${pendCls}">${r.pendiente.toFixed(2)}</td>""")
rep("""      r.totalQty, r.ejecutadoQty, r.pendiente, r.pctDone.toFixed(1)+'%']);""",
"""      +r.totalQty.toFixed(2), +r.ejecutadoQty.toFixed(2), +r.pendiente.toFixed(2), r.pctDone.toFixed(1)+'%']);""")
rep("""    <td>${r.totalQty}</td><td>${r.ejecutadoQty+r.corteQty}</td>
    <td style="color:#E05050;font-weight:bold">${r.pendiente}</td>""",
"""    <td>${r.totalQty.toFixed(2)}</td><td>${r.ejecutadoQty.toFixed(2)}</td>
    <td style="color:#E05050;font-weight:bold">${r.pendiente.toFixed(2)}</td>""")

# 4) Notas escapadas en historial y PDF
rep("""<div class="prop-value">${cut.notes}</div>""", """<div class="prop-value">${esc(cut.notes)}</div>""")
rep("""      <td>${qtyStr}</td><td>${cut.notes || ''}</td>""", """      <td>${qtyStr}</td><td>${esc(cut.notes)}</td>""")
rep("""<td colspan="3">${cut.notes || '—'}</td>""", """<td colspan="3">${esc(cut.notes) || '—'}</td>""")

# 5) Arrastrar y soltar pasaba directo a loadModel sin mapeo: ahora usa el
#    mismo camino que el selector de archivo.
rep("""document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader""", """document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) leerArchivoJSON(file);
});

function leerArchivoJSON(file) {
  const reader""")
rep("""  reader.readAsText(file);
});

function loadModel(data) {""", """  reader.readAsText(file);
}

function loadModel(data) {""")
rep("""  const file = e.dataTransfer.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('load-progress').style.display = 'block';
      setTimeout(() => {
        const data = JSON.parse(ev.target.result);
        loadModel(data);
      }, 50);
    };
    reader.readAsText(file);
  }""", """  const file = e.dataTransfer.files[0];
  if (file && /\\.json$/i.test(file.name)) leerArchivoJSON(file);
  else if (file) alert('Arrastra un archivo .json. Para .ifc usa el botón de carga IFC.');""")

# esc() embebido: eurbe.html debe seguir siendo un solo archivo para file://
rep("""const COLORS = {""", """function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const COLORS = {""")

io.open(p, 'w', encoding='utf-8', newline='').write(c)
print('ok')
```

Expected: `ok`. Si alguna aserción falla, el texto cambió: localízalo con `grep -n` y ajusta el `old`.

- [ ] **Step 5: Verificar sintaxis**

```bash
python -c "import re;c=open('eurbe.html',encoding='utf-8').read();open('.tools/app.js','w',encoding='utf-8').write(max(re.findall(r'<script>(.*?)</script>',c,re.S),key=len))" && node --check .tools/app.js && echo OK
```

Expected: `OK`.

- [ ] **Step 6: Verificación manual en navegador**

Abre `eurbe.html` con `file://`, arrastra `model.json` a la pantalla de carga y comprueba:
- Aparece la pantalla de mapeo.
- El filtro Estado ya no tiene «Ejecutados (IFC)».
- En Pendientes, todas las cantidades tienen 2 decimales.
- Registra un corte con la nota `<b>x</b>`: en el historial se ve el texto literal `<b>x</b>`.
- Exporta el CSV de pendientes: la primera columna es Edificación y ninguna columna sale siempre en 0.

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore js/texto.js js/package.json tests/unit/texto.test.mjs eurbe.html
git commit -m "Corrige filtro, CSV y decimales de pendientes; mapeo al arrastrar; notas escapadas"
```

---

### Task 2: Botón «Exportar cortes (JSON)» en `eurbe.html`

**Files:**
- Modify: `eurbe.html` (modal de exportación ~869-897; funciones de exportación ~2835)

**Interfaces:**
- Produces: un archivo `eurbe_cortes_YYYY-MM-DD.json` con la forma `{ formato: 'eurbe-cortes', version: 1, exportado: ISO, cortes: STATE.cuts }`. La Task 10 lo consume.

- [ ] **Step 1: Ver la estructura del modal**

Run: `sed -n 869,900p eurbe.html`. Identifica el último bloque de opción antes del botón «Cerrar» (línea ~897) para insertar al mismo nivel.

- [ ] **Step 2: Insertar opción y función**

`.tools/fix_task2.py`:

```python
import io
p = 'eurbe.html'
c = io.open(p, encoding='utf-8').read()
old = """      <button class="btn btn-secondary" onclick="closeExportModal()">Cerrar</button>"""
assert c.count(old) == 1
c = c.replace(old, """      <button class="btn btn-secondary" onclick="exportarCortesJSON()"
              title="Para pasar los cortes a la versión en la nube">💾 Exportar cortes (JSON)</button>
""" + old)
old = "function exportPendientesCSV() {"
assert c.count(old) == 1
c = c.replace(old, """// Copia de seguridad de los cortes, y paso de la version local a la nube:
// la version web no puede leer el localStorage de file://.
function exportarCortesJSON() {
  if (!STATE.cuts.length) { alert('No hay cortes registrados para exportar.'); return; }
  const hoy = new Date().toISOString().slice(0,10);
  const blob = new Blob([JSON.stringify({
    formato: 'eurbe-cortes', version: 1, exportado: new Date().toISOString(), cortes: STATE.cuts,
  }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'eurbe_cortes_' + hoy + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  notify('✔ ' + STATE.cuts.length + ' cortes exportados');
}

""" + old)
io.open(p, 'w', encoding='utf-8', newline='').write(c)
print('ok')
```

Run: `python .tools/fix_task2.py`. Expected: `ok`.

- [ ] **Step 3: Sintaxis**

Run: el comando del Step 5 de la Task 1. Expected: `OK`.

- [ ] **Step 4: Verificación manual**

Abre `eurbe.html`, carga `model.json`, registra 2 cortes y pulsa Exportar → «Exportar cortes (JSON)». Se descarga un archivo con `"formato": "eurbe-cortes"` y 2 cortes. Guárdalo en `.tools/cortes_prueba.json`; lo usa la Task 10.

- [ ] **Step 5: Commit**

```bash
git add eurbe.html
git commit -m "Añade exportación de cortes a JSON en la versión local"
```

---

### Task 3: Reglas de Firestore y pruebas de permisos

**Files:**
- Create: `firestore.rules`, `firebase.json`, `.firebaserc`, `tests/rules/reglas.test.mjs`
- Modify: `package.json` (devDependencies)

**Interfaces:**
- Produces: la forma de documentos que deben escribir `nube.js` (Task 6-10):
  - Corte al registrarse: `{numeroSec:int, number, date, notes, elementIds:[], totalElements, qtyByUnit:{}, actividad, nivel, edificacion, descGrupo, registeredAt:ISO, estado:'revision', creadoPor:correo, modeloVersion, historial:[{estado:'revision', por:correo, fecha:ISO}], ultimoCambio:serverTimestamp}` con id `n{numeroSec}`, en la misma transacción que `obras/{id}.contadorCortes = numeroSec`.
  - Cambio de estado: solo cambia `estado`, `historial` (+1 al final), `ultimoCambio` (serverTimestamp) y, al anular, `anuladoPor` y `motivoAnulacion` (≥ 3 caracteres).
  - Importado (solo admin): igual que el anterior pero con `importado:true`, cualquier estado activo e historial libre.

- [ ] **Step 1: JDK portátil (el emulador de Firestore necesita Java 21)**

```bash
mkdir -p .tools && cd .tools && curl -L -o jdk.zip "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse" && unzip -q jdk.zip && mv jdk-21* jdk && rm jdk.zip && cd ..
export PATH="$PWD/.tools/jdk/bin:$PATH" && java -version
```

Expected: `openjdk version "21...`. Repite el `export PATH=…` en cada terminal nueva antes de `npm run test:rules`.

- [ ] **Step 2: Dependencias y configuración**

```bash
npm install --save-dev firebase@12 firebase-tools@15 @firebase/rules-unit-testing@5 @playwright/test@1
```

`firebase.json`:

```json
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
}
```

`.firebaserc` (el id real se pone en la Task 13):

```json
{ "projects": { "default": "demo-eurbe" } }
```

- [ ] **Step 3: Pruebas que fallan**

`tests/rules/reglas.test.mjs`:

```js
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
  const h1 = (await env.withSecurityRulesDisabled(async c => (await getDoc(doc(c.firestore(), 'obras/o1/cortes/n1'))).data().historial)) ?? [];
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
```

El historial se reescribe completo (no `arrayUnion`) para que la regla pueda comparar el prefijo.

Run: `export PATH="$PWD/.tools/jdk/bin:$PATH"; npm run test:rules`
Expected: FAIL (falta `firestore.rules`).

- [ ] **Step 4: Escribir `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    function firmado()   { return request.auth != null && request.auth.token.email_verified == true; }
    function correo()    { return request.auth.token.email.lower(); }
    function rutaAcc()   { return /databases/$(db)/documents/accesos/$(correo()); }
    function acceso()    { return get(rutaAcc()).data; }
    function habilitado(){ return firmado() && exists(rutaAcc()) && acceso().activo == true; }
    function esAdmin()   { return habilitado() && acceso().rol == 'admin'; }
    function registra()  { return habilitado() && acceso().rol in ['admin', 'registrador']; }

    match /accesos/{c} {
      allow read: if firmado() && (c == correo() || esAdmin());
      allow create, update: if esAdmin()
        && c == c.lower()
        && request.resource.data.rol in ['admin', 'registrador', 'consulta']
        && request.resource.data.activo is bool;
      allow delete: if false;
    }

    match /obras/{obraId} {
      allow read: if habilitado();
      allow create: if esAdmin() && request.resource.data.contadorCortes == 0;
      // El registrador solo puede mover el contador de uno en uno (numeración)
      allow update: if esAdmin()
        || (registra()
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['contadorCortes'])
            && request.resource.data.contadorCortes == resource.data.contadorCortes + 1);
      allow delete: if false;

      match /modelos/{versionId} {
        allow read: if habilitado();
        allow create: if esAdmin();
        allow update, delete: if false;
        match /trozos/{n} {
          allow read: if habilitado();
          allow create: if esAdmin();
          allow update, delete: if false;
        }
      }

      match /cortes/{corteId} {
        function rutaObra() { return /databases/$(db)/documents/obras/$(obraId); }
        function nuevo()    { return request.resource.data; }
        function campos() {
          return ['numeroSec','number','date','notes','elementIds','totalElements','qtyByUnit',
                  'actividad','nivel','edificacion','descGrupo','registeredAt','estado','creadoPor',
                  'modeloVersion','historial','ultimoCambio','importado','anuladoPor','motivoAnulacion'];
        }

        function registroNormal() {
          return registra()
            && nuevo().estado == 'revision'
            && !('importado' in nuevo())
            && nuevo().historial.size() == 1
            && nuevo().historial[0].estado == 'revision'
            && nuevo().historial[0].por == correo()
            && get(rutaObra()).data.contadorCortes == nuevo().numeroSec - 1
            && getAfter(rutaObra()).data.contadorCortes == nuevo().numeroSec;
        }
        function importacion() {
          return esAdmin() && nuevo().importado == true
            && nuevo().estado in ['revision', 'aprobacion', 'pagado'];
        }

        function transicion(de, a) {
          return (de == 'revision'   && a == 'aprobacion' && registra())
              || (de == 'aprobacion' && a == 'revision'   && esAdmin())
              || (de in ['revision', 'aprobacion'] && a == 'pagado' && esAdmin())
              || (de == 'pagado'     && a == 'aprobacion' && esAdmin())
              || (de in ['revision', 'aprobacion'] && a == 'anulado' && esAdmin())
              || (de == 'revision'   && a == 'anulado' && registra()
                  && resource.data.creadoPor == correo());
        }
        function historialMasUno() {
          let n = resource.data.historial.size();
          let h = nuevo().historial;
          return h.size() == n + 1
            && h[0:n] == resource.data.historial
            && h[n].estado == nuevo().estado
            && h[n].por == correo()
            && h[n].fecha is string;
        }

        allow read: if habilitado();
        allow create: if nuevo().keys().hasOnly(campos())
          && corteId == 'n' + string(nuevo().numeroSec)
          && nuevo().creadoPor == correo()
          && nuevo().ultimoCambio == request.time
          && (registroNormal() || importacion());
        allow update: if habilitado()
          && nuevo().diff(resource.data).affectedKeys()
               .hasOnly(['estado', 'historial', 'ultimoCambio', 'anuladoPor', 'motivoAnulacion'])
          && nuevo().ultimoCambio == request.time
          && historialMasUno()
          && transicion(resource.data.estado, nuevo().estado)
          && (nuevo().estado != 'anulado'
              || (nuevo().anuladoPor == correo()
                  && nuevo().motivoAnulacion is string
                  && nuevo().motivoAnulacion.size() >= 3));
        allow delete: if false;
      }
    }
  }
}
```

- [ ] **Step 5: Ejecutar las pruebas**

Run: `npm run test:rules`
Expected: PASS (todas). Si `admin marca pagado y lo devuelve` falla por el historial leído, usa el valor devuelto por la lectura con reglas desactivadas tal cual, sin normalizar.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules firebase.json .firebaserc package.json package-lock.json tests/rules/reglas.test.mjs
git commit -m "Reglas de Firestore con permisos por rol y pruebas contra emulador"
```

---

### Task 4: `js/cortes-logica.js` — reglas espejo y utilidades de cortes

**Files:**
- Create: `js/cortes-logica.js`
- Test: `tests/unit/cortes-logica.test.mjs`

**Interfaces:**
- Produces (global `window.EurbeCortes` / `module.exports`):
  - `TRANSICIONES: Array<{de, a, roles:string[], soloPropio?:true}>`: debe coincidir con `transicion()` de `firestore.rules`.
  - `destinosPermitidos(rol: string, corte: {estado, creadoPor}, correo: string) → string[]`: estados a los que puede pasar (incluye `'anulado'` si aplica).
  - `numeroCorte(n: number) → string`: `'Corte 07'`.
  - `numeroSecDe(number: string) → number|null`: `'Corte 07'` → `7`.
  - `separar(cortes: object[]) → {activos: object[], anulados: object[]}`.
  - `enOtrosCortes(ids: string[], activos: object[]) → Array<{number, cuantos}>`.
  - `elementosFaltantes(activos: object[], idsModelo: Set<string>) → Array<{number, faltan}>`.
  - `prepararImportacion(locales: object[], numerosExistentes: Set<number>, idsModelo: Set<string>, correo: string, ahoraISO: string) → {docs: Array<{id, datos}>, omitidos: Array<{number, motivo}>, faltantes: Array<{number, faltan}>, maxSec: number}`. Las `datos` no incluyen `ultimoCambio`: lo pone `nube.js` con `serverTimestamp`.

- [ ] **Step 1: Pruebas que fallan**

`tests/unit/cortes-logica.test.mjs`:

```js
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
```

Run: `npm run test:unit`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 2: Implementar**

`js/cortes-logica.js`:

```js
// Logica de cortes sin DOM ni Firebase. TRANSICIONES es el espejo en cliente de
// transicion() en firestore.rules: la pagina la usa para decidir que botones
// mostrar, pero quien manda de verdad son las reglas del servidor.
(function (raiz) {
  const TRANSICIONES = [
    { de: 'revision',   a: 'aprobacion', roles: ['admin', 'registrador'] },
    { de: 'aprobacion', a: 'revision',   roles: ['admin'] },
    { de: 'revision',   a: 'pagado',     roles: ['admin'] },
    { de: 'aprobacion', a: 'pagado',     roles: ['admin'] },
    { de: 'pagado',     a: 'aprobacion', roles: ['admin'] },
    { de: 'revision',   a: 'anulado',    roles: ['admin'] },
    { de: 'aprobacion', a: 'anulado',    roles: ['admin'] },
    { de: 'revision',   a: 'anulado',    roles: ['registrador'], soloPropio: true },
  ];
  const ACTIVOS = ['revision', 'aprobacion', 'pagado'];
  const MOTIVO_IMPORTADO = 'importado desde versión local';

  function destinosPermitidos(rol, corte, correo) {
    const de = corte.estado || 'revision';
    const out = new Set();
    for (const t of TRANSICIONES) {
      if (t.de !== de || !t.roles.includes(rol)) continue;
      if (t.soloPropio && corte.creadoPor !== correo) continue;
      out.add(t.a);
    }
    return [...out];
  }

  function numeroCorte(n) { return 'Corte ' + String(n).padStart(2, '0'); }

  function numeroSecDe(number) {
    const m = /(\d+)/.exec(String(number || ''));
    return m ? parseInt(m[1], 10) : null;
  }

  function separar(cortes) {
    const activos = [], anulados = [];
    for (const ct of cortes) (ct.estado === 'anulado' ? anulados : activos).push(ct);
    return { activos, anulados };
  }

  function enOtrosCortes(ids, activos) {
    const sel = new Set(ids), out = [];
    for (const ct of activos) {
      const cuantos = (ct.elementIds || []).filter(g => sel.has(g)).length;
      if (cuantos) out.push({ number: ct.number, cuantos });
    }
    return out;
  }

  function elementosFaltantes(activos, idsModelo) {
    const out = [];
    for (const ct of activos) {
      const faltan = (ct.elementIds || []).filter(g => !idsModelo.has(g)).length;
      if (faltan) out.push({ number: ct.number, faltan });
    }
    return out;
  }

  function prepararImportacion(locales, numerosExistentes, idsModelo, correo, ahoraISO) {
    const docs = [], omitidos = [], vistos = new Set();
    let maxSec = 0;
    for (const ct of locales) {
      const n = numeroSecDe(ct.number);
      if (n === null) { omitidos.push({ number: ct.number, motivo: 'sin número reconocible' }); continue; }
      if (numerosExistentes.has(n) || vistos.has(n)) {
        omitidos.push({ number: ct.number, motivo: 'ese número ya existe en la obra' }); continue;
      }
      vistos.add(n);
      maxSec = Math.max(maxSec, n);
      const estado = ACTIVOS.includes(ct.estado) ? ct.estado : 'revision';
      docs.push({ id: 'n' + n, datos: {
        numeroSec: n, number: numeroCorte(n), date: ct.date || '', notes: ct.notes || '',
        elementIds: ct.elementIds || [], totalElements: ct.totalElements || (ct.elementIds || []).length,
        qtyByUnit: ct.qtyByUnit || {}, actividad: ct.actividad || '', nivel: ct.nivel || '',
        edificacion: ct.edificacion || '', descGrupo: ct.descGrupo || '',
        registeredAt: ct.registeredAt || ahoraISO, estado, creadoPor: correo,
        modeloVersion: '', importado: true,
        historial: [{ estado, por: correo, fecha: ahoraISO, motivo: MOTIVO_IMPORTADO }],
      } });
    }
    const faltantes = elementosFaltantes(docs.map(d => d.datos), idsModelo);
    return { docs, omitidos, faltantes, maxSec };
  }

  const api = { TRANSICIONES, ACTIVOS, destinosPermitidos, numeroCorte, numeroSecDe, separar,
                enOtrosCortes, elementosFaltantes, prepararImportacion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.EurbeCortes = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 3: Ejecutar**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add js/cortes-logica.js tests/unit/cortes-logica.test.mjs
git commit -m "Lógica de cortes: transiciones por rol, numeración, duplicados e importación"
```

---

### Task 5: `js/modelo-paquete.js` — comprimir, trocear y verificar el modelo

**Files:**
- Create: `js/modelo-paquete.js`
- Test: `tests/unit/modelo-paquete.test.mjs`

**Interfaces:**
- Produces (global `window.EurbePaquete` / `module.exports`):
  - `TAM_TROZO = 921600`.
  - `empaquetar(data: object) → Promise<{trozos: Uint8Array[], huella: string(hex64), bytes: number, bytesOriginales: number}>`.
  - `desempaquetar(trozos: Uint8Array[], huellaEsperada?: string) → Promise<object>`. Lanza un `Error` con `code === 'huella'` si no coincide.
  - `huellaDe(u8) → Promise<string>`, `unir(trozos) → Uint8Array`.

- [ ] **Step 1: Pruebas que fallan**

`tests/unit/modelo-paquete.test.mjs`:

```js
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
```

Run: `npm run test:unit`
Expected: FAIL.

- [ ] **Step 2: Implementar**

`js/modelo-paquete.js`:

```js
// Empaqueta el modelo (el mismo objeto que recibe loadModel) para guardarlo en
// Firestore: JSON -> gzip -> trozos de 900 KB (un documento no pasa de 1 MB).
// La huella SHA-256 del comprimido detecta descargas corruptas o incompletas.
(function (raiz) {
  const TAM_TROZO = 900 * 1024;

  async function pasarPor(u8, transform) {
    const flujo = new Blob([u8]).stream().pipeThrough(transform);
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  async function huellaDe(u8) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
    return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
  }

  function partir(u8) {
    const out = [];
    for (let i = 0; i < u8.length; i += TAM_TROZO) out.push(u8.slice(i, i + TAM_TROZO));
    return out;
  }

  function unir(trozos) {
    const total = trozos.reduce((s, t) => s + t.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const t of trozos) { out.set(t, pos); pos += t.length; }
    return out;
  }

  async function empaquetar(data) {
    const crudo = new TextEncoder().encode(JSON.stringify(data));
    const comprimido = await pasarPor(crudo, new CompressionStream('gzip'));
    return { trozos: partir(comprimido), huella: await huellaDe(comprimido),
             bytes: comprimido.length, bytesOriginales: crudo.length };
  }

  async function desempaquetar(trozos, huellaEsperada) {
    const comprimido = unir(trozos);
    if (huellaEsperada && (await huellaDe(comprimido)) !== huellaEsperada) {
      const e = new Error('El modelo descargado no coincide con el publicado (descarga incompleta o dañada).');
      e.code = 'huella';
      throw e;
    }
    const crudo = await pasarPor(comprimido, new DecompressionStream('gzip'));
    return JSON.parse(new TextDecoder().decode(crudo));
  }

  const api = { TAM_TROZO, empaquetar, desempaquetar, huellaDe, unir };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.EurbePaquete = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 3: Ejecutar**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 4: Medir con el federado** (dato para el spec, no es prueba)

```bash
node -e "const P=require('./js/modelo-paquete.js');const d=JSON.parse(require('fs').readFileSync('PZA-MODELO-FEDERADO-eurbe.json','utf8'));const t=Date.now();P.empaquetar(d).then(p=>console.log('trozos',p.trozos.length,'MB',(p.bytes/1048576).toFixed(2),'ms',Date.now()-t))"
```

Expected: unos 4-6 MB y 5-7 trozos. Anota el resultado en el mensaje del commit. Si pasa de 20 MB, detente y avisa: cambia el cálculo de espacio del spec.

- [ ] **Step 5: Commit**

```bash
git add js/modelo-paquete.js tests/unit/modelo-paquete.test.mjs
git commit -m "Paquete del modelo: gzip, trozos de 900 KB y huella SHA-256 (federado: <N> trozos, <X> MB)"
```

---

### Task 6: App en la nube: entrada, obras, carga del modelo una sola vez

La tarea más grande: `index.html`, `nube.js` (parte de sesión, obras y modelos), `cache-modelo.js` y `ui-nube.js` (arranque). Al terminar se puede entrar, crear una obra, subir un modelo y reabrirlo desde la caché. Los cortes todavía no van a la nube (Task 7).

**Files:**
- Create: `firebase-config.js`, `js/nube.js`, `js/cache-modelo.js`, `js/ui-nube.js`, `.tools/crear_index.py`
- Replace: `index.html` (hoy es la redirección temporal; pasa a ser la copia de `eurbe.html` con ganchos)

**Interfaces:**
- Consumes: `EurbePaquete.*` (Task 5), `EurbeCortes.elementosFaltantes`, `EurbeCortes.separar` (Task 4), `esc` (Task 1).
- Produces `window.Nube` (en esta tarea):
  - `iniciar(config)`; `usuario() → {email, emailVerified} | null`; `alCambiarSesion(cb(user|null))`
  - `entrar(correo, clave)`, `crearCuenta(correo, clave)` (envía verificación), `reenviarVerificacion()`, `recuperarClave(correo)`, `salir()`
  - `miAcceso() → Promise<{rol, nombre, activo} | null>`
  - `listarObras() → Promise<Array<{id, nombre, modeloVigente, contadorCortes}>>`; `crearObra(nombre) → Promise<string>`
  - `leerVersion(obraId, versionId) → Promise<meta>`, donde meta es `{id, archivoOriginal, fecha, subidoPor, nElementos, bytesComprimidos, nTrozos, huella, paramMap}`
  - `descargarTrozos(obraId, meta, onProgreso(0..1)) → Promise<Uint8Array[]>`
  - `subirVersion(obraId, paquete, info:{archivoOriginal, nElementos, paramMap}, onProgreso) → Promise<versionId>`
  - `escucharObra(obraId, cb(obra)) → unsubscribe`
  - `enLinea() → boolean`
  - `traducirError(err) → string` (mensaje para la usuaria)
- Produces `window.CacheModelo`: `leer(obraId, versionId, huella) → Promise<Uint8Array|null>`, `guardar(obraId, versionId, huella, comprimido)`, `podar(obraId, versionIdVigente)`.
- Produces `window.SESION = {correo, rol, nombre, obraId, obraNombre, versionId, obraVersionCargada, soloLectura}` y las globales `entregarModelo(data)` y `alModeloCargado()`.

- [ ] **Step 1: `firebase-config.js` (emuladores por ahora)**

```js
// Configuracion web de Firebase. Es publica por diseño: la seguridad la ponen
// las reglas de Firestore y el inicio de sesion. Los valores reales se ponen al
// crear el proyecto (Task 13). Con 'demo-eurbe' solo funciona contra emuladores.
window.EURBE_FIREBASE_CONFIG = {
  apiKey: 'demo-key',
  authDomain: 'demo-eurbe.firebaseapp.com',
  projectId: 'demo-eurbe',
};
// Version del SDK compat cargado desde gstatic en index.html
window.EURBE_FIREBASE_SDK = '12.19.0';
```

- [ ] **Step 2: `js/cache-modelo.js`**

```js
// Copia local del modelo comprimido en IndexedDB, para no descargarlo en cada
// apertura. Clave: obraId. Si algo falla (modo privado, cuota), se comporta
// como si no hubiera copia: la app descarga de nuevo.
(function () {
  const BD = 'eurbe', ALMACEN = 'modelos';

  function abrir() {
    return new Promise((ok, mal) => {
      const r = indexedDB.open(BD, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
  }
  function op(modo, fn) {
    return abrir().then(db => new Promise((ok, mal) => {
      const tx = db.transaction(ALMACEN, modo);
      const req = fn(tx.objectStore(ALMACEN));
      tx.oncomplete = () => { db.close(); ok(req && req.result); };
      tx.onerror = () => { db.close(); mal(tx.error); };
    }));
  }

  async function leer(obraId, versionId, huella) {
    try {
      const v = await op('readonly', s => s.get(obraId));
      return (v && v.versionId === versionId && v.huella === huella) ? v.comprimido : null;
    } catch (e) { return null; }
  }
  async function guardar(obraId, versionId, huella, comprimido) {
    // Un solo registro por obra: guardar la version vigente ya poda la anterior
    try { await op('readwrite', s => s.put({ versionId, huella, comprimido, fecha: Date.now() }, obraId)); }
    catch (e) { console.warn('No se pudo guardar la copia local del modelo', e); }
  }
  async function leerCualquiera(obraId) {
    try { return (await op('readonly', s => s.get(obraId))) || null; } catch (e) { return null; }
  }
  // Con un registro por obra no hay nada extra que borrar; se deja por contrato.
  async function podar() {}

  window.CacheModelo = { leer, guardar, leerCualquiera, podar };
})();
```

Nota: `leerCualquiera(obraId) → {versionId, huella, comprimido} | null` lo usa el modo sin conexión (Task 11).

- [ ] **Step 3: `js/nube.js` (sesión, accesos, obras, modelos)**

```js
// Todo el acceso a Firebase. Sin DOM. Usa el SDK compat (window.firebase).
(function () {
  let auth, db, online = true;

  function iniciar(cfg) {
    if (!window.firebase) throw Object.assign(new Error('sdk'), { code: 'sin-sdk' });
    firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
    if (['localhost', '127.0.0.1'].includes(location.hostname)) {
      auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
      db.useEmulator('127.0.0.1', 8080);
    }
    // Cache local de lecturas: permite ver cortes sin conexion (solo lectura).
    // Las escrituras de cortes van por transaccion, que nunca se encola offline.
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    window.addEventListener('online', () => { online = true; });
    window.addEventListener('offline', () => { online = false; });
    online = navigator.onLine;
  }

  const correoDe = u => (u && u.email || '').toLowerCase();
  const usuario = () => auth && auth.currentUser;
  const alCambiarSesion = cb => auth.onAuthStateChanged(cb);
  const entrar = (c, k) => auth.signInWithEmailAndPassword(c.trim().toLowerCase(), k);
  async function crearCuenta(c, k) {
    const r = await auth.createUserWithEmailAndPassword(c.trim().toLowerCase(), k);
    await r.user.sendEmailVerification();
    return r.user;
  }
  const reenviarVerificacion = () => auth.currentUser.sendEmailVerification();
  const recuperarClave = c => auth.sendPasswordResetEmail(c.trim().toLowerCase());
  const salir = () => auth.signOut();

  async function miAcceso() {
    const s = await db.doc('accesos/' + correoDe(usuario())).get();
    return s.exists ? s.data() : null;
  }

  async function listarObras() {
    const q = await db.collection('obras').orderBy('nombre').get();
    return q.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async function crearObra(nombre) {
    const ref = db.collection('obras').doc();
    await ref.set({ nombre: nombre.trim(), modeloVigente: null, contadorCortes: 0,
                    creadaPor: correoDe(usuario()), fecha: new Date().toISOString() });
    return ref.id;
  }
  function escucharObra(obraId, cb) {
    return db.doc('obras/' + obraId).onSnapshot(s => cb({ id: s.id, ...s.data() }));
  }

  async function leerVersion(obraId, versionId) {
    const s = await db.doc(`obras/${obraId}/modelos/${versionId}`).get();
    return { id: s.id, ...s.data() };
  }
  async function descargarTrozos(obraId, meta, onProgreso) {
    const out = [];
    for (let i = 0; i < meta.nTrozos; i++) {
      const s = await db.doc(`obras/${obraId}/modelos/${meta.id}/trozos/${i}`).get({ source: 'server' });
      out.push(s.data().datos.toUint8Array());
      onProgreso && onProgreso((i + 1) / meta.nTrozos);
    }
    return out;
  }
  // Orden: trozos -> metadatos -> modeloVigente. Si se corta a mitad, la obra
  // sigue apuntando a la version anterior y nadie ve un modelo incompleto.
  async function subirVersion(obraId, paquete, info, onProgreso) {
    const ref = db.collection(`obras/${obraId}/modelos`).doc();
    for (let i = 0; i < paquete.trozos.length; i++) {
      await ref.collection('trozos').doc(String(i))
        .set({ datos: firebase.firestore.Blob.fromUint8Array(paquete.trozos[i]) });
      onProgreso && onProgreso((i + 1) / (paquete.trozos.length + 1));
    }
    await ref.set({ archivoOriginal: info.archivoOriginal, fecha: new Date().toISOString(),
      subidoPor: correoDe(usuario()), nElementos: info.nElementos, bytesComprimidos: paquete.bytes,
      nTrozos: paquete.trozos.length, huella: paquete.huella, paramMap: info.paramMap });
    await db.doc('obras/' + obraId).update({ modeloVigente: ref.id });
    onProgreso && onProgreso(1);
    return ref.id;
  }

  function traducirError(e) {
    const c = (e && e.code) || '';
    if (c === 'sin-sdk') return 'No se pudo conectar con el servicio de datos. Puede que la red lo esté bloqueando.';
    if (c === 'huella') return e.message;
    if (c.includes('resource-exhausted')) return 'Límite diario del plan gratuito alcanzado; vuelve a estar disponible mañana.';
    if (c.includes('permission-denied')) return 'No tienes permiso para esta acción.';
    if (c.includes('unavailable') || c.includes('network')) return 'Sin conexión con el servicio de datos.';
    if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found')
      return 'Correo o contraseña incorrectos.';
    if (c === 'auth/email-already-in-use') return 'Ese correo ya tiene cuenta. Usa «Entrar» o «Olvidé mi contraseña».';
    if (c === 'auth/weak-password') return 'La contraseña debe tener al menos 6 caracteres.';
    if (c === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos.';
    return 'Error: ' + ((e && e.message) || e);
  }

  window.Nube = { iniciar, usuario, alCambiarSesion, entrar, crearCuenta, reenviarVerificacion,
    recuperarClave, salir, miAcceso, listarObras, crearObra, escucharObra, leerVersion,
    descargarTrozos, subirVersion, traducirError, correoDe, enLinea: () => online,
    _db: () => db };
})();
```

- [ ] **Step 4: Crear `index.html` a partir de `eurbe.html`**

`.tools/crear_index.py`:

```python
import io
c = io.open('eurbe.html', encoding='utf-8').read()

def rep(old, new, count=1):
    global c
    assert c.count(old) == count, (old[:70], c.count(old))
    c = c.replace(old, new)

# Scripts de la nube: SDK compat + modulos propios, antes del script principal
rep('<script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>',
'''<script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
<script src="firebase-config.js"></script>
<script src="https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/12.19.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-compat.js"></script>
<script src="js/texto.js"></script>
<script src="js/cortes-logica.js"></script>
<script src="js/modelo-paquete.js"></script>
<script src="js/cache-modelo.js"></script>
<script src="js/nube.js"></script>''')

# La pantalla de carga ya no es la de inicio: arranca oculta
rep('<div id="load-screen">', '<div id="load-screen" style="display:none">')

# Pantallas nuevas justo despues de <body>
rep('<body>\n', '''<body>
<div id="nube-screen" class="nube-screen">
  <div class="nube-box" id="nube-box"></div>
</div>
''')

# Ganchos: el modelo cargado desde archivo pasa por entregarModelo (sube si es admin)
rep("""      data.elements = applyJSONMapping(els);
      loadModel(data);""", """      data.elements = applyJSONMapping(els);
      data.meta = Object.assign({}, data.meta, { sourceFile: (data.meta && data.meta.sourceFile) || file.name });
      entregarModelo(data);""")
rep("""  loadModel({ meta:{ schema:'IFC', totalElements:elements.length, generatedAt:new Date().toISOString(), sourceFile:filename }, bbox, elements });""",
"""  entregarModelo({ meta:{ schema:'IFC', totalElements:elements.length, generatedAt:new Date().toISOString(), sourceFile:filename }, bbox, elements });""")
rep("""    loadCutsFromStorage();
    renderHistory();""", """    if (window.alModeloCargado) window.alModeloCargado();
    renderHistory();""")

# Hueco para el menu Obra y el usuario, a la derecha de la cabecera
rep("""      <span id="project-meta">— elementos</span>
    </div>""", """      <span id="project-meta">— elementos</span>
    </div>
    <div id="nube-cabecera" class="nube-cabecera"></div>""")

# Estilos de las pantallas nuevas (antes de </style> del head)
i = c.index('</style>')
c = c[:i] + '''
/* ── Nube: pantallas de entrada/obra y cabecera ── */
.nube-screen { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: var(--c-bg2, #f4f5f8); z-index: 50; }
.nube-box { width: min(420px, calc(100vw - 32px)); background: #fff; border-radius: 12px;
  padding: 28px; box-shadow: 0 8px 30px rgba(0,0,0,.08); font-size: 13px; }
.nube-box h2 { margin: 0 0 4px; font-size: 18px; }
.nube-box .sub { color: #778; margin: 0 0 18px; }
.nube-box label { display: block; font-size: 11px; color: #667; margin: 10px 0 4px; }
.nube-box input, .nube-box select { width: 100%; box-sizing: border-box; padding: 9px 10px;
  border: 1px solid #d5d7de; border-radius: 6px; font-size: 13px; }
.nube-box .fila { display: flex; gap: 8px; margin-top: 16px; }
.nube-box .fila .btn { flex: 1; }
.nube-box .enlace { background: none; border: 0; color: #3A7FC1; cursor: pointer; padding: 0; font-size: 12px; }
.nube-box .error { color: #c0392b; margin-top: 10px; min-height: 1em; }
.nube-box .nota { color: #99a; font-size: 11px; margin-top: 18px; text-align: center; }
.nube-box .obra-item { display: block; width: 100%; text-align: left; margin: 6px 0; }
.nube-cabecera { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 12px; }
.nube-cabecera .rol { color: #778; }
.nube-menu { position: absolute; right: 12px; top: 52px; background: #fff; border: 1px solid #e0e2e8;
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.1); z-index: 40; min-width: 240px; }
.nube-menu button { display: block; width: 100%; text-align: left; padding: 10px 14px; background: none;
  border: 0; cursor: pointer; font-size: 13px; }
.nube-menu button:hover { background: #f4f6fa; }
.aviso-nube { position: fixed; left: 50%; transform: translateX(-50%); top: 10px; z-index: 60;
  background: #FFF4EA; border: 1px solid #F5892A; color: #7a4210; padding: 8px 14px; border-radius: 8px;
  font-size: 12px; display: flex; gap: 10px; align-items: center; }
''' + c[i:]

# ui-nube.js al final, despues del script principal
rep('</body>', '<script src="js/ui-nube.js"></script>\n</body>')

io.open('index.html', 'w', encoding='utf-8', newline='').write(c)
print('ok')
```

Run: `python .tools/crear_index.py`
Expected: `ok`.

Antes de ejecutarlo, comprueba que `index.html` hoy es solo la redirección: `wc -c index.html` debe dar menos de 1 KB. El script la reemplaza.

- [ ] **Step 5: `js/ui-nube.js` (arranque, entrada, obra, carga y subida)**

```js
// Orquesta la version en la nube: entrada -> obra -> modelo -> visor.
// Solo usa globales existentes de index.html (STATE, PARAM_MAP, loadModel,
// showMappingScreen…) y los modulos Nube, CacheModelo, EurbePaquete, EurbeCortes.
(function () {
  const SESION = window.SESION = {
    correo: '', rol: '', nombre: '', obraId: '', obraNombre: '',
    versionId: '', obraVersionCargada: '', soloLectura: false, subiendo: false,
  };
  const $ = id => document.getElementById(id);
  const pantalla = html => { $('nube-box').innerHTML = html; $('nube-screen').style.display = 'flex'; };
  const ocultarPantalla = () => { $('nube-screen').style.display = 'none'; };
  const LOGO = () => {
    const img = document.querySelector('#header img');
    return img ? `<img src="${img.src}" style="height:34px;margin-bottom:14px" alt="Ingeurbe">` : '';
  };

  // ── Entrada ──
  function pantallaEntrada(msg) {
    pantalla(`${LOGO()}
      <h2>E-Urbe · Cortes de obra</h2>
      <p class="sub">Entra con tu correo de Ingeurbe.</p>
      <label>Correo</label><input id="n-correo" type="email" autocomplete="username">
      <label>Contraseña</label><input id="n-clave" type="password" autocomplete="current-password">
      <div class="fila">
        <button class="btn btn-primary" id="n-entrar">Entrar</button>
        <button class="btn btn-secondary" id="n-crear" title="Primer ingreso">Crear mi contraseña</button>
      </div>
      <p style="margin-top:10px"><button class="enlace" id="n-olvido">Olvidé mi contraseña</button></p>
      <div class="error" id="n-error">${esc(msg || '')}</div>
      <p class="nota">Inicio con cuenta Microsoft: próximamente.</p>`);
    const leer = () => [$('n-correo').value, $('n-clave').value];
    const fallo = e => { $('n-error').textContent = Nube.traducirError(e); };
    $('n-entrar').onclick = () => Nube.entrar(...leer()).catch(fallo);
    $('n-clave').onkeydown = e => { if (e.key === 'Enter') $('n-entrar').click(); };
    $('n-crear').onclick = () => Nube.crearCuenta(...leer()).catch(fallo);
    $('n-olvido').onclick = () => {
      const c = $('n-correo').value;
      if (!c) { $('n-error').textContent = 'Escribe primero tu correo.'; return; }
      Nube.recuperarClave(c).then(() => { $('n-error').textContent = 'Te enviamos un correo para cambiar la contraseña.'; }).catch(fallo);
    };
  }

  function pantallaVerificar(correo) {
    pantalla(`${LOGO()}<h2>Confirma tu correo</h2>
      <p class="sub">Te enviamos un enlace a <b>${esc(correo)}</b>. Ábrelo y luego pulsa «Ya lo confirmé».</p>
      <div class="fila">
        <button class="btn btn-primary" id="n-ya">Ya lo confirmé</button>
        <button class="btn btn-secondary" id="n-reenviar">Reenviar</button>
      </div>
      <p style="margin-top:10px"><button class="enlace" id="n-salir">Salir</button></p>
      <div class="error" id="n-error"></div>`);
    $('n-ya').onclick = async () => {
      await Nube.usuario().reload();
      await Nube.usuario().getIdToken(true);   // el token debe llevar email_verified
      trasSesion(Nube.usuario());
    };
    $('n-reenviar').onclick = () => Nube.reenviarVerificacion()
      .then(() => { $('n-error').textContent = 'Reenviado.'; })
      .catch(e => { $('n-error').textContent = Nube.traducirError(e); });
    $('n-salir').onclick = () => Nube.salir();
  }

  function pantallaSinAcceso(correo) {
    pantalla(`${LOGO()}<h2>Sin acceso</h2>
      <p class="sub">No tienes acceso a E-Urbe, pídelo al administrador.<br><small>${esc(correo)}</small></p>
      <button class="btn btn-secondary" id="n-salir">Salir</button>`);
    $('n-salir').onclick = () => Nube.salir();
  }

  async function trasSesion(user) {
    if (!user) { pantallaEntrada(); return; }
    SESION.correo = Nube.correoDe(user);
    if (!user.emailVerified) { pantallaVerificar(SESION.correo); return; }
    let acc;
    try { acc = await Nube.miAcceso(); }
    catch (e) { pantallaEntrada(Nube.traducirError(e)); return; }
    if (!acc || !acc.activo) { pantallaSinAcceso(SESION.correo); return; }
    SESION.rol = acc.rol; SESION.nombre = acc.nombre || SESION.correo;
    elegirObra();
  }

  // ── Obra ──
  async function elegirObra() {
    let obras;
    try { obras = await Nube.listarObras(); }
    catch (e) { pantallaEntrada(Nube.traducirError(e)); return; }
    const ultima = (() => { try { return localStorage.getItem('eurbe_ultima_obra'); } catch (e) { return null; } })();
    // La ultima obra abierta se reabre directo («Cambiar de obra» borra esa
    // preferencia). Con una sola obra tambien se salta, salvo el admin, que
    // necesita esta pantalla para crear obras.
    const pre = obras.find(o => o.id === ultima);
    if (pre) return abrirObra(pre);
    if (obras.length === 1 && SESION.rol !== 'admin') return abrirObra(obras[0]);
    pantalla(`${LOGO()}<h2>Elige la obra</h2>
      <p class="sub">${esc(SESION.nombre)} · ${esc(SESION.rol)}</p>
      <div id="n-obras">${obras.length ? obras.map(o => `
        <button class="btn btn-secondary obra-item" data-id="${esc(o.id)}">
          ${o.id === ultima ? '★ ' : ''}${esc(o.nombre)}${o.modeloVigente ? '' : ' <small>(sin modelo)</small>'}
        </button>`).join('') : '<p class="sub">Aún no hay obras.</p>'}</div>
      ${SESION.rol === 'admin' ? `<label>Nueva obra</label><input id="n-nueva" placeholder="Ej: PZA Torres">
        <div class="fila"><button class="btn btn-primary" id="n-crear-obra">Crear obra</button></div>` : ''}
      <p style="margin-top:12px"><button class="enlace" id="n-salir">Salir</button></p>
      <div class="error" id="n-error"></div>`);
    document.querySelectorAll('#n-obras [data-id]').forEach(b => {
      b.onclick = () => abrirObra(obras.find(o => o.id === b.dataset.id));
    });
    $('n-salir').onclick = () => Nube.salir();
    if ($('n-crear-obra')) $('n-crear-obra').onclick = async () => {
      const n = $('n-nueva').value.trim();
      if (!n) return;
      try { await Nube.crearObra(n); elegirObra(); }
      catch (e) { $('n-error').textContent = Nube.traducirError(e); }
    };
  }

  function progreso(texto, frac) {
    pantalla(`${LOGO()}<h2>${esc(SESION.obraNombre)}</h2><p class="sub">${esc(texto)}</p>
      <div style="height:6px;background:#eef;border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${Math.round((frac || 0) * 100)}%;background:#3A7FC1"></div></div>`);
  }

  async function abrirObra(obra) {
    SESION.obraId = obra.id; SESION.obraNombre = obra.nombre;
    try { localStorage.setItem('eurbe_ultima_obra', obra.id); } catch (e) {}
    if (!obra.modeloVigente) {
      if (SESION.rol === 'admin') { iniciarSubida(); return; }
      pantalla(`${LOGO()}<h2>${esc(obra.nombre)}</h2>
        <p class="sub">Esta obra aún no tiene modelo. El administrador debe cargarlo.</p>
        <button class="btn btn-secondary" id="n-volver">Volver</button>`);
      $('n-volver').onclick = elegirObra;
      return;
    }
    try {
      const meta = await Nube.leerVersion(obra.id, obra.modeloVigente);
      const data = await obtenerModelo(obra.id, meta);
      Object.assign(PARAM_MAP, meta.paramMap || {});
      SESION.versionId = meta.id; SESION.obraVersionCargada = meta.id;
      try { localStorage.setItem('eurbe_ultima_version', JSON.stringify(
        { obraId: obra.id, obraNombre: obra.nombre, versionId: meta.id, huella: meta.huella, paramMap: meta.paramMap })); } catch (e) {}
      ocultarPantalla();
      data.meta = Object.assign({}, data.meta, { sourceFile: obra.nombre + ' · ' + (meta.archivoOriginal || '') });
      loadModel(data);
      vigilarVersion(obra.id);
    } catch (e) {
      pantalla(`${LOGO()}<h2>${esc(obra.nombre)}</h2><p class="sub">${esc(Nube.traducirError(e))}</p>
        <button class="btn btn-secondary" id="n-volver">Volver</button>`);
      $('n-volver').onclick = elegirObra;
    }
  }

  // Copia local si coincide la huella; si no, descarga (un reintento si la huella falla)
  async function obtenerModelo(obraId, meta) {
    const local = await CacheModelo.leer(obraId, meta.id, meta.huella);
    if (local) {
      progreso('Abriendo copia guardada…', 1);
      return EurbePaquete.desempaquetar([local], meta.huella);
    }
    for (let intento = 1; ; intento++) {
      const trozos = await Nube.descargarTrozos(obraId, meta, f => progreso('Descargando modelo…', f));
      try {
        const data = await EurbePaquete.desempaquetar(trozos, meta.huella);
        await CacheModelo.guardar(obraId, meta.id, meta.huella, EurbePaquete.unir(trozos));
        return data;
      } catch (e) {
        if (e.code !== 'huella' || intento >= 2) throw e;
      }
    }
  }

  // Aviso de version nueva mientras la app esta abierta (no se cambia sola)
  let dejarDeVigilar = null;
  function vigilarVersion(obraId) {
    if (dejarDeVigilar) dejarDeVigilar();
    dejarDeVigilar = Nube.escucharObra(obraId, obra => {
      if (!obra.modeloVigente || obra.modeloVigente === SESION.obraVersionCargada || SESION.subiendo) return;
      if (document.querySelector('.aviso-nube')) return;
      const d = document.createElement('div');
      d.className = 'aviso-nube';
      d.innerHTML = 'Hay una versión nueva del modelo <button class="btn btn-primary btn-sm">Recargar</button>';
      d.querySelector('button').onclick = () => location.reload();
      document.body.appendChild(d);
    });
  }

  // ── Subir version (admin) ──
  function iniciarSubida() {
    SESION.subiendo = true;
    ocultarPantalla();
    $('app').style.display = 'none';
    $('load-screen').style.display = 'flex';
    // El mapeo anterior queda precargado porque PARAM_MAP ya lo contiene
  }

  // Gancho llamado por index.html al terminar la lectura/mapeo de un archivo
  window.entregarModelo = async function (data) {
    if (!SESION.subiendo || SESION.rol !== 'admin') { loadModel(data); return; }
    const ids = new Set(data.elements.map(e => e.globalId));
    const faltan = EurbeCortes.elementosFaltantes(EurbeCortes.separar(STATE.cuts).activos, ids);
    if (faltan.length && !confirm('En esta versión faltan elementos de cortes existentes:\n\n' +
        faltan.map(f => `· ${f.number}: ${f.faltan} elemento(s)`).join('\n') +
        '\n\nEsos elementos seguirán en los cortes pero no se verán en el 3D ni sumarán cantidades. ¿Publicar igual?')) {
      location.reload(); return;
    }
    try {
      $('load-screen').style.display = 'none';
      progreso('Comprimiendo modelo…', 0);
      const paquete = await EurbePaquete.empaquetar(data);
      const versionId = await Nube.subirVersion(SESION.obraId, paquete,
        { archivoOriginal: (data.meta && data.meta.sourceFile) || '', nElementos: data.elements.length,
          paramMap: Object.assign({}, PARAM_MAP) },
        f => progreso(`Subiendo modelo (${(paquete.bytes / 1048576).toFixed(2)} MB)…`, f));
      await CacheModelo.guardar(SESION.obraId, versionId, paquete.huella, EurbePaquete.unir(paquete.trozos));
      location.reload();   // reabre limpio con la version vigente desde la cache
    } catch (e) {
      alert('No se pudo publicar el modelo.\n\n' + Nube.traducirError(e));
      location.reload();
    }
  };

  // Gancho llamado por loadModel al terminar de construir la escena
  window.alModeloCargado = function () {
    pintarCabecera();
    if (window.alModeloCargadoCortes) window.alModeloCargadoCortes();
  };

  // ── Cabecera: usuario y menu Obra ──
  function pintarCabecera() {
    const cab = $('nube-cabecera');
    cab.innerHTML = `<span>${esc(SESION.nombre)} <span class="rol">· ${esc(SESION.rol)}</span></span>
      <button class="btn btn-secondary btn-sm" id="n-menu">Obra ▾</button>`;
    $('n-menu').onclick = ev => { ev.stopPropagation(); abrirMenu(); };
  }
  function abrirMenu() {
    cerrarMenu();
    const m = document.createElement('div');
    m.className = 'nube-menu'; m.id = 'n-menu-lista';
    const op = (txt, fn, soloAdmin) => (soloAdmin && SESION.rol !== 'admin') ? '' :
      `<button data-op="${fn}">${txt}</button>`;
    m.innerHTML = op('⇄ Cambiar de obra', 'cambiar') +
      op('⬆ Subir nueva versión del modelo', 'subir', true) +
      op('👥 Gestionar accesos', 'accesos', true) +
      op('📥 Importar cortes', 'importar', true) +
      op('⎋ Salir', 'salir');
    m.onclick = ev => {
      const o = ev.target.dataset.op; if (!o) return;
      cerrarMenu();
      if (o === 'cambiar') { try { localStorage.removeItem('eurbe_ultima_obra'); } catch (e) {} location.reload(); }
      if (o === 'subir') iniciarSubida();
      if (o === 'accesos' && window.abrirAccesos) window.abrirAccesos();
      if (o === 'importar' && window.abrirImportacion) window.abrirImportacion();
      if (o === 'salir') Nube.salir().then(() => location.reload());
    };
    document.body.appendChild(m);
    setTimeout(() => document.addEventListener('click', cerrarMenu, { once: true }), 0);
  }
  function cerrarMenu() { const m = $('n-menu-lista'); if (m) m.remove(); }

  // ── Arranque ──
  function arrancar() {
    try { Nube.iniciar(window.EURBE_FIREBASE_CONFIG); }
    catch (e) {
      if (window.modoSinConexion) return window.modoSinConexion(Nube.traducirError(e));
      pantalla(`${LOGO()}<h2>E-Urbe</h2><p class="sub">${esc(Nube.traducirError(e))}</p>`);
      return;
    }
    let primera = true;
    Nube.alCambiarSesion(u => {
      // Tras la primera resolucion, un cambio de sesion (salir) recarga limpio
      if (!primera) { if (!u) location.reload(); return; }
      primera = false;
      trasSesion(u);
    });
  }
  window.UINube = { SESION, elegirObra, abrirObra, iniciarSubida, pantalla, progreso, LOGO };
  arrancar();
})();
```

Nota de diseño: «Cambiar de obra» borra la preferencia y recarga, porque `loadModel` inicializa la escena una sola vez. Recargar es la forma segura de cambiar de modelo.

- [ ] **Step 6: Sintaxis de todo**

```bash
python -c "import re;c=open('index.html',encoding='utf-8').read();open('.tools/app.js','w',encoding='utf-8').write(max(re.findall(r'<script>(.*?)</script>',c,re.S),key=len))" && node --check .tools/app.js && for f in js/*.js firebase-config.js; do node --check "$f" || exit 1; done && npm run test:unit && echo OK
```

Expected: `OK`.

- [ ] **Step 7: Verificación manual con emuladores**

Terminal 1: `export PATH="$PWD/.tools/jdk/bin:$PATH"; npm run emuladores`
Terminal 2: `npm run servir`

Siembra el primer admin. El emulador acepta `Bearer owner` como administrador:

```bash
curl -s -X POST -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-eurbe/accounts" \
  -d '{"email":"admin@ingeurbe.com","password":"clave123","emailVerified":true}'
curl -s -X PATCH -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  "http://127.0.0.1:8080/v1/projects/demo-eurbe/databases/(default)/documents/accesos/admin@ingeurbe.com" \
  -d '{"fields":{"rol":{"stringValue":"admin"},"nombre":{"stringValue":"Admin"},"activo":{"booleanValue":true}}}'
```

Guarda estos dos comandos como `.tools/sembrar.sh`; los reutilizan las Tasks 7-12.

Abre `http://localhost:5173/` y comprueba:
- Aparece la pantalla de entrada E-Urbe, con la nota de Microsoft y sin logos de Microsoft.
- Entra como admin. Crea la obra «Prueba». Ábrela y aparece la pantalla de carga.
- Carga `model.json`. Aparece el mapeo; confírmalo. Se ve «Subiendo modelo…» y, tras recargar, el visor con 1.320 elementos.
- Recarga (F5). Abre con «Abriendo copia guardada…» y **sin** pantalla de carga.
- En DevTools → Network, recargar no descarga trozos.
- Menú «Obra ▾» → «Subir nueva versión»: el mapeo aparece precargado.
- Con dos pestañas: sube una versión en una y en la otra aparece «Hay una versión nueva del modelo · Recargar».

- [ ] **Step 8: Commit**

```bash
git add index.html firebase-config.js js/nube.js js/cache-modelo.js js/ui-nube.js
git commit -m "App en la nube: entrada, obras y modelo cargado una vez con copia local"
```

---

### Task 7: Cortes en la nube (registro, estados, anular, en vivo)

**Files:**
- Modify: `js/nube.js` (añadir cortes), `index.html` (`registerCut`, `cambiarEstadoCorte`, `deleteCut`, `renderHistory`, `saveCutsToStorage`, `loadCutsFromStorage`, `updateCutForm`)
- Create: `js/cortes-nube.js` (enlace entre la UI de cortes y `Nube`)

**Interfaces:**
- Consumes: `EurbeCortes.*` (Task 4), `SESION` (Task 6), `window.alModeloCargadoCortes` (gancho de la Task 6).
- Produces en `Nube`:
  - `escucharCortes(obraId, cb(cortes: Array<corte con id>, {desdeCache: boolean})) → unsubscribe`
  - `registrarCorte(obraId, datos) → Promise<{id, number}>` (transacción; `datos` sin `numeroSec`, `number`, `estado`, `historial`, `creadoPor`, `ultimoCambio`)
  - `cambiarEstado(obraId, corteId, nuevo, motivo?) → Promise<void>` (transacción: lee el historial actual y añade uno)
- Produces en `STATE`: `STATE.cuts` = solo activos; `STATE.cutsAnulados` = anulados.

- [ ] **Step 1: Ampliar `js/nube.js`**

Añade dentro del IIFE, antes de `window.Nube = …`, y agrega los tres nombres al objeto exportado:

```js
  function escucharCortes(obraId, cb) {
    return db.collection(`obras/${obraId}/cortes`).orderBy('numeroSec')
      .onSnapshot({ includeMetadataChanges: true }, q => {
        online = !q.metadata.fromCache;
        cb(q.docs.map(d => ({ id: d.id, ...d.data() })), { desdeCache: q.metadata.fromCache });
      });
  }

  // Transaccion: numero siguiente + corte. Las transacciones no se encolan sin
  // conexion: si no hay red, falla y no queda un registro pendiente.
  function registrarCorte(obraId, datos) {
    const yo = correoDe(usuario()), ahora = new Date().toISOString();
    const obraRef = db.doc('obras/' + obraId);
    return db.runTransaction(async tx => {
      const n = ((await tx.get(obraRef)).data().contadorCortes || 0) + 1;
      const number = EurbeCortes.numeroCorte(n);
      tx.update(obraRef, { contadorCortes: n });
      tx.set(db.doc(`obras/${obraId}/cortes/n${n}`), Object.assign({}, datos, {
        numeroSec: n, number, estado: 'revision', creadoPor: yo,
        historial: [{ estado: 'revision', por: yo, fecha: ahora }],
        ultimoCambio: firebase.firestore.FieldValue.serverTimestamp(),
      }));
      return { id: 'n' + n, number };
    });
  }

  function cambiarEstado(obraId, corteId, nuevo, motivo) {
    const yo = correoDe(usuario());
    const ref = db.doc(`obras/${obraId}/cortes/${corteId}`);
    return db.runTransaction(async tx => {
      const actual = (await tx.get(ref)).data();
      const entrada = { estado: nuevo, por: yo, fecha: new Date().toISOString() };
      if (motivo) entrada.motivo = motivo;
      const cambio = { estado: nuevo, historial: [...(actual.historial || []), entrada],
        ultimoCambio: firebase.firestore.FieldValue.serverTimestamp() };
      if (nuevo === 'anulado') { cambio.anuladoPor = yo; cambio.motivoAnulacion = motivo; }
      tx.update(ref, cambio);
    });
  }
```

- [ ] **Step 2: `js/cortes-nube.js`**

```js
// Conecta la UI de cortes existente (index.html) con Firestore.
(function () {
  const S = () => window.SESION;
  let dejar = null;
  window.mostrarAnulados = false;

  window.alModeloCargadoCortes = function () {
    if (dejar) dejar();
    dejar = Nube.escucharCortes(S().obraId, (cortes, info) => {
      const { activos, anulados } = EurbeCortes.separar(cortes);
      STATE.cuts = activos;
      STATE.cutsAnulados = anulados;
      S().soloLectura = info.desdeCache && !navigator.onLine;
      rebuildCutIndex();
      refreshAllColors();
      renderHistory();
      updateCutForm();
      if (document.getElementById('tab-avance')?.classList.contains('active')) renderDashboard();
      if (document.getElementById('tab-pendientes')?.classList.contains('active')) renderPendientes();
      window.pintarAvisoConexion && window.pintarAvisoConexion();
    });
  };

  window.registerCut = async function () {
    if (STATE.selected.size === 0) return;
    if (!['admin', 'registrador'].includes(S().rol)) { notify('Tu rol es de consulta: no puedes registrar cortes.'); return; }
    if (S().soloLectura) { notify('Sin conexión — no se pueden registrar cortes'); return; }
    const ids = [...STATE.selected];
    const dup = EurbeCortes.enOtrosCortes(ids, STATE.cuts);
    if (dup.length && !confirm(dup.map(d => `${d.cuantos} elemento(s) ya están en el ${d.number}`).join('\n') +
        '\n\n¿Registrar igual?')) return;

    const els = ids.map(g => STATE.elements.find(e => e.globalId === g)).filter(Boolean);
    const qtyByUnit = {};
    els.forEach(el => { if (el.cantidad != null) qtyByUnit[el.unidad] = (qtyByUnit[el.unidad] || 0) + el.cantidad; });
    const unir = k => [...new Set(els.map(e => e[k]))].filter(Boolean).join(' / ');
    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    try {
      const r = await Nube.registrarCorte(S().obraId, {
        date: document.getElementById('cut-date-input').value,
        notes: document.getElementById('cut-notes-input').value.trim(),
        elementIds: ids, totalElements: ids.length, qtyByUnit,
        actividad: unir('actividad'), nivel: unir('nivel'), edificacion: unir('edificacion'),
        descGrupo: unir('descGrupo'), registeredAt: new Date().toISOString(),
        modeloVersion: S().versionId,
      });
      STATE.selected.clear();
      document.getElementById('cut-notes-input').value = '';
      document.getElementById('cut-date-input').value = '';
      updatePropsPanel();
      notify(`✔ ${r.number} registrado — ${ids.length} elementos`);
      setStatusBar(`${r.number} registrado correctamente.`);
    } catch (e) {
      alert('No se registró el corte.\n\n' + Nube.traducirError(e));
    } finally { btn.disabled = false; }
  };

  window.cambiarEstadoCorte = async function (cutId, estado) {
    if (!estado) return;
    let motivo;
    if (estado === 'anulado') {
      motivo = (prompt('Motivo de la anulación (obligatorio):') || '').trim();
      if (motivo.length < 3) { notify('Anulación cancelada: el motivo es obligatorio.'); renderHistory(); return; }
    }
    try { await Nube.cambiarEstado(S().obraId, cutId, estado, motivo); }
    catch (e) { alert(Nube.traducirError(e)); renderHistory(); }
  };

  window.deleteCut = function (id) { window.cambiarEstadoCorte(id, 'anulado'); };
})();
```

- [ ] **Step 3: Adaptar `index.html`**

`.tools/fix_task7.py`:

```python
import io
p = 'index.html'
c = io.open(p, encoding='utf-8').read()
def rep(old, new, count=1):
    global c
    assert c.count(old) == count, (old[:70], c.count(old))
    c = c.replace(old, new)

rep('<script src="js/ui-nube.js"></script>', '<script src="js/cortes-nube.js"></script>\n<script src="js/ui-nube.js"></script>')

# Numero propuesto: siguiente al contador conocido (el definitivo lo da el servidor)
rep("""  const nextNum = STATE.cuts.length + 1;
  document.getElementById('cut-number-input').value = `Corte ${String(nextNum).padStart(2,'0')}`;""",
"""  const todos = STATE.cuts.concat(STATE.cutsAnulados || []);
  const nextNum = todos.reduce((m, ct) => Math.max(m, ct.numeroSec || 0), 0) + 1;
  document.getElementById('cut-number-input').value = EurbeCortes.numeroCorte(nextNum) + ' (se confirma al guardar)';""")

# localStorage ya no guarda cortes en la nube
rep("""function saveCutsToStorage() {
  try {
    localStorage.setItem('eurbe_cuts', JSON.stringify(STATE.cuts));
  } catch(e) {}
}""", """function saveCutsToStorage() {
  // En la nube los cortes viven en Firestore; nada que guardar en el navegador
}""")

# Selector de estado: solo destinos permitidos para el rol; boton Anular
rep("""        <select class="cut-estado-sel" onchange="cambiarEstadoCorte('${cut.id}', this.value)"
                title="Cambiar el estado de este corte">
          ${Object.entries(CUT_ESTADOS).map(([k,v]) =>
            `<option value="${k}"${k===est?' selected':''}>${v.lbl}</option>`).join('')}
        </select>""", """        ${(() => {
          const dest = EurbeCortes.destinosPermitidos(SESION.rol, cut, SESION.correo).filter(k => k !== 'anulado');
          return dest.length && !SESION.soloLectura ? `<select class="cut-estado-sel" onchange="cambiarEstadoCorte('${esc(cut.id)}', this.value)"
                title="Cambiar el estado de este corte">
            <option value="" selected>Cambiar a…</option>
            ${dest.map(k => `<option value="${k}">${CUT_ESTADOS[k].lbl}</option>`).join('')}
          </select>` : '';
        })()}""")
rep("""          <button class="btn btn-danger btn-sm" onclick="deleteCut('${cut.id}')">🗑 Eliminar</button>""",
"""          ${EurbeCortes.destinosPermitidos(SESION.rol, cut, SESION.correo).includes('anulado') && !SESION.soloLectura
            ? `<button class="btn btn-danger btn-sm" onclick="deleteCut('${esc(cut.id)}')">⊘ Anular</button>` : ''}""")
rep("""        <div class="prop-row"><div class="prop-label">Cantidad total</div><div class="prop-value accent">${qtyStr}</div></div>""",
"""        <div class="prop-row"><div class="prop-label">Cantidad total</div><div class="prop-value accent">${qtyStr}</div></div>
        <div class="prop-row"><div class="prop-label">Registrado por</div><div class="prop-value">${esc(cut.creadoPor || '—')}</div></div>
        <div class="prop-row"><div class="prop-label">Historial</div><div class="prop-value">${(cut.historial || []).map(h =>
          `${esc((CUT_ESTADOS[h.estado] || {lbl: h.estado}).lbl)} · ${esc(h.por)} · ${esc((h.fecha || '').slice(0,10))}${h.motivo ? ' · ' + esc(h.motivo) : ''}`).join('<br>')}</div></div>""")

# Anulados: estado propio para pintar y lista aparte con filtro
rep("""  pagado:     { lbl: 'Pagado',        color: '#5AB87A', bg: '#EEF9F1' },
};""", """  pagado:     { lbl: 'Pagado',        color: '#5AB87A', bg: '#EEF9F1' },
};
// Anulado no entra en CUT_ESTADOS: esos cortes nunca estan en STATE.cuts
const ESTADO_ANULADO = { lbl: 'Anulado', color: '#999', bg: '#f2f2f2' };""")
rep("""  const badge = document.getElementById('cut-badge');
  badge.textContent = STATE.cuts.length;""", """  const badge = document.getElementById('cut-badge');
  badge.textContent = STATE.cuts.length;
  const nAnul = (STATE.cutsAnulados || []).length;
  let tog = document.getElementById('toggle-anulados');
  if (!tog) {
    tog = document.createElement('label');
    tog.id = 'toggle-anulados';
    tog.style.cssText = 'font-size:11px;color:var(--c-text3);display:block;margin:4px 0';
    badge.parentElement.after(tog);
  }
  tog.innerHTML = nAnul ? `<input type="checkbox" ${window.mostrarAnulados ? 'checked' : ''}
    onchange="window.mostrarAnulados=this.checked;renderHistory()"> Mostrar anulados (${nAnul})` : '';""")
rep("""  if (STATE.cuts.length === 0) {
    empty.style.display = 'block';
    list.innerHTML = '';
    return;
  }""", """  const anuladosHtml = (window.mostrarAnulados ? (STATE.cutsAnulados || []) : []).slice().reverse().map(cut => `
    <div class="cut-card" style="opacity:.6">
      <div class="cut-card-header">
        <div class="cut-number" style="text-decoration:line-through">${esc(cut.number)}</div>
        <div class="cut-meta"><strong>Anulado</strong><span>${esc(cut.anuladoPor || '')}</span></div>
        <div class="cut-qty">${esc(cut.motivoAnulacion || '')}</div>
      </div>
    </div>`).join('');

  if (STATE.cuts.length === 0) {
    list.innerHTML = anuladosHtml;
    empty.style.display = anuladosHtml ? 'none' : 'block';
    return;
  }""")
rep("""    </div>`;
  }).join('');
}

function toggleCutCard(id) {""", """    </div>`;
  }).join('') + anuladosHtml;
}

function toggleCutCard(id) {""")

io.open(p, 'w', encoding='utf-8', newline='').write(c)
print('ok')
```

Run: `python .tools/fix_task7.py`. Expected: `ok`.

Nota: `window.registerCut`, `window.cambiarEstadoCorte` y `window.deleteCut` de `cortes-nube.js` reemplazan a las del script principal porque se cargan después, y los `onclick` resuelven por nombre global en el momento del clic.

- [ ] **Step 4: Sintaxis y unitarias**

Run: el comando del Step 6 de la Task 6. Expected: `OK`.

- [ ] **Step 5: Verificación manual con emuladores**

Siembra también un registrador (`reg@ingeurbe.com`) y una consulta (`cons@ingeurbe.com`) copiando los curl de `.tools/sembrar.sh` con otro correo y rol. Comprueba:
- **Admin:** registra Corte 01; en otra pestaña con el registrador aparece sin recargar.
- **Registrador:** su selector ofrece solo «En aprobación»; «⊘ Anular» aparece en su corte en revisión y no en el del admin.
- **Admin:** marca Pagado. Desaparece el botón Anular y el selector solo ofrece «En aprobación».
- **Anular** con motivo vacío → cancelado. Con motivo → desaparece de la lista y «Mostrar anulados (1)» lo muestra tachado. Los colores del 3D ya no lo cuentan.
- **Consulta:** no ve selector ni Anular, y registrar muestra el aviso de rol.
- Seleccionar elementos de un corte existente y registrar → aparece el aviso de duplicados.

- [ ] **Step 6: Commit**

```bash
git add js/nube.js js/cortes-nube.js index.html
git commit -m "Cortes en Firestore: registro por transacción, estados por rol, anular y vista en vivo"
```

---

### Task 8: Gestionar accesos (admin)

**Files:**
- Modify: `js/nube.js`
- Create: `js/accesos-ui.js`
- Modify: `index.html` (añadir `<script src="js/accesos-ui.js">` antes de `js/ui-nube.js`)

**Interfaces:**
- Produces en `Nube`: `listarAccesos() → Promise<Array<{correo, rol, nombre, activo}>>`, `guardarAcceso(correo, {rol, nombre, activo}) → Promise<void>`.
- Produces: `window.abrirAccesos()` (lo llama el menú de la Task 6).

- [ ] **Step 1: `nube.js`**

```js
  async function listarAccesos() {
    const q = await db.collection('accesos').get();
    return q.docs.map(d => ({ correo: d.id, ...d.data() })).sort((a, b) => a.correo.localeCompare(b.correo));
  }
  function guardarAcceso(correo, { rol, nombre, activo }) {
    return db.doc('accesos/' + correo.trim().toLowerCase()).set({
      rol, nombre: (nombre || '').trim(), activo: !!activo,
      creadoPor: correoDe(usuario()), fecha: new Date().toISOString() }, { merge: true });
  }
```

Añade `listarAccesos, guardarAcceso` al objeto exportado.

- [ ] **Step 2: `js/accesos-ui.js`**

```js
// Ventana de accesos: alta por correo, cambio de rol y desactivacion.
(function () {
  const ROLES = { admin: 'Administrador', registrador: 'Registrador', consulta: 'Consulta' };
  window.abrirAccesos = async function () {
    const fondo = document.createElement('div');
    fondo.className = 'nube-screen'; fondo.style.background = 'rgba(20,24,40,.35)';
    fondo.innerHTML = '<div class="nube-box" style="width:min(640px,calc(100vw - 32px))"><p>Cargando…</p></div>';
    document.body.appendChild(fondo);
    const caja = fondo.firstChild;
    const pintar = async (msg) => {
      let lista;
      try { lista = await Nube.listarAccesos(); }
      catch (e) { caja.innerHTML = `<p>${esc(Nube.traducirError(e))}</p>`; return; }
      const sel = (v) => Object.entries(ROLES).map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t}</option>`).join('');
      caja.innerHTML = `<h2>Accesos</h2>
        <p class="sub">La persona crea su contraseña al entrar por primera vez con «Crear mi contraseña».</p>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <tr><th align="left">Correo</th><th align="left">Nombre</th><th>Rol</th><th>Activo</th><th></th></tr>
          ${lista.map((a, i) => `<tr data-i="${i}">
            <td>${esc(a.correo)}</td>
            <td><input value="${esc(a.nombre || '')}" data-k="nombre"></td>
            <td><select data-k="rol">${sel(a.rol)}</select></td>
            <td align="center"><input type="checkbox" data-k="activo"${a.activo ? ' checked' : ''}
                ${a.correo === SESION.correo ? ' disabled title="No puedes desactivarte a ti mismo"' : ''}></td>
            <td><button class="btn btn-secondary btn-sm" data-guardar="${i}">Guardar</button></td>
          </tr>`).join('')}
        </table>
        <h3 style="margin-top:18px;font-size:14px">Dar acceso</h3>
        <div style="display:grid;grid-template-columns:2fr 1.5fr 1fr auto;gap:6px">
          <input id="acc-correo" placeholder="correo@ingeurbe.com">
          <input id="acc-nombre" placeholder="Nombre">
          <select id="acc-rol">${sel('consulta')}</select>
          <button class="btn btn-primary btn-sm" id="acc-alta">Añadir</button>
        </div>
        <div class="error" id="acc-error">${esc(msg || '')}</div>
        <div class="fila"><button class="btn btn-secondary" id="acc-cerrar">Cerrar</button></div>`;
      caja.querySelectorAll('[data-guardar]').forEach(b => b.onclick = async () => {
        const i = +b.dataset.guardar, fila = caja.querySelector(`tr[data-i="${i}"]`);
        const v = k => fila.querySelector(`[data-k="${k}"]`);
        try {
          await Nube.guardarAcceso(lista[i].correo, { rol: v('rol').value, nombre: v('nombre').value, activo: v('activo').checked });
          pintar('Guardado.');
        } catch (e) { pintar(Nube.traducirError(e)); }
      });
      caja.querySelector('#acc-alta').onclick = async () => {
        const c = caja.querySelector('#acc-correo').value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { caja.querySelector('#acc-error').textContent = 'Correo no válido.'; return; }
        try {
          await Nube.guardarAcceso(c, { rol: caja.querySelector('#acc-rol').value,
            nombre: caja.querySelector('#acc-nombre').value, activo: true });
          pintar('Acceso creado para ' + c + '.');
        } catch (e) { pintar(Nube.traducirError(e)); }
      };
      caja.querySelector('#acc-cerrar').onclick = () => fondo.remove();
    };
    pintar();
  };
})();
```

- [ ] **Step 3: Incluir el script**

```bash
python -c "
import io;p='index.html';c=io.open(p,encoding='utf-8').read()
o='<script src=\"js/ui-nube.js\"></script>';assert c.count(o)==1
c=c.replace(o,'<script src=\"js/accesos-ui.js\"></script>\n'+o);io.open(p,'w',encoding='utf-8',newline='').write(c);print('ok')"
```

- [ ] **Step 4: Sintaxis y verificación manual**

Run: el comando del Step 6 de la Task 6 → `OK`. Luego, con emuladores:
- Como admin: «Obra ▾ → Gestionar accesos», añade `nuevo@ingeurbe.com` con rol Registrador.
- En otra ventana privada: «Crear mi contraseña» con ese correo → pantalla «Confirma tu correo». En el emulador el enlace de verificación aparece en la terminal de emuladores; ábrelo → «Ya lo confirmé» → entra como registrador.
- Desactívalo desde el admin → al recargar, esa ventana ve «Sin acceso».
- Un correo nunca dado de alta que crea cuenta y verifica también ve «Sin acceso».

- [ ] **Step 5: Commit**

```bash
git add js/nube.js js/accesos-ui.js index.html
git commit -m "Gestión de accesos por correo y rol desde la app"
```

---

### Task 9: Informes con «Registrado por» e historial

**Files:**
- Modify: `index.html` (`exportExcel` hoja 1; PDF: tabla de cortes y ficha)

**Interfaces:**
- Consumes: `cut.creadoPor`, `cut.historial` (Task 7).

- [ ] **Step 1: Aplicar cambios**

`.tools/fix_task9.py`:

```python
import io
p = 'index.html'
c = io.open(p, encoding='utf-8').read()
def rep(old, new, count=1):
    global c
    assert c.count(old) == count, (old[:70], c.count(old))
    c = c.replace(old, new)

hist = "(cut.historial || []).map(h => `${(CUT_ESTADOS[h.estado] || {lbl: h.estado}).lbl} (${h.por}, ${(h.fecha || '').slice(0,10)})`).join(' → ')"

# Excel hoja 1
rep("""                        'Total Elementos','Cantidad','Observaciones']];""",
"""                        'Total Elementos','Cantidad','Observaciones','Registrado por','Historial de estados']];""")
rep("""      cut.descGrupo, cut.totalElements, qtyStr, cut.notes || '']);""",
"""      cut.descGrupo, cut.totalElements, qtyStr, cut.notes || '', cut.creadoPor || '', """ + hist + """]);""")
rep("""  ws1['!cols'] = [{wch:12},{wch:12},{wch:14},{wch:16},{wch:14},{wch:40},{wch:28},{wch:14},{wch:20},{wch:30}];""",
"""  ws1['!cols'] = [{wch:12},{wch:12},{wch:14},{wch:16},{wch:14},{wch:40},{wch:28},{wch:14},{wch:20},{wch:30},{wch:26},{wch:60}];""")

# PDF tabla de cortes
rep("""<th>Cantidad</th><th>Observaciones</th></tr></thead>""",
"""<th>Cantidad</th><th>Observaciones</th><th>Registrado por</th></tr></thead>""")
rep("""      <td>${qtyStr}</td><td>${esc(cut.notes)}</td>""",
"""      <td>${qtyStr}</td><td>${esc(cut.notes)}</td><td>${esc(cut.creadoPor || '')}</td>""")

# PDF ficha
rep("""        <tr><th>Observaciones</th><td colspan="3">${esc(cut.notes) || '—'}</td></tr>""",
"""        <tr><th>Observaciones</th><td colspan="3">${esc(cut.notes) || '—'}</td></tr>
        <tr><th>Registrado por</th><td>${esc(cut.creadoPor || '—')}</td>
            <th>Historial</th><td>${esc(""" + hist + """) || '—'}</td></tr>""")

io.open(p, 'w', encoding='utf-8', newline='').write(c)
print('ok')
```

Run: `python .tools/fix_task9.py`. Expected: `ok`.

- [ ] **Step 2: Sintaxis y verificación manual**

Sintaxis → `OK`. Con emuladores, con un corte que tenga 2 cambios de estado:
- En el Excel, la hoja «Historial Cortes» trae las columnas «Registrado por» y «Historial de estados», con «En revisión (…) → En aprobación (…)».
- En el PDF, la tabla y la ficha muestran quién registró.
- Un corte anulado no aparece en ninguno de los dos informes.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Informes: registrado por e historial de estados en Excel y PDF"
```

---

### Task 10: Importar cortes locales (admin)

**Files:**
- Modify: `js/nube.js`
- Create: `js/importar-ui.js`
- Modify: `index.html` (script antes de `js/ui-nube.js`)

**Interfaces:**
- Consumes: `EurbeCortes.prepararImportacion` (Task 4), archivo de la Task 2.
- Produces en `Nube`: `importarCortes(obraId, docs: Array<{id, datos}>, maxSec: number) → Promise<void>`. Hace lotes de 400 y al final `contadorCortes = max(actual, maxSec)`.
- Produces: `window.abrirImportacion()`.

- [ ] **Step 1: `nube.js`**

```js
  async function importarCortes(obraId, docs, maxSec) {
    for (let i = 0; i < docs.length; i += 400) {
      const lote = db.batch();
      for (const d of docs.slice(i, i + 400)) {
        lote.set(db.doc(`obras/${obraId}/cortes/${d.id}`), Object.assign({}, d.datos,
          { ultimoCambio: firebase.firestore.FieldValue.serverTimestamp() }));
      }
      await lote.commit();
    }
    const obraRef = db.doc('obras/' + obraId);
    await db.runTransaction(async tx => {
      const actual = (await tx.get(obraRef)).data().contadorCortes || 0;
      if (maxSec > actual) tx.update(obraRef, { contadorCortes: maxSec });
    });
  }
```

Añade `importarCortes` al objeto exportado.

- [ ] **Step 2: `js/importar-ui.js`**

```js
// Importa el archivo de «Exportar cortes (JSON)» de la version local.
(function () {
  window.abrirImportacion = function () {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      let datos;
      try { datos = JSON.parse(await f.text()); } catch (e) { alert('El archivo no es un JSON válido.'); return; }
      if (!datos || datos.formato !== 'eurbe-cortes' || !Array.isArray(datos.cortes)) {
        alert('Este archivo no es una exportación de cortes de E-Urbe.'); return;
      }
      const existentes = new Set(STATE.cuts.concat(STATE.cutsAnulados || []).map(c => c.numeroSec));
      const ids = new Set(STATE.elements.map(e => e.globalId));
      const r = EurbeCortes.prepararImportacion(datos.cortes, existentes, ids, SESION.correo, new Date().toISOString());
      const lineas = [`Obra: ${SESION.obraNombre}`, `Se importarán ${r.docs.length} corte(s).`];
      if (r.omitidos.length) lineas.push('', 'No se importan:', ...r.omitidos.map(o => `· ${o.number}: ${o.motivo}`));
      if (r.faltantes.length) lineas.push('', 'Elementos que no existen en el modelo vigente:',
        ...r.faltantes.map(x => `· ${x.number}: ${x.faltan} elemento(s)`));
      if (!r.docs.length) { alert(lineas.join('\n')); return; }
      if (!confirm(lineas.join('\n') + '\n\n¿Importar?')) return;
      try { await Nube.importarCortes(SESION.obraId, r.docs, r.maxSec); notify(`✔ ${r.docs.length} cortes importados`); }
      catch (e) { alert('No se completó la importación.\n\n' + Nube.traducirError(e)); }
    };
    inp.click();
  };
})();
```

- [ ] **Step 3: Incluir script y verificar**

```bash
python -c "
import io;p='index.html';c=io.open(p,encoding='utf-8').read()
o='<script src=\"js/ui-nube.js\"></script>';assert c.count(o)==1
c=c.replace(o,'<script src=\"js/importar-ui.js\"></script>\n'+o);io.open(p,'w',encoding='utf-8',newline='').write(c);print('ok')"
```

Sintaxis → `OK`. Con emuladores, en una obra nueva con `model.json`, importa `.tools/cortes_prueba.json` (de la Task 2):
- Entran 2 cortes, con estado conservado y en el historial «importado desde versión local».
- El siguiente registro normal recibe el número 03.
- Importar el mismo archivo otra vez → «ese número ya existe en la obra» y no importa nada.

- [ ] **Step 4: Commit**

```bash
git add js/nube.js js/importar-ui.js index.html
git commit -m "Importación de cortes desde la versión local"
```

---

### Task 11: Sin conexión y red bloqueada

**Files:**
- Create: `js/sin-conexion.js`
- Modify: `index.html` (script antes de `js/ui-nube.js`)

**Interfaces:**
- Consumes: `CacheModelo.leerCualquiera` (Task 6), `localStorage['eurbe_ultima_version']` (lo escribe `abrirObra` en la Task 6).
- Produces: `window.modoSinConexion(mensaje)` (lo llama `arrancar()` si no hay SDK) y `window.pintarAvisoConexion()` (lo llama `cortes-nube.js`).

- [ ] **Step 1: `js/sin-conexion.js`**

```js
// Sin SDK (red bloqueada) o sin conexion: abre la ultima copia del modelo en
// solo lectura. Nunca permite registrar: al ser datos de pago podrian chocar.
(function () {
  window.pintarAvisoConexion = function () {
    let a = document.getElementById('aviso-conexion');
    if (!SESION.soloLectura) { if (a) a.remove(); return; }
    if (a) return;
    a = document.createElement('div');
    a.id = 'aviso-conexion'; a.className = 'aviso-nube';
    a.textContent = 'Sin conexión — no se pueden registrar cortes';
    document.body.appendChild(a);
  };

  window.modoSinConexion = async function (mensaje) {
    const U = window.UINube;
    let ult = null;
    try { ult = JSON.parse(localStorage.getItem('eurbe_ultima_version') || 'null'); } catch (e) {}
    const copia = ult && await CacheModelo.leerCualquiera(ult.obraId);
    if (!copia) {
      U.pantalla(`${U.LOGO()}<h2>E-Urbe</h2><p class="sub">${esc(mensaje)}</p>
        <p class="sub">Este equipo no tiene una copia guardada del modelo.</p>`);
      return;
    }
    U.pantalla(`${U.LOGO()}<h2>${esc(ult.obraNombre)}</h2><p class="sub">${esc(mensaje)}</p>
      <button class="btn btn-primary" id="n-ro">Abrir la última copia (solo lectura)</button>`);
    document.getElementById('n-ro').onclick = async () => {
      const data = await EurbePaquete.desempaquetar([copia.comprimido], copia.huella);
      Object.assign(PARAM_MAP, ult.paramMap || {});
      Object.assign(SESION, { obraId: ult.obraId, obraNombre: ult.obraNombre, rol: 'consulta',
        nombre: 'Sin conexión', soloLectura: true, versionId: copia.versionId });
      window.alModeloCargadoCortes = () => {};   // sin SDK no hay cortes que escuchar
      document.getElementById('nube-screen').style.display = 'none';
      data.meta = Object.assign({}, data.meta, { sourceFile: ult.obraNombre + ' · copia local' });
      loadModel(data);
      window.pintarAvisoConexion();
      notify('Sin conexión: se muestra el modelo, los cortes no están disponibles.');
    };
  };
})();
```

- [ ] **Step 2: Incluir script**

```bash
python -c "
import io;p='index.html';c=io.open(p,encoding='utf-8').read()
o='<script src=\"js/ui-nube.js\"></script>';assert c.count(o)==1
c=c.replace(o,'<script src=\"js/sin-conexion.js\"></script>\n'+o);io.open(p,'w',encoding='utf-8',newline='').write(c);print('ok')"
```

- [ ] **Step 3: Verificación manual**

Sintaxis → `OK`. Con emuladores y una obra ya abierta una vez:
- **Red bloqueada.** DevTools → Network → Request blocking con el patrón `gstatic.com`. Recarga → mensaje «Puede que la red lo esté bloqueando» y el botón «Abrir la última copia». Abre → visor con el aviso naranja y sin formulario activo de registro.
- **Sin conexión.** Quita el bloqueo, entra normal y pon Network en *Offline*: aparece «Sin conexión — no se pueden registrar cortes» y registrar muestra el aviso. Vuelve *Online*: el aviso desaparece con el siguiente snapshot.
- **Cuota agotada.** No se puede simular en el emulador. Revisa que `traducirError` cubra `resource-exhausted` (Task 6, Step 3).

- [ ] **Step 4: Commit**

```bash
git add js/sin-conexion.js index.html
git commit -m "Modo solo lectura sin conexión o con la red bloqueando Firebase"
```

---

### Task 12: Prueba de humo en navegador real (Playwright + emuladores)

**Files:**
- Create: `playwright.config.mjs`, `tests/e2e/sembrar.mjs`, `tests/e2e/humo.spec.mjs`

**Interfaces:**
- Consumes: todo lo anterior. Ids del DOM: `n-correo`, `n-clave`, `n-entrar`, `nube-screen`, `file-input`, `btn-confirm-mapping`, `btn-register`, `cut-notes-input`, `history-list`, `viewer-wrap`.

- [ ] **Step 1: Instalar navegador**

Run: `npx playwright install chromium`

- [ ] **Step 2: Configuración y siembra**

`playwright.config.mjs`:

```js
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120000,
  use: { baseURL: 'http://localhost:5173', headless: true },
  webServer: [
    { command: 'npx --yes http-server -p 5173 -c-1 .', url: 'http://localhost:5173', reuseExistingServer: true },
  ],
});
```

`tests/e2e/sembrar.mjs`:

```js
// Crea usuarios verificados y accesos en los emuladores (Bearer owner = admin del emulador)
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
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${P}/accounts`,
    { method: 'POST', headers: H, body: JSON.stringify({ email, password: 'clave123', emailVerified: true }) });
  await fetch(`${FS}/v1/projects/${P}/databases/(default)/documents/accesos/${email}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ fields: {
      rol: { stringValue: rol }, nombre: { stringValue: rol }, activo: { booleanValue: true } } }) });
}
```

- [ ] **Step 3: Prueba**

`tests/e2e/humo.spec.mjs`:

```js
import { test, expect } from '@playwright/test';
import { limpiar, usuario, soloCuenta } from './sembrar.mjs';

async function entrar(page, email) {
  await page.goto('/');
  await page.fill('#n-correo', email);
  await page.fill('#n-clave', 'clave123');
  await page.click('#n-entrar');
}

async function seleccionarUno(page) {
  // Clic en el centro del visor: selecciona algún elemento del modelo de prueba
  const box = await page.locator('#viewer-wrap').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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
```

- [ ] **Step 4: Ejecutar**

Terminal 1: `export PATH="$PWD/.tools/jdk/bin:$PATH"; npm run emuladores`
Terminal 2: `npm run test:e2e`
Expected: 2 passed. Si `seleccionarUno` no acierta un elemento, usa en su lugar Ctrl+arrastrar de derecha a izquierda sobre todo el visor (ventana de cruce), que selecciona todo lo que toca.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.mjs tests/e2e/ package.json package-lock.json
git commit -m "Prueba de humo e2e con dos usuarios contra emuladores"
```

---

### Task 13: Proyecto real de Firebase, despliegue y documentación

Requiere acciones de la persona responsable (marcadas 👤). El implementador prepara los comandos y espera.

**Files:**
- Modify: `firebase-config.js`, `.firebaserc`, `CLAUDE.md`, `PLAN_DE_TRABAJO.md`

- [ ] **Step 1: 👤 Crear el proyecto**

1. En <https://console.firebase.google.com>, con una cuenta de Google **de la empresa o compartida**, crea el proyecto `eurbe-piloto` **sin** Google Analytics.
2. Build → **Firestore Database** → Create → modo producción → región `southamerica-east1` (São Paulo).
3. Build → **Authentication** → Get started → **Email/Password** → Enable.
4. Authentication → Settings → **Authorized domains** → añade `cpulgariningeurbe.github.io`.
5. Project settings → *Your apps* → Web (`</>`) → registra «E-Urbe» sin Hosting → copia el objeto `firebaseConfig` y pásalo al implementador. Es público; no es un secreto.

- [ ] **Step 2: Configuración real**

Reemplaza en `firebase-config.js` el objeto por el `firebaseConfig` recibido, manteniendo `window.EURBE_FIREBASE_SDK`. En `.firebaserc` pon `"default": "<projectId real>"`. Los scripts `test:rules` y `emuladores` siguen usando `--project demo-eurbe`, así que las pruebas nunca tocan el proyecto real.

- [ ] **Step 3: 👤 Publicar reglas**

```bash
npx firebase login
npx firebase deploy --only firestore:rules
```

Expected: `✔  Deploy complete!`

- [ ] **Step 4: 👤 Primer administrador**

1. En la consola → Firestore → Start collection `accesos` → Document ID = el correo del admin en minúsculas → campos `rol` (string) `admin`, `nombre` (string), `activo` (boolean) `true`.
2. El admin abre la app publicada → «Crear mi contraseña» → confirma el correo → entra.

- [ ] **Step 5: Documentación**

En `CLAUDE.md`:
- Tabla de archivos: `index.html` (app en la nube), `js/*`, `firestore.rules` y `firebase-config.js`. `eurbe.html` pasa a ser «versión local sin nube».
- Nueva sección «Versión en la nube»: colecciones, roles, «anular en lugar de borrar», el modelo en trozos, los ganchos `entregarModelo` y `alModeloCargado`, cómo correr `test:unit`, `test:rules` (con JDK en `.tools/jdk`) y `test:e2e`.
- Corrige el tamaño del archivo (~245 KB / ~3.350 líneas).

En `PLAN_DE_TRABAJO.md`, en «Hecho», añade «Versión en la nube (piloto)» con la fecha.

- [ ] **Step 6: Todas las pruebas**

```bash
export PATH="$PWD/.tools/jdk/bin:$PATH"
npm run test:unit && npm run test:rules && echo UNIT_Y_REGLAS_OK
```

Con los emuladores arriba: `npm run test:e2e`. Expected: todo pasa.

- [ ] **Step 7: Commit y push**

```bash
git add firebase-config.js .firebaserc CLAUDE.md PLAN_DE_TRABAJO.md
git commit -m "Configuración del proyecto Firebase real y documentación de la versión en la nube"
git push
```

- [ ] **Step 8: 👤 Verificación en producción**

Pasados 1-2 minutos, abre `https://cpulgariningeurbe.github.io/EURBEV1/`:
1. Desde la **red de la oficina de Ingeurbe**: carga la pantalla de entrada, sin el mensaje de red bloqueada.
2. El admin crea la obra real y sube el federado (con `PZA-MODELO-FEDERADO-eurbe.json`). Anota el tiempo de subida y el de la primera apertura en otro equipo.
3. Viviana exporta sus cortes desde el `eurbe.html` local y el admin los importa.
4. Una segunda persona con rol registrador registra un corte y el admin lo ve sin recargar.

Anota los resultados en `PLAN_DE_TRABAJO.md`.
