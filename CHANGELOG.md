# Registro de cambios - E-Urbe

> Nota: este log registra cambios de la aplicación (código), no datos de obra.
> Los datos de obra (modelos, cortes, accesos) viven únicamente en Firestore,
> nunca en este repositorio.

## 2026-11-03 17:32 (hora Colombia) · inicio: agente de voz económico (pruebas)

- Estado de partida: `main` y `desarrollo` en `f4fe2b2` (mejoras de eurbe 2 en
  producción). Punto de regreso si algo sale mal: ese mismo commit.
- Motivo: el agente de ElevenLabs funciona bien pero cobra por minuto de conversación
  (alrededor de US$0,08/min más el modelo), demasiado caro para el uso diario.
- Plan, solo en `desarrollo` y en la obra de «Pruebas»:
  - Oído y voz del propio navegador (Chrome/Edge), sin costo.
  - Cerebro: DeepSeek con llamada a herramientas, a través de un intermediario que
    guarda la clave (la clave nunca va en la página).
  - Se reutilizan las 8 herramientas actuales, la confirmación en dos pasos y la regla
    de escribir solo en «Pruebas».
  - ElevenLabs se conserva como opción que se puede volver a encender.
- Producción no cambia hasta validar.
- Hecho en `desarrollo`:
  - `js/agente-ia-logica.js`: prompt, herramientas para el modelo y la vuelta de
    conversación, con pruebas en `tests/unit/agente-ia-logica.test.mjs`.
  - `js/agente-voz-economico.js`: botón de micrófono, panel (también se puede
    escribir), reconocimiento y voz del navegador.
  - `proxy-ia/worker.js`: intermediario en Cloudflare que guarda la clave y verifica
    la sesión de Firebase.
  - `js/agente-voz.js`: elige el motor. Si `URL_PROXY` está vacía, o con
    `?voz=elevenlabs`, sigue ElevenLabs.
  - Pasos de instalación en `docs/agente-voz/economico.md`.
  - Pendiente: crear la cuenta de DeepSeek y el Worker, y poner su dirección en
    `URL_PROXY`.

## 2026-11-03 13:53 (hora Colombia) · mejoras traídas de «eurbe 2.html»

- Módulo **Pedidos** de material (pestaña «Pedidos», ya no es maqueta): mampostería,
  enchape y concreto. Se arma con la selección del visor o con un filtro; agrupa por
  torre y tipo (o resistencia) y convierte a unidades/pacas, cajas + pegante + mortero
  o m³. Estados, fecha en obra y «pedir a más tardar», remisiones (dónde se vació),
  entradas, facturas, revisión de documentos, consumo real de concreto, catálogo de
  materiales y rendimientos, y Excel del pedido con fórmulas vivas.
  Por ahora se guarda en el navegador, separado por obra; pasarlo a Firestore es el
  siguiente paso.
- Actividades por metro lineal (nombre terminado en «ml»): la cantidad sale de la
  longitud (horizontal) o la altura (vertical). Se usa en el panel de propiedades,
  al registrar cortes, pendientes, Excel, PDF, dona de pagos y agente de voz.
- Contratos: columnas «Unidad detectada» y «Unidad de pago» (editable), total ML,
  el grupo forma parte de la línea, y Excel nuevo «Memoria de cantidades» (grupo,
  actividad, unidad de pago, cantidad y vista 3D grande con el resto del edificio en
  gris de contexto). La lámina muestra la unidad de pago.
- PDF: se eligen los cortes con casillas (Todos / Ninguno). Cada ficha trae
  Contratado / A pagar / Acumulado / Pendiente; la vista 3D pinta el corte con el
  color de su estado y lo pagado en cortes anteriores en gris oscuro.
- Filtro de Nivel con casillas (varios niveles a la vez); el agente de voz lo usa.
- Mapeo del parámetro TaskID (opcional) en JSON e IFC.
- Al cambiar de módulo los colores del visor se restablecen bien.
- Corregido al traerlo: la lista de cortes del PDF ya no falla al abrir; el aviso de
  «N con vista 3D» del Excel de Contratos; el contratado del PDF cruza por contrato,
  edificación, actividad y unidad (antes podía salir en 0 en actividades por ml); la
  barra de totales de Contratos tiene espacio para la sexta casilla (ML); el total del
  Excel de Contratos solo se suma si todas las líneas tienen la misma unidad; con
  «Ninguno» marcado el PDF pide elegir un corte en vez de imprimirlos todos.
- No se trajeron: filtro «Ejecutados (IFC)», cortes en el navegador ni dibujo pieza
  por pieza (irían contra la versión en la nube y el rendimiento).

## 2026-10-27 (hora Colombia) · mejoras traídas de «eurbe 1.html»

- Fondo del visor claro u oscuro (menú 🎨), recordado por navegador; los informes
  salen siempre en claro.
- Aristas marcadas (menú 🎨), encendidas por defecto en el tema claro.
- Luz más suave en el tema claro, caras planas y niebla proporcional (solo con
  tarjeta gráfica). El tema oscuro conserva la luz de siempre.
- Estado de corte «Rechazado» (rojo): solo el administrador rechaza (desde revisión o
  aprobación) y puede reabrir o anular. No cuenta como avance; filtro «Rechazados»;
  también por voz. Cambia `firestore.rules`.
- PDF de un solo corte o de todos (Exportar → PDF).
- Excel de Contratos con miniaturas grandes y lámina (grupo, actividad, cantidades).
- Contratos: cambiar de contrato reconstruye el árbol y suelta lo que no aplica.
- Pestañas «Modelo de control» y «Pedidos» como maqueta («pronto»).
- No se trajeron: filtro «Ejecutados (IFC)», cortes en el navegador, dibujo pieza por
  pieza ni cambio de estado libre (irían contra la versión en la nube).

## 2026-10-27 (hora Colombia)

- Filtro «Estado» con estados de pago: además de Pendientes y En cortes registrados,
  ahora En revisión, En aprobación y Pagado (manual y por voz: «lo pagado de
  estructura»). Un elemento cuenta con el estado más avanzado de sus cortes.
- Agente de voz: registra en la consola (F12, filtro `agente-voz`) cada llamada a
  herramientas. Prompt limpio con la regla de llamar siempre las herramientas.

## 2026-10-26 13:56 (hora Colombia)

- Agente de voz (ElevenLabs), solo en `desarrollo`: `js/agente-voz.js` y
  `js/agente-voz-logica.js`. Herramientas: `filtrar_elementos`, `limpiar_filtros`,
  `seleccionar_visibles`, `limpiar_seleccion`, `consultar_avance`, `consultar_cortes`,
  `registrar_corte`, `cambiar_estado_corte`.
- Entiende «nivel 2», «piso dos», «segundo piso»; plurales; varios valores
  («columnas y vigas»). Si hay duda, ofrece opciones numeradas y no cambia la vista.
- Registrar un corte o cambiar su estado va en dos pasos (resumen y confirmación,
  vigente 2 minutos) y solo en obras del entorno «Pruebas». Anular no va por voz.
- `cortes-nube.js`: el registro de corte se separó en
  `registrarSeleccionComoCorte()`, sin ventanas, para que lo use el agente. El botón
  sigue igual.
- `ui-nube.js`: guarda los entornos de la obra abierta (`SESION.obraEntornos`) y avisa
  al agente al cargar el modelo.
- Prompt y herramientas para crear el agente: `docs/agente-voz/`. Agente conectado:
  `agent_2601m5w96ccte2cr2zq61jbmhppr` (`AGENT_ID` en `js/agente-voz.js`).

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
