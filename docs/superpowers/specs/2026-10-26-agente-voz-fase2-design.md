# E-Urbe · Agente de voz (fase 2)

Fecha: 26 de octubre de 2026 · Estado: **propuesto**
Continúa `2026-10-26-rama-desarrollo-agente-voz-design.md` (fase 1, hecha).
Referencia: agente de PAC (`2PorcentajeActividadesCumplidas/template/visualizador.html`).

## Intención

Hablarle al visor para **filtrar lo que se ve**, **seleccionar**, **consultar avance** y
**gestionar cortes** (registrar uno nuevo y cambiar su estado), con un agente de
ElevenLabs, probado solo en la rama `desarrollo` y en la obra de pruebas.

Frases tipo:
- «Muéstrame el piso 3» · «la mampostería del nivel 2» · «solo columnas y vigas del
  piso 5» · «muéstrame lo pendiente del piso 4» · «muéstrame todo».
- «Selecciona lo que se ve» · «quita la selección».
- «¿Cuánto va del piso 4?» · «¿qué cortes hay?».
- «Registra lo seleccionado como corte» · «pasa el corte 2 a aprobación».

## Anti-objetivos

- Que el agente registre o cambie un corte **sin que la persona lo haya oído y
  confirmado**.
- Que escriba cortes en una **obra real** mientras se prueba.
- Que una ventana del navegador (`confirm`/`prompt`/`alert`) congele la conversación.
- Saltarse permisos: las reglas de Firestore siguen decidiendo quién puede qué.

## Cómo se arma

Igual que PAC: widget `<elevenlabs-convai agent-id="…">` y **herramientas de cliente**
(`clientTools`) que atiende la página. Cada herramienta devuelve un texto que el agente
lee al usuario. Las herramientas **solo llaman funciones que ya existen** en
`index.html` / `js/cortes-nube.js`.

Archivos (*decisión mía*, siguiendo el patrón `*-logica.js` + UI del repo):

| Archivo | Qué es |
|---|---|
| `js/agente-voz-logica.js` | Puro, sin DOM: normalizar texto, emparejar lo dicho con las opciones del modelo, entender «nivel 2 / piso dos», confirmación en dos pasos. Con pruebas unitarias. |
| `js/agente-voz.js` | Une la lógica con `STATE`, filtros, cortes y el widget. |
| `docs/agente-voz/prompt.md` | Prompt del agente para pegar en ElevenLabs. |
| `docs/agente-voz/herramientas.md` | Definición de cada herramienta (nombre, parámetros) para crear en ElevenLabs. |
| `tests/unit/agente-voz-logica.test.mjs` | Pruebas. |

## Herramientas

| Herramienta | Parámetros | Hace |
|---|---|---|
| `filtrar_elementos` | `nivel`, `grupo`, `actividad`, `edificacion`, `contrato`, `estado` (`pendiente` / `en_corte` / `todos`); todos opcionales, texto libre | Empareja cada valor con las opciones del modelo, lo escribe en los filtros en cadena (`CADENA_FILTROS`, `MS`, `f-estado`) y llama a `applyFilters()`. Encuadra la cámara en lo visible. Responde «Mostrando 68 de 413 elementos: Piso 3». |
| `limpiar_filtros` | — | `clearFilters()` y encuadre general. |
| `seleccionar_visibles` | — | `selectByFilter(el => visible)`. |
| `limpiar_seleccion` | — | `clearSelection()`. |
| `consultar_avance` | — | Del filtro actual: total de elementos, cuántos pendientes, cuántos en corte por estado, y cantidades por unidad. |
| `consultar_cortes` | `estado` opcional | Lista los últimos cortes (número, estado, nº de elementos, nivel/actividad). |
| `registrar_corte` | `notas` opcional, `confirmado` (bool) | Ver «Confirmación». Registra lo seleccionado igual que el botón, sin `confirm()`. |
| `cambiar_estado_corte` | `corte` («2», «corte 2», «Corte 02»), `estado` (`revision` / `aprobacion` / `pagado`), `confirmado` | Ver «Confirmación». Usa `cambiarEstadoCorte()`. |

### Emparejar lo que se dice (`agente-voz-logica.js`)

- Sin tildes ni mayúsculas, ignorando conectores (de, del, la, el…), como en PAC.
- **Niveles**: «nivel 2», «piso dos», «segundo piso», «planta 2» → la opción del
  modelo cuyo número sea 2 (sea cual sea su nombre: «Piso 2», «N2», «Nivel 02»).
  Números en palabra del uno al veinte.
- **Varios valores** en grupo/actividad («columnas y vigas») → varias casillas.
- Plurales y singulares (`columna`/`columnas`, `viga`/`vigas`).
- Coincidencia: exacta → todas las palabras → la que más palabras comparta. Si quedan
  varias, **no se aplica nada** y se devuelven opciones numeradas para que el agente
  pregunte («¿la 1 o la 2?»), como en PAC.
- Un valor que no existe en el modelo responde con las opciones disponibles.
- Si se filtra por actividad sin decir grupo, se busca en todas las actividades.

### Confirmación (en la página, no solo en el prompt)

`registrar_corte` y `cambiar_estado_corte` funcionan en dos pasos:

1. Llamada sin `confirmado`: **no escribe nada**. Devuelve el resumen («Vas a registrar
  un corte con 68 elementos del Piso 3: 12,4 m³ de concreto… ¿Confirmas?») y guarda en
  memoria esa acción pendiente durante **2 minutos**.
2. Llamada con `confirmado: true`: solo ejecuta si coincide con la acción pendiente
  (misma selección o mismo corte y estado) y no ha vencido. Si no, vuelve al paso 1.

Así, aunque el modelo se salte la pregunta, la página no escribe sin un resumen previo.

### Restricciones de seguridad (*decisiones mías*)

- **Solo obra de pruebas**: las dos herramientas que escriben solo actúan si la obra
  abierta pertenece a un entorno llamado «Pruebas» (se lee con `Nube.listarEntornos()`
  al abrir la obra). En otra obra responden «En esta etapa el agente solo registra
  cortes en la obra de pruebas». Filtrar, seleccionar y consultar sí funcionan en
  cualquier obra.
- **Anular por voz no**: requiere motivo y una ventana `prompt()`; se hace a mano.
- Roles: se comprueba `SESION.rol` antes (consulta no registra) y las reglas del servidor
  tienen la última palabra; un rechazo se traduce con `Nube.traducirError` y se lee.
- Sin conexión (`SESION.soloLectura`): no escribe, lo dice.
- Duplicados: si lo seleccionado ya está en otros cortes, el resumen del paso 1 lo dice
  (en vez del `confirm()` del botón).

### Widget

- Aparece solo cuando hay un modelo cargado. Botón ⏹ para cerrar la sesión del agente,
  como en PAC.
- El `agent-id` va en una constante de `js/agente-voz.js`.
- Sin interruptor en Firestore por ahora (exigiría tocar `firestore.rules`); el widget no
  consume créditos mientras no se inicie una conversación.

## Lo que haces tú en ElevenLabs

1. Crear un agente nuevo (no el de PAC), idioma español.
2. Pegar el prompt de `docs/agente-voz/prompt.md`.
3. Crear las 8 herramientas de tipo **Client** de `docs/agente-voz/herramientas.md`,
   marcando «esperar respuesta».
4. Si el agente tiene lista de dominios permitidos, añadir `localhost`.
5. Pasarme el `agent-id`.

## Pruebas

- Unitarias de `agente-voz-logica.js`: niveles («nivel 2», «piso dos», «segundo
  piso» → «Piso 2»), plurales, varios valores, ambigüedad con opciones, valor
  inexistente, confirmación (sin pendiente / vencida / distinta / válida).
- En navegador (Playwright, `eurbe.html` no aplica porque no tiene cortes en la nube):
  llamar a las herramientas desde la consola sobre `index.html` con el IFC de pruebas y
  comprobar filtros visibles y respuestas.
- Manual con voz en la obra de pruebas.

## Queda a criterio de quien construya

Redacción exacta de las respuestas, el encuadre de cámara y el estilo del botón ⏹.
