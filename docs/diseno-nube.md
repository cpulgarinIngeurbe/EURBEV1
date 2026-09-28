# E-Urbe en la nube · Diseño del piloto

Fecha: 28 de septiembre de 2026 · Estado: **pendiente de revisión**

Este documento recoge lo acordado para llevar E-Urbe de un archivo local a una
aplicación web compartida. Complementa a `CLAUDE.md`; las decisiones de diseño de ese
archivo (el avance lo definen los cortes, `PARAM_MAP` sin nombres fijos, contrato de
coordenadas Z-up, dos decimales) siguen vigentes.

---

## 1. Objetivo

- Un **equipo interno de Ingeurbe** (varias personas) consulta y registra cortes desde
  cualquier equipo, sobre los **mismos datos**.
- La aplicación maneja **varias obras**, cada una con su modelo, su mapeo de
  parámetros y sus cortes.
- El modelo se carga y convierte **una sola vez**. Después la aplicación abre
  directamente en el visor. La pantalla de carga solo vuelve cuando el administrador
  sube una versión nueva.
- Es un **piloto**: debe costar cero, sin tarjeta de crédito asociada.

**Criterio de éxito:** dos personas en equipos distintos abren el enlace, ven la misma
obra con el mismo modelo y los mismos cortes, y lo que registra una lo ve la otra al
instante, con los permisos de su rol respetados por el servidor.

---

## 2. Arquitectura

| Pieza | Servicio | Plan |
|---|---|---|
| Página web | GitHub Pages | Gratuito (repositorio público, solo código) |
| Datos: obras, cortes, accesos, modelos | Firebase Cloud Firestore | Spark (gratuito, sin tarjeta) — 1 GiB, 50.000 lecturas y 20.000 escrituras al día |
| Inicio de sesión | Firebase Authentication, correo y contraseña | Spark |
| Copia local del modelo | IndexedDB del navegador | — |

- **No se usa Cloud Storage.** Desde febrero de 2026 exige el plan Blaze con tarjeta.
  El modelo va comprimido dentro de Firestore, partido en trozos (sección 3). Si el
  piloto crece, se migra a Storage sin cambiar el resto de la aplicación.
- **Inicio de sesión con Microsoft: fase posterior.** Queda pendiente del registro de
  la aplicación en Microsoft Entra por parte de TI. Los roles van atados al correo, así
  que el cambio de proveedor no toca datos ni reglas.
- **No se imita la pantalla de inicio de sesión de Microsoft.** La entrada lleva la
  marca E-Urbe / Ingeurbe y la nota «Inicio con cuenta Microsoft: próximamente».
- El SDK de Firebase se carga desde el CDN oficial (`gstatic.com`), en su variante
  *compat*, que funciona con etiquetas `<script>` clásicas como el resto de la app. Si
  la red lo bloquea, se muestra un mensaje claro (ver sección 7).
- La compresión usa `CompressionStream('gzip')`, nativo del navegador; no añade
  librerías.

---

## 3. Modelo de datos (Firestore)

```
accesos/{correo en minúsculas}
   rol: 'admin' | 'registrador' | 'consulta'
   nombre, activo: bool, creadoPor, fecha

obras/{obraId}
   nombre
   modeloVigente: versionId
   contadorCortes: número          ← numeración sin choques
   creadaPor, fecha

obras/{obraId}/modelos/{versionId}
   archivoOriginal, fecha, subidoPor
   nElementos, bytesComprimidos, nTrozos
   huella: SHA-256 del contenido comprimido
   paramMap                        ← mapeo usado para esta versión
   └─ trozos/{0..n-1}
        datos: Bytes (≤ 900 KB)

obras/{obraId}/cortes/{corteId}
   number, date, notes, elementIds, totalElements, qtyByUnit,
   actividad, nivel, edificacion, descGrupo, registeredAt   ← como hoy
   estado: 'revision' | 'aprobacion' | 'pagado' | 'anulado'
   creadoPor, modeloVersion
   historial: [{ estado, por, fecha, motivo? }]
   anuladoPor?, motivoAnulacion?
```

- Un documento de Firestore no supera 1 MB. Un corte alcanza para unos 35.000
  `globalId`, más del doble del modelo federado (16.604 elementos).
- El modelo federado (28,7 MB) debería quedar en unos 4–6 MB comprimido, es decir, 5 a
  7 trozos. El 1 GiB gratuito da para unas 200 versiones de ese tamaño más todos los
  cortes.
- El elemento guardado es el mismo que produce hoy `applyJSONMapping` /
  `loadIFCDirect`: ya mapeado a los campos internos y en coordenadas **Z-up**. Así, al
  abrir, no se repite ni la conversión ni el mapeo.

---

## 4. Flujos

### 4.1 Entrada

1. **Pantalla de entrada** con correo y contraseña. También ofrece «Crear mi
   contraseña» (primer ingreso) y «Olvidé mi contraseña» (correo de Firebase).
2. Al crear la cuenta, Firebase envía un **correo de verificación**. Las reglas exigen
   el correo verificado, para que nadie ocupe el correo de otra persona antes que ella.
3. Si el correo no está en `accesos` o está inactivo, se muestra «No tienes acceso a
   E-Urbe, pídelo al administrador» y no se carga nada.
4. **Elegir obra.** Si solo hay una, el paso se salta. La última obra abierta se
   recuerda en `localStorage`, que aquí solo guarda esa preferencia.

### 4.2 Carga del modelo

1. Se lee `obras/{obraId}.modeloVigente` y los metadatos de esa versión.
2. Si IndexedDB tiene esa versión con la misma huella, se carga desde ahí.
3. Si no, se descargan los trozos con barra de progreso, se verifica la huella, se
   descomprime, se guarda en IndexedDB y se borran de ahí las versiones viejas de esa
   obra.
4. Se aplica el `paramMap` de la versión y se llama a `loadModel()`.
5. El visor abre directamente. **La pantalla de bienvenida no aparece.**

Si el administrador publica una versión nueva mientras otros tienen la app abierta, les
aparece el aviso «Hay una versión nueva del modelo · Recargar». No se cambia sola.

### 4.3 Menú «Obra ▾» (solo administrador)

- **Subir nueva versión del modelo.** Reutiliza la pantalla actual de carga (IFC o
  JSON) y la de mapeo, con el `paramMap` anterior precargado. Antes de publicar, compara
  con los cortes activos y avisa: «N elementos de los cortes X, Y ya no existen en esta
  versión». Al confirmar, comprime, sube los trozos, escribe los metadatos y, solo
  entonces, cambia `modeloVigente`. Las versiones anteriores se conservan.
- **Crear obra.**
- **Gestionar accesos**: alta, cambio de rol y desactivación, por correo.
- **Importar cortes** (sección 6).

### 4.4 Cortes

- **Número automático.** Se asigna en una transacción sobre `contadorCortes`
  (Corte 01, 02…) y no es editable, para garantizar que no se repita con varias
  personas registrando a la vez.
- Si algún elemento seleccionado ya está en otro corte activo, aparece un aviso antes
  de guardar: «12 elementos ya están en el Corte 03 — ¿registrar igual?». Los informes
  siguen eliminando duplicados por `globalId`.
- **En vivo.** Se escucha la colección de cortes de la obra (`onSnapshot`). Los colores
  del 3D, el historial y el panel de Avance se actualizan sin recargar.
- **Anular en lugar de borrar.** El corte queda con estado `anulado` y motivo
  obligatorio. Deja de contar en el avance, los colores y los informes, y se puede ver
  con el filtro «mostrar anulados». No existe borrado definitivo desde la aplicación.
- Los informes Excel y PDF añaden «Registrado por» y el historial de estados de cada
  corte.

---

## 5. Permisos

Los aplican las **reglas de seguridad de Firestore** en el servidor, no la página. El
rol se lee de `accesos/{request.auth.token.email}` y se exige
`email_verified == true` y `activo == true`.

| Acción | Admin | Registrador | Consulta |
|---|---|---|---|
| Ver obras, modelo, cortes, informes | ✅ | ✅ | ✅ |
| Crear obras, subir versiones de modelo | ✅ | — | — |
| Gestionar accesos | ✅ | — | — |
| Registrar corte (incrementar `contadorCortes` en exactamente 1) | ✅ | ✅ | — |
| `revision` → `aprobacion` | ✅ | ✅ | — |
| → `pagado` | ✅ | — | — |
| Devolver un corte `pagado` a `aprobacion` | ✅ | — | — |
| Editar un corte `pagado` | nadie | nadie | — |
| Anular: cualquier corte no pagado | ✅ | — | — |
| Anular: corte propio en `revision` | ✅ | ✅ | — |

Además, las reglas exigen que:

- cada cambio de estado añada **exactamente una** entrada al final de `historial`, sin
  modificar las anteriores, y con `por` igual al correo de quien hace el cambio;
- `creadoPor` coincida con quien crea el corte y no pueda cambiarse después;
- nadie pueda borrar documentos de cortes ni de modelos.

---

## 6. Migración de los cortes locales

Los cortes actuales viven en el `localStorage` del `eurbe.html` abierto con `file://`.
El navegador lo trata como un sitio distinto, así que la versión web **no puede
leerlos**.

1. Al `eurbe.html` local se le añade el botón **«Exportar cortes (JSON)»**, que
   descarga `eurbe_cuts`.
2. En la versión web, **«Importar cortes»** (solo admin) recibe ese archivo y una obra
   de destino. Conserva número, fecha, notas y estado, marca en el historial
   «importado desde versión local» y fija `contadorCortes` al mayor número importado.
3. Antes de importar se avisa de los elementos que no existen en el modelo vigente, y
   de los números que ya existen en la obra, que no se importan.

---

## 7. Errores y conexión

| Situación | Comportamiento |
|---|---|
| El SDK de Firebase no carga (red corporativa) | Mensaje: «No se pudo conectar con el servicio de datos. Puede que la red lo esté bloqueando.» Si hay modelo en IndexedDB, se ofrece abrirlo en modo solo lectura. |
| Sin conexión con modelo en IndexedDB | El visor abre en **solo lectura** con el aviso «Sin conexión — no se pueden registrar cortes». No se encolan registros para después: al ser datos de pago, podrían chocar. |
| Sin conexión y sin modelo guardado | Mensaje claro, sin visor. |
| Huella del modelo descargado no coincide | Se descarta, se reintenta una vez y, si vuelve a fallar, se muestra el error. |
| Subida de versión interrumpida | `modeloVigente` no cambia hasta que todos los trozos están escritos, así que nadie ve una versión a medias. |
| Cuota diaria de Firebase agotada | Mensaje: «Límite diario del plan gratuito alcanzado; vuelve a estar disponible mañana». |

---

## 8. Publicación

- Repositorio en GitHub con `index.html` (la aplicación), `firebase-config.js` (la
  configuración web de Firebase, que es pública por diseño) y `firestore.rules`.
- El `.gitignore` excluye todo `*.json` de modelos, `*.ifc`, los respaldos
  `eurbe_*.html` y los archivos de Python.
- El dominio `<cuenta>.github.io` se añade a los dominios autorizados de Firebase
  Authentication.
- El `eurbe.html` local sigue funcionando con `file://` como respaldo, con el botón de
  exportar añadido.

---

## 9. Pruebas

1. **Reglas de permisos, automáticas.** Con el emulador de Firestore y
   `@firebase/rules-unit-testing`: una prueba por cada fila de la tabla de la
   sección 5, más los casos negativos (registrador intenta `pagado`, consulta intenta
   registrar, alguien intenta reescribir el historial o borrar un corte, usuario sin
   verificar, usuario no listado).
2. **Navegador real, con `model.json`, en una obra de prueba:** subir modelo → recargar
   y comprobar que abre desde IndexedDB → registrar desde dos pestañas a la vez
   (números distintos, ambas ven ambos cortes) → cambiar estados por rol → anular →
   subir versión nueva y ver el aviso → exportar Excel y PDF.
3. **Modelo federado:** subida, tamaño comprimido, tiempo de primera apertura y de
   apertura desde caché.
4. **Red de Ingeurbe:** abrir el enlace desde un equipo de la oficina.
5. **Migración:** exportar desde el `eurbe.html` local e importar en la obra de prueba.

---

## 10. Pendientes del lado de Ingeurbe

1. Crear el proyecto de Firebase con una cuenta de Google **de la empresa o
   compartida**, no personal. Activar Firestore y Authentication (correo y contraseña).
2. Crear la cuenta u organización de GitHub.
3. Indicar el correo del primer administrador, que se da de alta a mano en
   `accesos` desde la consola.
4. Informar a Nuevas Tecnologías de que existe el piloto. La skill corporativa
   `ingeurbe-secure-delivery` no estuvo disponible al diseñar esto.
5. Más adelante: solicitar a TI el registro de la aplicación en Microsoft Entra para el
   inicio de sesión corporativo.

---

## 11. Fuera de alcance del piloto

- Inicio de sesión con Microsoft (fase posterior, sección 2).
- Borrar obras o versiones de modelo desde la aplicación (se hace desde la consola).
- Permisos distintos por obra: el rol es el mismo en todas.
- Registro de cortes sin conexión.
- Servicio de conversión IFC en servidor: la conversión sigue en el navegador del
  administrador, o con `ifc_converter_v2.py` y carga del JSON.
- Las tres correcciones detectadas en el análisis previo (filtro «Ejecutados (IFC)»,
  columnas del CSV de pendientes, decimales en pendientes) se tratan aparte, antes de
  empezar esta migración.
