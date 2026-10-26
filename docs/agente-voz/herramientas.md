# Herramientas del agente de voz E-Urbe (ElevenLabs)

Crear cada una en **Agent → Tools → Add tool → Client tool**, con:

- **Name**: exactamente el nombre indicado (la página las busca por ese nombre).
- **Description**: el texto indicado.
- **Wait for response**: activado (el agente debe esperar el texto que devuelve la página).
- **Response timeout**: 15 segundos (con 1 s, el valor por defecto, la respuesta no alcanza a llegar).
- Después de crear o cambiar herramientas, **Publicar** el agente: el widget usa la versión publicada, no el borrador.
- `docs/agente-voz/prompt.md` es solo el texto del prompt: se pega completo en **System prompt**. First message: «Hola, soy el asistente de E-Urbe. ¿Qué quieres ver del modelo?»
- **Parameters**: los indicados. Ninguno es obligatorio salvo que diga «requerido».

La página las atiende en `js/agente-voz.js`. Todas devuelven un texto para leer.

---

## 1. `filtrar_elementos`

**Description:** Filtra lo que se ve en el modelo 3D por nivel, grupo, actividad, contrato, edificación o estado. Pasa las palabras tal como las dijo la persona. Reemplaza el filtro anterior salvo que acumular sea true.

| Identifier | Type | Description |
|---|---|---|
| `nivel` | string | Nivel o piso, como lo dijo la persona: "piso 3", "nivel dos", "segundo piso". |
| `grupo` | string | Grupo de elementos: "estructura", "mampostería", "acabados". |
| `actividad` | string | Actividad o actividades: "columnas", "columnas y vigas", "mampostería de fachada". |
| `contrato` | string | Contrato, si la persona lo menciona. |
| `edificacion` | string | Edificación o torre, si la persona la menciona. |
| `estado` | string | "pendiente", "en corte" o "todos". |
| `acumular` | boolean | true para sumar este filtro al que ya se ve en vez de reemplazarlo. |

## 2. `limpiar_filtros`

**Description:** Quita todos los filtros y muestra el modelo completo.
Sin parámetros.

## 3. `seleccionar_visibles`

**Description:** Selecciona todos los elementos que se ven en este momento (para luego registrarlos como corte).
Sin parámetros.

## 4. `limpiar_seleccion`

**Description:** Quita la selección actual.
Sin parámetros.

## 5. `consultar_avance`

**Description:** Dice cuántos elementos de lo que se ve están en cortes (por estado) y cuántos pendientes, con sus cantidades.
Sin parámetros.

## 6. `consultar_cortes`

**Description:** Lista los cortes registrados en la obra (número, estado, elementos, nivel y actividad).

| Identifier | Type | Description |
|---|---|---|
| `estado` | string | Opcional: "en revisión", "en aprobación" o "pagado" para listar solo esos. |

## 7. `registrar_corte`

**Description:** Registra los elementos seleccionados como un corte nuevo. Funciona en dos pasos: sin confirmado devuelve un resumen para leer; con confirmado=true, después de que la persona dijo que sí, lo registra.

| Identifier | Type | Description |
|---|---|---|
| `notas` | string | Nota opcional del corte, si la persona la dicta. |
| `confirmado` | boolean | true solo después de leer el resumen y que la persona confirme. |

## 8. `cambiar_estado_corte`

**Description:** Cambia el estado de un corte a en revisión, en aprobación o pagado. Funciona en dos pasos: sin confirmado devuelve un resumen para leer; con confirmado=true, después de que la persona dijo que sí, lo cambia.

| Identifier | Type | Description |
|---|---|---|
| `corte` | string | **Requerido.** Número del corte: "2", "corte 2", "corte dos". |
| `estado` | string | **Requerido.** "en revisión", "en aprobación" o "pagado". |
| `confirmado` | boolean | true solo después de leer el resumen y que la persona confirme. |

---

## Probar las herramientas sin voz

Con un modelo cargado, en la consola del navegador (F12):

```js
await EurbeAgenteVoz.herramientas.filtrar_elementos({ nivel: 'piso 3' })
await EurbeAgenteVoz.herramientas.consultar_avance({})
```
