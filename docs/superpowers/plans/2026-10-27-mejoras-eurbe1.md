# Mejoras traídas de «eurbe 1.html» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Incorporar en `index.html` (rama `desarrollo`) las mejoras 1–9 aprobadas, sin romper la versión rápida del visor ni la lógica de nube.

**Architecture:** Todo sobre la geometría unida (`MODELO`/`Pieza`). Tema y aristas cuelgan de `scene`, no de `meshGroup`. «Rechazado» es un estado más de corte: no cuenta como avance (`STATE.rejectedElements`), con transición permitida en `firestore.rules`.

**Spec:** lista aprobada en la conversación del 27-oct (numerales 1–9; A–D fuera).

## Global Constraints
- No volver a una malla por elemento; Lambert; sin niebla por software (`VISOR.software`); todo cambio visual llama a `pedirRender()`.
- Informes (PDF, Excel) siempre con paleta clara y aristas (`forzarTemaCaptura`).
- El avance lo definen solo los cortes; un corte rechazado no suma.

## Review Focus
- Tema claro + aristas apagadas: el modelo no debe fundirse con el fondo (aristas encendidas por defecto en claro).
- Filtro que oculta piezas → aristas de esas piezas también ocultas.
- PDF de un corte cuyo modelo no tiene los elementos → mensaje «sin vista 3D», no error.
- Cambiar contrato con casillas marcadas de otro → se sueltan, la tabla no queda en cero sin explicación.
- Corte rechazado reabierto (rechazado → revisión) vuelve a contar como avance.

### Task 1: Visor — tema, luces, caras planas, niebla, aristas (1–4)
- `buildMeshes`: vértices por cara (normales planas), `Pieza` igual.
- `TEMAS`, `setTema`, `LUCES_PRESETS`, `aplicarContraste`, `ARISTAS` fusionado, menú 🎨 (Visualización / Fondo del visor), `--c-visor`, rejilla según tema.
- Capturas PDF/Excel con `forzarTemaCaptura`/`restaurarTemaCaptura`.

### Task 2: Estado «Rechazado» (5)
- `CUT_ESTADOS.rechazado`, `rebuildCutIndex`, `getMeshColor`, leyenda, Avance, filtro Estado, agente (`normalizarEstado`, `transicionPermitida`, `estadoDeFiltro`) con pruebas unitarias.
- `firestore.rules`: `revision|aprobacion → rechazado` (admin), `rechazado → revision` (admin); prueba de reglas.

### Task 3: Exportaciones y Contratos (6–9)
- PDF: selector de corte (`abrirOpcionesPDF`, `captureCutImages(onProgress, soloEstos)`).
- Excel Contratos: `ctComponerLamina`, miniaturas 760×430 → 420×304.
- `ctCambiarContrato` + `ctPodarSeleccion`.
- Pestañas maqueta «Modelo de control» y «Pedidos».
- Verificación en navegador (Playwright) y `npm run test:unit`.
