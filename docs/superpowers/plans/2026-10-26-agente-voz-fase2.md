# Agente de voz (fase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Herramientas de cliente de ElevenLabs para filtrar, seleccionar, consultar y gestionar cortes por voz en E-Urbe.

**Architecture:** `js/agente-voz-logica.js` (puro, UMD) entiende lo dicho y lleva la confirmación en dos pasos; `js/agente-voz.js` lo une con `STATE`, filtros, cortes y el widget. `js/cortes-nube.js` expone el registro de corte sin `confirm`/`alert`.

**Tech Stack:** JS clásico, `node --test`, Playwright para verificación, widget `@elevenlabs/convai-widget-embed`.

**Spec:** `docs/superpowers/specs/2026-10-26-agente-voz-fase2-design.md`

## Global Constraints

- Herramientas: `filtrar_elementos`, `limpiar_filtros`, `seleccionar_visibles`, `limpiar_seleccion`, `consultar_avance`, `consultar_cortes`, `registrar_corte`, `cambiar_estado_corte`. Todas devuelven texto.
- Escrituras: solo con entorno de la obra llamado «Pruebas»; confirmación en dos pasos, vigencia 120 000 ms; estados `revision` / `aprobacion` / `pagado`; nunca `anulado`.
- Ninguna herramienta abre `confirm`/`prompt`/`alert`.
- Sin `agent-id` no se crea el widget, pero las herramientas quedan en `window.EurbeAgenteVoz.herramientas`.

## Review Focus

- Filtro que no encaja tras otro («actividad que no existe en ese nivel») → no deja la vista a medias: restaura los filtros previos. Prueba en Task 3.
- `confirmado: true` sin propuesta previa o con otra selección → no escribe, vuelve a proponer. Test en Task 1.
- «nivel 10» frente a «Piso 1» → no confunde 10 con 1. Test en Task 1.
- Obra fuera del entorno «Pruebas» → escrituras rechazadas con mensaje. Prueba en Task 3.
- Corte inexistente («corte 99») → mensaje con cortes disponibles. Prueba en Task 3.

---

### Task 1: Lógica pura

**Files:** Create `js/agente-voz-logica.js`, `tests/unit/agente-voz-logica.test.mjs`

**Interfaces (Produces):**
- `normalizar(s) -> string`
- `numeroDe(texto) -> number|null` (dígitos, cardinales y ordinales uno…veinte)
- `emparejar(dicho, opciones, { nivel?: bool, multi?: bool }) -> { valores: string[], ambiguo: bool, candidatos: string[] }`
- `normalizarEstado(texto) -> 'revision'|'aprobacion'|'pagado'|'anulado'|null`
- `crearConfirmador(ahora = Date.now, vigencia = 120000) -> { proponer(clave, datos), confirmar(clave) -> datos|null }`

- [ ] Tests: «nivel 2»/«piso dos»/«segundo piso» → `Piso 2`; «nivel 10» no da `Piso 1`; «columnas y vigas» (multi) → ambas; «mamposteria» (multi) → todas las actividades que la contienen; singular «columna» → `Columnas`; inexistente → `valores: []`; varias en filtro simple → `ambiguo`; estados hablados; confirmador: sin propuesta, vencida, otra clave, válida (y de un solo uso).
- [ ] FAIL → implementar → `npm run test:unit` PASS → commit.

### Task 2: Registro de corte sin ventanas

**Files:** Modify `js/cortes-nube.js`

- [ ] Extraer `window.registrarSeleccionComoCorte({ notes, date }) -> Promise<{id, number}>` (lanza error); `registerCut` la usa y conserva su `confirm`/`alert`.

### Task 3: Herramientas, widget y documentación

**Files:** Create `js/agente-voz.js`, `docs/agente-voz/prompt.md`, `docs/agente-voz/herramientas.md`; Modify `index.html` (script), `js/ui-nube.js` (`SESION.obraEntornos`, gancho `alModeloCargadoAgente`), `CHANGELOG.md`.

- [ ] Implementar las 8 herramientas según la spec; encuadre con las cajas de las piezas visibles; sincronizar chip de nivel.
- [ ] Verificar con Playwright (sin Java no hay emuladores): cargar el IFC de pruebas en `eurbe.html` (mismo `STATE` y filtros), inyectar `js/cortes-logica.js` + `js/agente-voz-logica.js` + `js/agente-voz.js` con `SESION`/`Nube` simulados y llamar a cada herramienta.
- [ ] Commit y push a `desarrollo`.
