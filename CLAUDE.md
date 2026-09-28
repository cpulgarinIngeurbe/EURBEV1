# E-Urbe · Control de Cortes de Obra BIM

Aplicación web de una sola página para seguimiento de avance de obra sobre un modelo
BIM. El usuario selecciona elementos en el visor 3D y los registra como *cortes de
obra* (Corte 01, Corte 02…), que son la base para el pago de cantidades ejecutadas.

Desarrollada para **Ingeurbe**. Usuaria principal: Viviana García.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `eurbe.html` | **La aplicación completa.** Un solo archivo, ~355 KB, ~3100 líneas. Logos en base64, todo el CSS y el JS embebidos. |
| `ifc_converter_v2.py` | Convertidor IFC → JSON. El que se debe usar. |
| `ifc_converter.py` | Versión antigua, con nombres de parámetros fijos. **Obsoleto.** |
| `PZA-MODELO-FEDERADO-eurbe.json` | Modelo federado convertido (16.604 elementos, 28,7 MB). |
| `model.json` | Modelo de pruebas pequeño (1.320 elementos). Útil para probar rápido. |
| `eurbe_v2.html`, `eurbe_backup_prev.html` | Respaldos de versiones anteriores. |
| `PZA-modelo-federado.json` | Volcado crudo de entidades IFC. **No sirve como entrada**, no tiene geometría. |

---

## Cómo editar `eurbe.html`

El archivo es demasiado grande para leerlo entero de una vez. El método que funciona:

1. Localizar la zona con `grep -n` o extrayendo un fragmento con Python.
2. Aplicar reemplazos quirúrgicos con Python usando `assert old in c` antes de cada
   sustitución, para que falle ruidosamente si el texto cambió.
3. Comprobar la sintaxis extrayendo el bloque `<script>` y pasándole `node --check`:

```bash
python3 -c "
import re
c=open('eurbe.html',encoding='utf-8').read()
open('/tmp/app.js','w',encoding='utf-8').write(max(re.findall(r'<script>(.*?)</script>',c,re.S),key=len))
" && node --check /tmp/app.js
```

**No basta con que el JS compile.** Varios de los fallos más costosos de este proyecto
pasaban la comprobación de sintaxis sin problema. Cuando se toca lógica de librerías
externas, ejes 3D o interacción, conviene verificar en un navegador real.

---

## Decisiones de diseño (no cambiar sin hablarlo)

### El avance lo definen los cortes, nunca el IFC

El IFC trae una propiedad `Ejecutado`, pero **no refleja el avance real de obra**. En el
modelo de prueba estaba en `true` para 1.317 de 1.320 elementos. El estado de ejecución
sale exclusivamente de `STATE.cutElements`, que son los elementos registrados en cortes
dentro de E-Urbe. Esto aplica a los colores del 3D, al panel de avance, a la tabla de
pendientes y a los informes. Al cargar, todos los elementos entran con
`ejecutado: false`.

### Ningún nombre de parámetro va fijo en el código

Cada IFC de Ingeurbe nombra las cosas distinto. El modelo de prueba usaba
`Nivel de construcción` y `Descripción de la actividad`; el federado usa `Cod Nivel` y
`Cod Actividad`. Por eso existe `PARAM_MAP`, que traduce parámetros del archivo a campos
internos, y una **pantalla de mapeo** que aparece al cargar tanto un `.ifc` como un
`.json`. Los valores por defecto de `PARAM_MAP` son solo una semilla para la
autodetección (`guessParam` + `PARAM_CANDIDATES`); la lógica nunca debe leer un nombre
de parámetro literal.

Campos internos: `nivel`, `actividad`, `descGrupo`, `categoria`, `edificacion`, `grupo`,
`globalId`, `cantidad`, `unidad`, más `area` / `longitud` / `volumen` para derivar
cantidades en el camino IFC.

### Contrato de coordenadas: los elementos se guardan siempre en Z-up del IFC

`buildMeshes()` convierte de Z-up (IFC) a Y-up (Three.js) con
`(x, y, z)_ifc → (x, z, −y)_three`. Todo lo que produzca elementos debe entregarlos en
Z-up:

- **ifcopenshell** (el convertidor Python) ya devuelve Z-up. No se toca.
- **web-ifc** (carga directa en el navegador) devuelve **Y-up**, ya convertido para
  Three.js. Por eso `loadIFCDirect` deshace esa conversión al guardar los vértices:
  `[wx, −wz, wy]`. Si se omite, el edificio aparece **acostado**.

Equivalencia medida: `web-ifc.y = ifc.Z` (sin inversión) y `web-ifc.z = −ifc.Y`.
`COORDINATE_TO_ORIGIN` solo traslada, no invierte.

### Cantidades con dos decimales

Tres decimales se confunden con separador de miles. `.toFixed(2)` en toda la interfaz e
informes.

---

## Trampas conocidas de las librerías

Cada una de estas costó una sesión de depuración. Están resueltas; conviene no
reintroducirlas.

### web-ifc

- Usar la compilación **IIFE** (`web-ifc-api-iife.js`), no `web-ifc-api.js`, que es un
  módulo ES: cargado con una etiqueta `<script>` clásica nunca define `window.WebIFC` y
  produce `WebIFC is not defined`. La IIFE **solo existe desde la versión 0.0.57**; el
  proyecto usa la **0.0.68**.
- `SetWasmPath(url, true)` — el segundo argumento marca la ruta como absoluta. Sin él
  busca el `.wasm` junto al HTML y falla con *«both async and sync fetching of the wasm
  failed»*.
- `GetAllItemsOfType` ya no existe; ahora es `GetLineIDsWithType`. Se conserva un
  respaldo por si se baja de versión.
- Incluir `IFCCOVERING` y `IFCROOF` en los tipos: el federado tiene 1.694 revestimientos
  que si no se pierden.
- Las lecturas de propiedades van **por lotes con `await yld()`**. El federado tiene
  135.406 property sets y 377.796 propiedades; hacerlo de corrido congela la pestaña y
  el navegador la da por colgada.

### SheetJS y Chart.js

Estuvieron ausentes del HTML mucho tiempo: `window.XLSX` nunca existía y `new Chart(...)`
fallaba en silencio dejando el tab de Avance vacío. Ahora van como etiquetas `<script>`
(xlsx 0.18.5, chart.js 3.9.1) **y** con respaldo perezoso vía `ensureLib()`, por si la red
corporativa bloquea el CDN. Todo el consumo de estas librerías debe comprobar que existan.

### OrbitControls y la ventana de selección

OrbitControls escucha `pointerdown` en el mismo canvas y **se registra antes** que el
código de la aplicación. Un listener normal llega tarde: el giro ya arrancó y queda
estado a medias que hace girar la cámara sola después. Por eso el marquee escucha en
**fase de captura sobre `document`**, se adelanta y desactiva `controls.enabled` antes de
que OrbitControls vea el evento.

### Capturas 3D para el PDF

El renderer se crea con `preserveDrawingBuffer: true`; sin eso `toDataURL()` sale en
blanco. Durante la captura se pausa el bucle de render (`captureMode`), porque
`controls.update()` reposiciona la cámara y arruina el encuadre.

---

## Estructura de la aplicación

### Estado

```js
STATE = {
  elements: [],            // elementos del modelo, coordenadas Z-up
  meshes: {},              // globalId -> THREE.Mesh
  selected: new Set(),     // globalIds seleccionados ahora
  cutElements: new Set(),  // globalIds en cualquier corte = avance real
  cuts: [],                // cortes registrados
  modelOffset: [x,y,z],    // centro del bbox, se resta al construir mallas
}
```

Los cortes se guardan en `localStorage` bajo la clave **`eurbe_cuts`**, referenciando
elementos por `globalId`. Por eso sobreviven a recargar el modelo.

### Flujos de carga

**IFC directo** (`loadIFCDirect`): descarga web-ifc → abre el modelo → identifica
elementos → lee relaciones y psets por lotes → **pantalla de mapeo** → extrae geometría →
`loadModel()`.

**JSON** (`applyJSONMapping`): parsea → detecta parámetros disponibles
(`collectJSONFieldNames`, que aplana un nivel de anidamiento) → **pantalla de mapeo** →
reescribe los elementos a los campos internos → `loadModel()`.

Para modelos grandes conviene el convertidor Python: el federado de 78 MB tarda unos dos
minutos en `ifc_converter_v2.py` y luego carga en menos de un segundo, frente a varios
minutos en el navegador.

### Interacción en el 3D

Clic selecciona, Shift+clic acumula. **Ctrl + arrastrar** dibuja una ventana de selección
con la convención de Revit y AutoCAD: de izquierda a derecha en azul selecciona solo lo
**contenido por completo**; de derecha a izquierda en verde selecciona **todo lo que
toca**. Reemplaza la selección salvo con Shift. El cálculo usa la caja envolvente
proyectada a pantalla, no la geometría exacta — es una aproximación deliberada por
rendimiento (20 ms con 16.604 elementos).

### Informes

**Excel** (5 hojas): Historial Cortes · Cantidades por Actividad · Resumen Ejecutado ·
Cantidades Pendientes · Elementos por Corte.

**PDF**: consolidado de cantidades ejecutadas, una ficha por corte con su desglose por
actividad y una **captura 3D** con los elementos del corte en naranja sobre el edificio en
gris tenue, y la tabla de pendientes.

En ambos, el desglose separa por actividad porque **eso es lo que se paga**: «muros de 15»
y «muros de 20» son cantidades distintas y no deben ir sumadas. El consolidado elimina
duplicados por `globalId` para no cobrar dos veces un elemento que quedó en dos cortes.

Las columnas de **Edificación** (Torre 1, Torre 2, zona comunal…) aparecen solo si el
modelo distingue más de una. Lo mismo el filtro en el visor y en pendientes.

---

## Contexto de trabajo

- La app se abre con `file://` desde el disco de la usuaria, no hay servidor. Nada que
  dependa de un backend.
- Red corporativa de Ingeurbe: los CDN pueden estar filtrados. Todo lo que venga de
  internet necesita un mensaje de error claro y, si se puede, una alternativa sin
  conexión.
- Hay una skill corporativa (`ingeurbe-secure-delivery`) sobre publicación y despliegue.
  Si la conversación va hacia publicar, compartir enlaces o poner esto en producción,
  conviene consultarla antes de proponer una arquitectura.
- La usuaria no es desarrolladora. Conviene explicar la causa de los problemas en
  términos de lo que ve, no del código.
