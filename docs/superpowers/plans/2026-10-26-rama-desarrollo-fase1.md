# Rama de desarrollo y obra de pruebas (fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rama `desarrollo` que se prueba en local contra Firebase real, con un IFC sintético de 6 pisos para la obra de pruebas.

**Architecture:** Un módulo puro `js/entorno-nube.js` decide emuladores o nube real a partir de host, URL y lo recordado en `sessionStorage`; `firebase-config.js` y `js/nube.js` leen esa decisión. Un `.bat` cambia de rama y sirve la app. Un script Python con ifcopenshell genera el IFC.

**Tech Stack:** JS clásico (UMD como `js/texto.js`), `node --test`, Python 3 + ifcopenshell, Windows batch.

**Spec:** `docs/superpowers/specs/2026-10-26-rama-desarrollo-agente-voz-design.md`

## Global Constraints

- Localhost sin `?nube=real` → emuladores (`demo-eurbe`), sin cambios para Playwright y reglas.
- `?nube=real` → `eurbe-piloto`; se recuerda en `sessionStorage` (clave `eurbe-nube`); `?nube=emuladores` lo olvida.
- Puerto local de desarrollo: **5174**. URL: `http://localhost:5174/index.html?nube=real`.
- Franja visible «DESARROLLO · Firebase real» solo en localhost con nube real.
- IFC: `pruebas/edificio-pruebas-6-pisos.ifc`, 6 `IfcBuildingStorey` «Piso 1»…«Piso 6», pset `Ingeurbe` con `Nivel de construcción`, `Desc. Grupo`, `Descripción de la actividad`, `Categoría`, `Contrato`, `Cod Edificación`, `Unidad`, `Cantidad` (2 decimales). 400–600 elementos.
- Nada se fusiona a `main`.

## Review Focus

- `sessionStorage` bloqueado (lanza) → debe caer a emuladores en localhost, sin romper la carga. Test en Task 1.
- Producción (`*.github.io`) con `?nube=emuladores` → sigue en nube real (el parámetro solo vale en localhost). Test en Task 1.
- `127.0.0.1` se trata igual que `localhost`. Test en Task 1.
- El `.bat` con cambios sin guardar → se detiene sin cambiar de rama. Verificación manual en Task 2.
- IFC cargado por web-ifc → edificio de pie (Z-up). Verificación en Task 3.

---

### Task 1: Elección de nube (emuladores / real)

**Files:**
- Create: `js/entorno-nube.js`, `tests/unit/entorno-nube.test.mjs`
- Modify: `firebase-config.js`, `js/nube.js:10-13`, `index.html:1360` (cargar `js/entorno-nube.js` antes de `firebase-config.js`)

**Interfaces:**
- Produces: `elegirNube({ hostname: string, search: string, recordado: string|null }) -> { modo: 'emuladores'|'real', local: boolean, recordar: 'real'|null|undefined }` (`undefined` = no tocar lo recordado; `null` = borrarlo). En navegador: `window.EurbeEntornoNube = { elegirNube }` y `window.EURBE_NUBE = { modo, local }`.

- [ ] Test: localhost sin parámetro → `emuladores`; `?nube=real` → `real` y `recordar:'real'`; recordado `'real'` sin parámetro → `real`; `?nube=emuladores` con recordado → `emuladores`, `recordar:null`; `127.0.0.1` igual que localhost; `x.github.io?nube=emuladores` → `real`, `local:false`.
- [ ] Ejecutar `node --test tests/unit/entorno-nube.test.mjs` → FAIL (módulo no existe).
- [ ] Implementar; en navegador lee/escribe `sessionStorage` dentro de try/catch y pinta la franja en `DOMContentLoaded` si `local && modo==='real'`.
- [ ] `firebase-config.js` elige config por `window.EURBE_NUBE.modo`; `nube.js` usa emuladores solo si `window.EURBE_NUBE.modo === 'emuladores'`.
- [ ] `npm run test:unit` → PASS. Commit.

### Task 2: Rama, script de prueba y CHANGELOG

**Files:**
- Create: `scripts/probar_rama_desarrollo.bat`, `CHANGELOG.md`

- [ ] `git checkout -b desarrollo` (antes de Task 1) y `git push -u origin desarrollo`.
- [ ] `.bat` igual al de PAC: aborta con cambios versionados sin guardar, checkout + pull de `desarrollo`, `start` de la URL y `npx --yes http-server -p 5174 -c-1 .`.
- [ ] CHANGELOG con fecha/hora de Colombia y pasos manuales para crear entorno «Pruebas» y la obra «Obra de Pruebas · Agente de voz».
- [ ] Verificar: servidor responde en 5174 y la URL carga con la franja. Commit y push.

### Task 3: IFC de pruebas de 6 pisos

**Files:**
- Create: `scripts/generar_ifc_pruebas.py`, `pruebas/edificio-pruebas-6-pisos.ifc`
- Modify: `.gitignore` (añadir `!pruebas/*.ifc`)

- [ ] `pip install ifcopenshell`.
- [ ] Script: `python scripts/generar_ifc_pruebas.py [salida.ifc]`; edificio 20×12 m, piso 2,80 m, columnas en retícula, vigas, losas, muros de fachada e internos, piso cerámico por apartamento, losa de cubierta en Piso 6; color por grupo.
- [ ] Verificar: reabrir con ifcopenshell → 6 pisos, conteo 400–600, todos con pset `Ingeurbe`; `python ifc_converter_v2.py` lo convierte sin errores; carga en el visor de pie y con filtros poblados.
- [ ] Commit y push.
