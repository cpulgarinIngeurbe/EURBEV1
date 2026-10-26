# Registro de cambios - E-Urbe

> Nota: este log registra cambios de la aplicación (código), no datos de obra.
> Los datos de obra (modelos, cortes, accesos) viven únicamente en Firestore,
> nunca en este repositorio.

## 2026-10-26 13:06 (hora Colombia)

- Se crea este registro de cambios.
- Se creó la rama `desarrollo` para implementar nuevas funcionalidades (empezando por
  el agente de voz de ElevenLabs) sin afectar `main` (producción). GitHub Pages
  publica desde `main`, así que un push a `desarrollo` no publica nada.
- En `localhost` la app sigue usando los emuladores por defecto. Con `?nube=real` en
  la URL usa el Firebase real (`eurbe-piloto`) y muestra la franja
  «DESARROLLO · Firebase real». Se recuerda en la pestaña; `?nube=emuladores` lo
  revierte. Fuera de localhost no cambia nada (`js/entorno-nube.js`).
- Se agregó `scripts/probar_rama_desarrollo.bat` para probar la rama `desarrollo`
  en local (puerto 5174) contra el Firebase real.
- Se agregó `scripts/generar_ifc_pruebas.py` y el modelo sintético
  `pruebas/edificio-pruebas-6-pisos.ifc` (Torre Pruebas, 6 pisos) para la obra de
  pruebas.

### Pasos manuales pendientes (administrador, una sola vez)

1. Doble clic en `scripts/probar_rama_desarrollo.bat` e iniciar sesión con la cuenta
   de administrador.
2. **Obra ▾ → Gestionar entornos**: crear el entorno **«Pruebas»**.
3. **Obra ▾ → Crear obra**: «Obra de Pruebas · Agente de voz», marcando **solo** el
   entorno «Pruebas».
4. Abrir esa obra y subir `pruebas/edificio-pruebas-6-pisos.ifc`. En la pantalla de
   mapeo los campos deben quedar detectados solos (Nivel de construcción, Desc. Grupo,
   Descripción de la actividad, Contrato, Cod Edificación, Unidad, Cantidad).
5. Todas las pruebas de cortes (y luego del agente de voz) se hacen **solo en esa
   obra**.
