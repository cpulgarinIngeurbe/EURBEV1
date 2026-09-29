# E-Urbe · Entornos de trabajo

Fecha: 29 de septiembre de 2026 · Estado: **implementado**
Complementa `docs/diseno-nube.md`.

## Objetivo

Cada persona ve solo las obras de los **entornos** que el administrador le asigna. Un
entorno agrupa obras; una obra puede estar en varios entornos. El control lo hace el
servidor (reglas de Firestore), no solo la pantalla.

## Decisiones acordadas

| Pregunta | Decisión |
|---|---|
| ¿Qué es un entorno? | Una carpeta de obras con permisos. Cada obra sigue igual: un modelo, sus versiones, sus cortes y su numeración. |
| ¿Rol por persona o por entorno? | **Uno por persona**, válido en todos sus entornos. |
| ¿Administradores? | Ven y gestionan **todos** los entornos y obras. |
| ¿Obra en varios entornos? | **Sí.** |
| ¿Qué pasa con lo existente? | Pasa a un entorno «General» automáticamente. |

## Datos

- `entornos/{id}`: `nombre`, `creadoPor`, `fecha`. El inicial tiene id `general`.
- `obras/{id}.entornos`: lista de ids de entorno.
- `accesos/{correo}.entornos`: lista de ids de entorno (se ignora para administradores).

## Permisos (firestore.rules)

- Obra visible si `esAdmin()` o `obra.entornos` comparte algún id con `acceso.entornos`.
  Obras sin entornos: solo administradores.
- Lo mismo para todo lo que cuelga de la obra (modelos, trozos, cortes): leer,
  registrar y cambiar estado exigen ver la obra.
- Los no administradores listan obras con `where('entornos', 'array-contains-any', …)`
  (máximo 30 entornos por consulta; `nube.js` parte en bloques). Una consulta sin ese
  filtro se rechaza.
- `entornos/{id}`: lo lee el admin o quien lo tiene asignado; solo el admin crea y
  renombra; nadie borra.
- `entornos` en obras y accesos debe ser una lista; solo el admin la cambia.

## Pantallas

- **Obra ▾ → Gestionar entornos** (admin): crear, renombrar, y marcar las obras de cada
  entorno (marcar no quita la obra de sus otros entornos).
- **Gestionar accesos**: columna «Entornos» con casillas; el alta también las lleva.
  Los administradores muestran «Todos».
- **Crear obra** (admin): casillas de entornos; si solo existe uno, viene marcado.
- **Elige la obra**: agrupada por entorno; el admin ve además «Sin entorno».
  Sin entornos asignados: «Aún no tienes entornos asignados, pídelo al administrador».

## Migración

La primera vez que un administrador entra y no existe ningún entorno: se crea
«General» (`general`) y se asigna a todas las obras y personas no administradoras que
no tengan el campo. Si ya hay entornos, no hace nada (`EurbeEntornos.planMigracion`).

## Pruebas

- `tests/unit/entornos-logica.test.mjs`: agrupación y plan de migración.
- `tests/rules/reglas.test.mjs`: bloque «Entornos» (lectura, listado filtrado, cortes y
  modelo de obras ajenas, gestión solo admin, tipos).
- `tests/e2e/entornos.spec.mjs`: migración, alta con entornos, visibilidad por persona,
  obra en dos entornos, persona sin entornos.

## Fuera de alcance

- Borrar entornos (un entorno vacío no molesta).
- Roles distintos por entorno y administradores limitados a ciertos entornos.
