# E-Urbe · Rama de desarrollo, obra de pruebas y agente de voz

Fecha: 26 de octubre de 2026 · Estado: **propuesto**
Referencia: repositorio `2PorcentajeActividadesCumplidas` (PAC), que ya tiene rama
`desarrollo`, script de prueba local, proyecto de pruebas y agente de ElevenLabs.

## Intención

Poder probar un **agente de voz de ElevenLabs** dentro de E-Urbe sin tocar la versión
que usa la gente ni las obras reales. El agente debe permitir, hablando:

- **Filtrado visual**: «muéstrame el piso 3», «la mampostería del nivel 2», «limpia los
  filtros».
- **Seleccionar** lo que se está viendo («selecciona todo el piso 2»).
- **Cortes**: registrar lo seleccionado como corte nuevo y **cambiar el estado de un
  corte** (revisión → aprobación → pagado, etc.).

Se hace en dos fases. La **fase 1** (este documento, en detalle) monta el entorno de
pruebas. La **fase 2** (esbozada al final) integra el agente; se afina cuando la fase 1
esté funcionando.

## Objetivos

1. Rama `desarrollo` en EURBEV1, separada de `main` (producción).
2. Probar `desarrollo` en el PC contra el **Firebase real** (`eurbe-piloto`), con un
   doble clic, igual que en PAC.
3. Una **obra de pruebas** en Firebase real con un **IFC de pruebas**: un edificio de
   **6 pisos** con parámetros parecidos a los de los modelos de Ingeurbe.
4. Registro de cambios (`CHANGELOG.md`).

## No objetivos

- Publicar nada en producción (`main`) en esta etapa.
- Cambiar la lógica de cortes, permisos (`firestore.rules`) o filtros existentes.
- Sustituir los emuladores: las pruebas automáticas (`npm run test:*`) siguen usándolos.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que una prueba registre o cambie cortes en una **obra real**: los cortes son la base
  del pago.
- Que un push a `desarrollo` publique en GitHub Pages.
- Que las pruebas e2e dejen de ir contra emuladores.

---

## Fase 1 · Entorno de pruebas

### 1. Rama `desarrollo`

- Se crea desde `main` y se sube a GitHub.
- Hoy no hay workflow: GitHub Pages publica directamente desde `main` (a confirmar en
  *Settings → Pages*; si publicara desde otra rama, se ajusta). Por eso un push a
  `desarrollo` no publica nada.
- Flujo: se trabaja en `desarrollo` → se prueba en local → cuando algo esté aprobado se
  fusiona a `main`.

### 2. Probar en local contra Firebase real

Hoy, en `localhost`, `firebase-config.js` y `js/nube.js` se conectan **siempre** a los
emuladores (`demo-eurbe`). Hay que poder elegir:

- **Por defecto en localhost: emuladores** (sin cambios, lo que usan Playwright y las
  pruebas de reglas).
- **Con `?nube=real` en la URL: Firebase real** (`eurbe-piloto`), aunque sea localhost.
  *(Decisión mía: un parámetro explícito y no otro puerto o nombre de host, para que
  sea imposible llegar a la nube real por accidente desde una prueba automática.)*
  Se recuerda en `sessionStorage` para que siga activo al recargar dentro de la
  pestaña.
- La app muestra una franja visible «DESARROLLO · Firebase real» cuando está en
  localhost con nube real, para no confundir la pestaña con la de producción.
- Requisito de Firebase: `localhost` debe estar en *Authentication → Settings →
  Authorized domains* (viene por defecto; se verifica).

### 3. Script `scripts/probar_rama_desarrollo.bat`

Mismo comportamiento que el de PAC:

1. Comprueba que no haya cambios sin guardar en archivos versionados (`git status
   --porcelain -uno`); si los hay, avisa y se detiene.
2. `git checkout desarrollo` y `git pull origin desarrollo`.
3. Levanta un servidor sin caché en el puerto **5174** (*decisión mía*: el 5173 lo usa
   Playwright) con `npx --yes http-server -p 5174 -c-1 .`.
4. Abre `http://localhost:5174/index.html?nube=real`.

### 4. IFC de pruebas: edificio de 6 pisos

Generado por un script **`scripts/generar_ifc_pruebas.py`** (ifcopenshell), para poder
regenerarlo o ampliarlo. Salida: `pruebas/edificio-pruebas-6-pisos.ifc`.

Contenido (*decisión mía*, se ajusta si hace falta):

- `IfcProject` → `IfcSite` → `IfcBuilding` «Torre Pruebas» → **6 `IfcBuildingStorey`**
  (Piso 1 … Piso 6), altura de piso 2,80 m. Planta rectangular de unos 20 × 12 m.
- Por piso:
  - **Estructura**: losa (`IfcSlab`), columnas en retícula (`IfcColumn`), vigas
    perimetrales e interiores (`IfcBeam`).
  - **Mampostería**: muros de fachada y divisorios (`IfcWall`).
  - **Acabados**: un piso (`IfcCovering`) por apartamento.
  - Piso 6 lleva además cubierta (`IfcRoof` o losa de cubierta).
- Del orden de **400–600 elementos**: suficiente para ver el filtrado y medir, pero
  rápido de cargar.
- Geometría simple por extrusión (`IfcExtrudedAreaSolid`), en Z-up como cualquier IFC,
  con color por grupo para que se distinga a simple vista.
- Un pset de usuario `Ingeurbe` en cada elemento con nombres que la pantalla de mapeo
  ya reconoce por sí sola (`PARAM_CANDIDATES`):
  - `Nivel de construcción`: «Piso 1» … «Piso 6»
  - `Desc. Grupo`: «Estructura», «Mampostería», «Acabados»
  - `Descripción de la actividad`: p. ej. «Losa de entrepiso», «Columnas», «Vigas»,
    «Mampostería de fachada», «Mampostería interna», «Piso cerámico»
  - `Categoría`, `Contrato` (dos contratos de prueba), `Cod Edificación` («Torre
    Pruebas»), `Unidad` y `Cantidad` (m², m³ o ml según el elemento, a dos decimales).
- El `.gitignore` excluye `*.ifc` porque el repo es público y los modelos de clientes no
  deben subirse. Este IFC es sintético, así que se añade una excepción solo para
  `pruebas/*.ifc` (*decisión mía*).
- Verificación: se carga en el visor por las dos vías (IFC directo en el navegador y
  `ifc_converter_v2.py` → JSON); deben salir los 6 pisos de pie, los filtros en cadena
  deben ofrecer los niveles, grupos y actividades, y se debe poder registrar un corte.

### 5. Obra de pruebas en Firebase real

- Un **entorno «Pruebas»** con una sola obra, **«Obra de Pruebas · Agente de voz»**.
  Solo los administradores (y quien se asigne a ese entorno) la ven, así que los
  usuarios de las obras reales no la encuentran.
- La crea un administrador desde la app (*Obra ▾ → Gestionar entornos / Crear obra*) y
  sube allí el IFC de pruebas. Es un paso manual tuyo, porque requiere tu inicio de
  sesión; se deja descrito paso a paso en el CHANGELOG.

### 6. `CHANGELOG.md`

Mismo formato que el de PAC (fecha y hora de Colombia, lista de cambios). Registra solo
cambios de la aplicación, nunca datos de obra.

### Pruebas de la fase 1

- `npm run test:unit` y `npm run test:e2e` siguen pasando (siguen yendo a emuladores).
- Prueba unitaria de la elección de entorno: localhost sin parámetro → emuladores;
  localhost con `?nube=real` → `eurbe-piloto`; dominio de Pages → `eurbe-piloto`.
- Manual: doble clic en el `.bat` → abre con la franja de desarrollo → inicio de sesión
  real → se ve la obra de pruebas con el edificio de 6 pisos.

---

## Fase 2 · Agente de voz (esbozo)

Mismo patrón que PAC: widget `<elevenlabs-convai>` y **herramientas de cliente** que la
página atiende. Agente **nuevo** en ElevenLabs, distinto del de PAC (*suposición mía*,
porque sus herramientas son otras). Código en un módulo propio `js/agente-voz.js`.

Herramientas previstas:

| Herramienta | Qué hace | Cómo, por dentro |
|---|---|---|
| `filtrar_elementos` | «muéstrame el piso 3», «la mampostería del nivel 2» | Escribe en los filtros en cadena (`CADENA_FILTROS`: edificación, nivel, grupo, actividad, estado) y llama a `applyFilters()` |
| `limpiar_filtros` | «muéstrame todo» | `clearFilters()` |
| `seleccionar_visibles` | «selecciona todo lo que se ve» | Mete en `STATE.selected` lo visible y repinta |
| `registrar_corte` | «registra lo seleccionado como corte» | Usa el mismo `registerCut()` de `cortes-nube.js` |
| `cambiar_estado_corte` | «pasa el corte 5 a aprobación» | Usa `cambiarEstadoCorte()`; las reglas del servidor siguen decidiendo quién puede qué |
| `consultar_estado` | «¿cuánto va del piso 4?» | Cuenta elementos y cortes del filtro actual |

- Búsqueda tolerante como en PAC: sin tildes, sin importar el orden de las palabras, y
  equivalencias de voz («nivel 2» = «piso 2»). Si hay varias coincidencias, el agente
  ofrece opciones numeradas.
- **Seguridad** (*decisiones mías*, por el anti-objetivo de los pagos):
  - Antes de registrar un corte o cambiar un estado, el agente lee en voz alta qué va a
    hacer (número de elementos, corte, estado) y espera un «sí».
  - Mientras se prueba, las herramientas que escriben (`registrar_corte`,
    `cambiar_estado_corte`) solo actúan en obras del entorno «Pruebas»; en cualquier
    otra obra responden que no está permitido.
  - Interruptor para apagar el agente y que no consuma créditos, como en PAC.
- Se diseña en detalle (prompt del agente, parámetros exactos de cada herramienta) al
  terminar la fase 1.

## Queda a criterio de quien construya

- Las medidas exactas del edificio, la retícula de columnas y cuántos apartamentos por
  piso, mientras se respete lo anterior.
- El texto y el estilo exactos de la franja de desarrollo.
