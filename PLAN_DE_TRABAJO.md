# E-Urbe · Plan de trabajo

Documento vivo para llevar las tareas pendientes de `eurbe.html`.
El contexto técnico del proyecto está en `CLAUDE.md`; aquí va solo **qué falta por
hacer**.

> Cómo usarlo: escribe abajo las correcciones y ábrelo en Claude Code diciendo algo como
> *«lee PLAN_DE_TRABAJO.md y hagamos las tareas pendientes»*. Al terminar cada una, se
> mueve a **Hecho** con la fecha.

---

## Cómo describir una corrección

Cuanto más concreta, menos idas y vueltas. Lo que de verdad ayuda es:

- **Qué ves** — el comportamiento actual, con el texto del error si lo hay.
- **Qué esperabas** — cómo debería comportarse.
- **Dónde** — pantalla de carga, visor 3D, panel derecho, informe PDF, Excel…
- **Captura o video** si es algo visual o una interacción.

Ejemplo de una que salió bien: *«al exportar Excel sale "SheetJS no cargado aún",
esperaba que descargara el archivo, es en el modal de Exportar»*. Con eso bastó.

### Márcalas como mecánicas o de lógica

Esto ahorra bastante tiempo y consumo. Al pedirlas, indica de qué tipo es cada una:

- **Mecánica** — textos, colores, tamaños, mover o renombrar algo, añadir una columna
  a una tabla que ya existe. Se hace directo y la pruebas tú.
- **De lógica** — cálculos de cantidades, selección en el 3D, carga de IFC o JSON,
  ejes, librerías externas, informes. Aquí conviene verificar antes de entregar,
  porque son los que han fallado sin avisar.

---

## Correcciones pendientes

*(Escribe aquí las tuyas. Borra los ejemplos.)*

### 1.
- **Qué veo:**
- **Qué espero:**
- **Dónde:**
- **Tipo:** mecánica / lógica

### 2.
- **Qué veo:**
- **Qué espero:**
- **Dónde:**
- **Tipo:** mecánica / lógica

### 3.
- **Qué veo:**
- **Qué espero:**
- **Dónde:**
- **Tipo:** mecánica / lógica

---

## Esperando dato del modelo BIM

El panel de Avance ya tiene la estructura, pero dos partes están **maquetadas con
valores de ejemplo** y marcadas como tal en pantalla. Se activan solas en cuanto el
modelo traiga la información:

- **Estado de contratación y pago** — hacen falta, por actividad, si está contratada y
  en qué estado va el pago (pagada / activa / por iniciar). Hoy la caja solo muestra
  cuántas actividades distintas trae el modelo, que es lo único cierto.
- **Dona de pendiente por pagar** — hace falta el **valor en dinero** por elemento o por
  actividad. Mientras tanto la dona se dibuja con el avance en cantidad, como
  aproximación, y va atenuada con la etiqueta «ejemplo».

Cuando eso exista en el IFC, se mapea como cualquier otro parámetro desde la pantalla de
configuración y se conectan las dos cajas.

---

## Detectado pero no solicitado

Cosas que aparecieron trabajando y están **a la espera de que decidas**. No se han
tocado.

### Limpieza de la carpeta
Hay tres archivos que pueden confundir a quien abra el proyecto:

- `eurbe_v2.html` y `eurbe_backup_prev.html` — respaldos de versiones anteriores.
- `PZA-modelo-federado.json` — volcado crudo de entidades IFC, sin geometría. **No
  sirve como entrada** de la aplicación; si alguien lo carga por error, falla.
- `ifc_converter.py` — convertidor antiguo con nombres de parámetros fijos, sustituido
  por `ifc_converter_v2.py`.

Decidir si se borran o se mueven a una subcarpeta `_respaldos`.

### Carga de IFC pesados en el navegador
Funciona, pero el modelo federado de 78 MB tarda varios minutos y depende de la memoria
del equipo. El camino rápido hoy es convertirlo con `ifc_converter_v2.py` (unos dos
minutos) y cargar el JSON, que abre en menos de un segundo.

Se habló de montar un pequeño servicio local de conversión para que ese paso deje de ser
manual. Requiere Python con ifcopenshell en el equipo y **conviene revisarlo antes con
Nuevas Tecnologías** (ver la skill `ingeurbe-secure-delivery`).

### Precisión de la ventana de selección
El cálculo usa la caja envolvente de cada elemento proyectada a pantalla, no su
geometría exacta. Es lo que hacen los visores BIM por rendimiento. En la práctica, el
modo cruce puede tomar algún elemento muy diagonal cuya caja roza el rectángulo aunque
la pieza no lo toque. Solo vale la pena afinarlo si estorba de verdad en el uso diario.

---

## Hecho

### Septiembre 2026

- **Descargar modelo (JSON), 30 sep 2026** — Obra ▾ → «⬇ Descargar modelo (JSON)»
  (solo administradores): copia de la versión vigente tal como la usa E-Urbe; se puede
  volver a subir como versión nueva.
- **Entornos de trabajo, 29 sep 2026** — cada persona ve solo las obras de los entornos
  que le asigna el administrador; una obra puede estar en varios entornos. Lo existente
  pasó a «General». Detalle en `docs/diseno-entornos.md`.
- **Versión en la nube (piloto), 28 sep 2026** — publicada en
  https://cpulgariningeurbe.github.io/EURBEV1/ con el proyecto Firebase `eurbe-piloto`: entrada con
  correo, varias obras, modelo cargado una sola vez (el federado pesa 1,89 MB
  comprimido), cortes compartidos en vivo con permisos por rol, anular en vez de borrar,
  gestión de accesos, importación de cortes locales, modo sin conexión. **Pendiente:**
  primera entrada del administrador, subir el modelo federado, importar los cortes de
  Viviana y probar desde la red de la oficina.
- **Correcciones previas** — filtro «Ejecutados (IFC)» eliminado (dejaba la vista
  vacía), CSV de pendientes con columnas reales y edificación, dos decimales en
  pendientes, arrastrar un JSON ya pasa por el mapeo, notas escapadas.
- **Exportar cortes (JSON)** en la versión local.
- **Mapeo dinámico de parámetros.** Pantalla de configuración al cargar, para IFC y para
  JSON. Ningún nombre de parámetro queda fijo en el código.
- **Carga directa de `.ifc`** en el navegador, con conversión interna.
- **Convertidor `ifc_converter_v2.py`** y modelo federado convertido (16.604 elementos).
- **El avance lo definen los cortes**, no la propiedad `Ejecutado` del IFC.
- **Cantidades con dos decimales** en toda la aplicación.
- **Panel derecho más ancho** (440 px).
- **Orientación del modelo corregida** — aparecía acostado por una doble conversión de
  ejes.
- **Vistas 3D por corte en el PDF**, con los elementos del corte resaltados sobre el
  edificio en gris.
- **Desglose de cantidades por actividad** en PDF y Excel, que es lo que se paga, más el
  consolidado sin duplicar elementos.
- **Parámetro y filtro de Edificación** (Torre 1, Torre 2, zona comunal…), en el visor,
  el panel, pendientes y los informes.
- **SheetJS y Chart.js**, que nunca se cargaban: rompían la exportación a Excel y dejaban
  el tab de Avance vacío.
- **Selección por ventana** con Ctrl + arrastrar, con la convención de Revit: azul de
  izquierda a derecha para lo contenido, verde de derecha a izquierda para lo que toca.
- **Rejilla de coordenadas al nivel de cimentación.** Estaba a media altura porque la
  línea que la bajaba comprobaba `isGridHelper`, propiedad que no existe en Three.js
  r128, así que nunca se ejecutaba.
- **Menú de niveles con scroll.** Con 22 niveles crecía hasta tapar la barra de
  herramientas; ahora tiene altura máxima y la lista se desplaza por dentro.
- **Caja de Propiedades BIM más baja.**
- **Panel de Avance reestructurado**: cajas de estado de contratación y estado de cortes,
  y dos donas pequeñas en lugar de una grande.
- **Estado por corte** (En revisión / En aprobación / Pagado), editable desde el
  historial y reflejado en el panel de Avance, el Excel y el PDF.
