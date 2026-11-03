# Agente de voz económico (navegador + DeepSeek)

Reemplaza el cobro por minuto de ElevenLabs:

- **Oído y voz:** los del propio navegador (Chrome o Edge), sin costo.
- **Cerebro:** DeepSeek, que cobra por texto procesado: una fracción de centavo de dólar por orden.
- **Herramientas:** las mismas 8 de siempre (`js/agente-voz.js`).

Piezas:

| Archivo | Qué hace |
|---|---|
| `js/agente-ia-logica.js` | Prompt, herramientas descritas para el modelo y la vuelta «el modelo pide herramienta → la página la ejecuta → el modelo responde». |
| `js/agente-voz-economico.js` | Botón de micrófono, panel de conversación, reconocimiento y voz del navegador. Aquí va `URL_PROXY`. |
| `proxy-ia/worker.js` | Intermediario en Cloudflare que guarda la clave de DeepSeek y solo atiende a personas con sesión de E-Urbe. |

Mientras `URL_PROXY` esté vacía, la app sigue usando ElevenLabs. Con `?voz=elevenlabs` en la dirección se fuerza ElevenLabs para comparar.

## Paso 1 · Cuenta de DeepSeek (la clave la maneja solo el administrador)

1. Entrar a <https://platform.deepseek.com> y crear la cuenta.
2. **Top up**: recargar un saldo pequeño (por ejemplo US$5). Es prepago: cuando se acaba el saldo, el agente deja de responder, nunca cobra de más.
3. **API keys → Create new API key**. Copiarla y guardarla. **No pegarla en el código, en el chat ni en ningún archivo del repositorio.**

## Paso 2 · Intermediario en Cloudflare (gratis)

1. Entrar a <https://dash.cloudflare.com> y crear la cuenta.
2. **Workers & Pages → Create → Create Worker**, con el nombre `eurbe-ia`. Pulsar **Deploy**.
3. **Edit code**: borrar lo que trae, pegar todo el contenido de `proxy-ia/worker.js` y pulsar **Deploy**.
4. **Settings → Variables and Secrets → Add**:

   | Nombre | Tipo | Valor |
   |---|---|---|
   | `DEEPSEEK_API_KEY` | **Secret** | la clave del paso 1 |
   | `FIREBASE_PROJECT_ID` | Text | `eurbe-piloto` |
   | `ORIGENES` | Text | `https://cpulgariningeurbe.github.io,http://localhost:5174` |

   Pulsar **Deploy** de nuevo.
5. Copiar la dirección del Worker, del tipo `https://eurbe-ia.<cuenta>.workers.dev`. Esa dirección **no es secreta**: se la pasas a Claude para ponerla en `URL_PROXY`.

## Paso 3 · Probar en la obra de Pruebas

1. Doble clic en `scripts/probar_rama_desarrollo.bat` y entrar con tu cuenta, **en Chrome o Edge**.
2. Abrir la obra «Obra de Pruebas · Agente de voz».
3. Abajo a la derecha aparece un botón verde de micrófono. Al pulsarlo por primera vez, el navegador pide permiso para usar el micrófono: aceptar.
4. Pulsar, hablar y esperar: se detiene solo cuando dejas de hablar. Pulsar mientras responde hace que se calle.
5. También se puede escribir la orden en el panel.

Órdenes para probar:

- «muéstrame el piso 3»
- «la mampostería del nivel 2»
- «lo pagado de estructura»
- «¿cuánto va?»
- «quita los filtros»
- «selecciona lo que se ve» y luego «regístralo como corte». Debe leer el resumen y esperar a que digas «sí».

Cada llamada queda en la consola del navegador (F12, filtro `agente-voz`).

## Qué protege el intermediario

- Solo responde a las direcciones de `ORIGENES`.
- Solo atiende a personas con sesión válida y correo verificado en el Firebase de E-Urbe: verifica la firma del token con las llaves de Google.
- El modelo y el largo de la respuesta los fija el Worker, no la página.
- Acepta como máximo 30 órdenes por minuto por persona.
- La clave nunca sale del Worker.

## Costos de referencia

Son cifras de terceros de noviembre de 2026: confirmar en la página de precios de DeepSeek.

- DeepSeek cobra alrededor de US$0,14 a 0,30 por millón de tokens de entrada, según el modelo.
- Una orden con herramientas usa unos pocos miles de tokens. Con US$5 alcanza para miles de órdenes.
- El plan gratis de Cloudflare Workers permite 100.000 llamadas al día.

## Datos

DeepSeek procesa los textos en servidores en China. Lo que se envía:

- lo que dice la persona;
- nombres de niveles, grupos y actividades;
- cantidades y números de corte.

No se envía el modelo 3D ni correos. Si la política de Ingeurbe no lo permite, se cambia `URL_API` y `MODELO` en el Worker por un proveedor que sirva DeepSeek fuera de China (con la misma API), sin tocar la página.
