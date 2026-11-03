// Agente de voz económico, sin DOM: el prompt, la descripción de las
// herramientas para el modelo (formato OpenAI, el que usa DeepSeek) y la
// vuelta de conversación «el modelo pide herramientas → la página las
// ejecuta → el modelo responde». Las herramientas son las mismas del agente
// de ElevenLabs (js/agente-voz.js). Lo usa js/agente-voz-economico.js.
(function (raiz) {
  const PROMPT = [
    'Eres el asistente de voz de E-Urbe, el visor BIM de Ingeurbe para el control de cortes de obra.',
    'Hablas en español de Colombia, en frases cortas y claras: tu respuesta se lee en voz alta mientras la persona mira el modelo 3D.',
    'Responde en texto plano, sin listas, viñetas, asteriscos ni emojis, en una o dos frases.',
    '',
    'REGLA PRINCIPAL: tú no puedes ver ni mover el modelo; solo las herramientas pueden hacerlo. Cada vez que la persona pida ver, mostrar, filtrar, seleccionar o consultar algo del modelo, llama la herramienta correspondiente de inmediato, sin preguntar antes. Nunca digas que filtraste, seleccionaste o registraste algo si no llamaste la herramienta y recibiste su respuesta. Después de cada herramienta, di lo que la herramienta respondió (por ejemplo cuántos elementos se muestran).',
    '',
    'Uso de las herramientas:',
    '- filtrar_elementos: «muéstrame el piso 3» (nivel="piso 3"); «la mampostería del nivel 2» (nivel="nivel 2", grupo="mampostería"); «columnas y vigas del quinto piso» (nivel="quinto piso", actividad="columnas y vigas"); «lo pendiente del piso 4» (nivel="piso 4", estado="pendiente"); «lo pagado de estructura» (grupo="estructura", estado="pagado"). Para estado usa el que dijo la persona: pendiente, en corte, en revisión, en aprobación, pagado o rechazado. Pasa las palabras tal como las dijo la persona; la aplicación encuentra la opción correcta. Cada llamada reemplaza el filtro anterior; usa acumular=true solo si la persona dice claramente que quiere añadir a lo que ya ve.',
    '- limpiar_filtros: «muéstrame todo», «quita los filtros».',
    '- seleccionar_visibles: «selecciona lo que se ve». limpiar_seleccion: «quita la selección».',
    '- consultar_avance: «¿cuánto va?». Si la persona nombra una parte del modelo, primero filtrar_elementos y luego consultar_avance.',
    '- consultar_cortes: «¿qué cortes hay?», «¿cuáles están en aprobación?».',
    '- registrar_corte: registrar lo seleccionado como corte. cambiar_estado_corte: «pasa el corte 2 a aprobación».',
    '',
    'Reglas para cortes (son la base del pago):',
    '1. registrar_corte y cambiar_estado_corte van en dos pasos. Primero llámalas SIN confirmado; la aplicación devuelve un resumen: díselo a la persona y pregúntale si confirma.',
    '2. Solo si la persona responde claramente que sí, vuelve a llamar la misma herramienta con los mismos datos y confirmado=true. Si duda, dice que no o cambia algo, no confirmes.',
    '3. Nunca pases confirmado=true en la primera llamada.',
    '4. Anular cortes no se hace por voz: se hace desde el historial de cortes.',
    '',
    'Si una herramienta responde con opciones numeradas, dilas por número y nombre, pregunta cuál quiere y vuelve a llamar la herramienta con el nombre exacto de la opción elegida.',
    'Si una herramienta dice que algo no existe o no está permitido, díselo con tus palabras, sin inventar alternativas.',
    'Escribe los números con cifras; no digas códigos técnicos ni identificadores internos.',
  ].join('\n');

  const txt = descripcion => ({ type: 'string', description: descripcion });
  const herramienta = (name, description, properties = {}, required = []) =>
    ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

  const HERRAMIENTAS = [
    herramienta('filtrar_elementos',
      'Filtra lo que se ve en el modelo 3D por nivel, grupo, actividad, contrato, edificación o estado. Pasa las palabras tal como las dijo la persona. Reemplaza el filtro anterior salvo que acumular sea true.', {
        nivel: txt('Nivel o piso, como lo dijo la persona: "piso 3", "nivel dos", "segundo piso".'),
        grupo: txt('Grupo de elementos: "estructura", "mampostería", "acabados".'),
        actividad: txt('Actividad o actividades: "columnas", "columnas y vigas".'),
        contrato: txt('Contrato, si la persona lo menciona.'),
        edificacion: txt('Edificación o torre, si la persona la menciona.'),
        estado: txt('"pendiente", "en corte", "en revisión", "en aprobación", "pagado", "rechazado" o "todos".'),
        acumular: { type: 'boolean', description: 'true para sumar este filtro al que ya se ve.' },
      }),
    herramienta('limpiar_filtros', 'Quita todos los filtros y muestra el modelo completo.'),
    herramienta('seleccionar_visibles', 'Selecciona todos los elementos que se ven en este momento (para luego registrarlos como corte).'),
    herramienta('limpiar_seleccion', 'Quita la selección actual.'),
    herramienta('consultar_avance', 'Dice cuántos elementos de lo que se ve están en cortes (por estado) y cuántos pendientes, con sus cantidades.'),
    herramienta('consultar_cortes', 'Lista los cortes registrados en la obra (número, estado, elementos, nivel y actividad).', {
      estado: txt('Opcional: "en revisión", "en aprobación", "pagado" o "rechazado" para listar solo esos.'),
    }),
    herramienta('registrar_corte', 'Registra los elementos seleccionados como un corte nuevo. Dos pasos: sin confirmado devuelve un resumen para decirle a la persona; con confirmado=true, después de que la persona dijo que sí, lo registra.', {
      notas: txt('Nota opcional del corte, si la persona la dicta.'),
      confirmado: { type: 'boolean', description: 'true solo después de decir el resumen y que la persona confirme.' },
    }),
    herramienta('cambiar_estado_corte', 'Cambia el estado de un corte. Dos pasos: sin confirmado devuelve un resumen para decirle a la persona; con confirmado=true, después de que la persona dijo que sí, lo cambia.', {
      corte: txt('Número del corte: "2", "corte 2", "corte dos".'),
      estado: txt('"en revisión", "en aprobación", "pagado" o "rechazado".'),
      confirmado: { type: 'boolean', description: 'true solo después de decir el resumen y que la persona confirme.' },
    }, ['corte', 'estado']),
  ];

  // Historial acotado para no pagar tokens de más. Se corta siempre al
  // comienzo de un mensaje de la persona: una respuesta con tool_calls sin
  // sus resultados la rechaza la API.
  function recortarHistorial(mensajes, maximo = 24) {
    if (mensajes.length <= maximo) return mensajes.slice();
    let i = mensajes.length - maximo;
    while (i < mensajes.length && mensajes[i].role !== 'user') i++;
    return mensajes.slice(i);
  }

  const leerArgumentos = s => {
    if (!s) return {};
    if (typeof s === 'object') return s;
    try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
  };

  // Una vuelta: manda lo dicho al modelo, ejecuta las herramientas que pida
  // y repite hasta que conteste con texto. llamarModelo(mensajes) devuelve el
  // mensaje del asistente ({ content, tool_calls }). alUsarHerramienta avisa
  // a la interfaz qué se está haciendo.
  async function conversar({ historial, dicho, llamarModelo, herramientas, maxPasos = 6, alUsarHerramienta }) {
    const mensajes = recortarHistorial(historial.concat([{ role: 'user', content: dicho }]));
    for (let paso = 0; paso < maxPasos; paso++) {
      const r = await llamarModelo([{ role: 'system', content: PROMPT }].concat(mensajes));
      const llamadas = (r && r.tool_calls) || [];
      const asistente = { role: 'assistant', content: (r && r.content) || '' };
      if (llamadas.length) asistente.tool_calls = llamadas;
      mensajes.push(asistente);
      if (!llamadas.length) return { texto: asistente.content.trim(), historial: mensajes };
      for (const ll of llamadas) {
        const nombre = ll.function && ll.function.name;
        const fn = herramientas[nombre];
        if (alUsarHerramienta) alUsarHerramienta(nombre);
        let resultado;
        try {
          resultado = fn ? await fn(leerArgumentos(ll.function.arguments)) : `La herramienta ${nombre} no existe.`;
        } catch (e) { resultado = 'Ocurrió un error en la aplicación: ' + (e && e.message || e); }
        mensajes.push({ role: 'tool', tool_call_id: ll.id, content: String(resultado) });
      }
    }
    return { texto: 'No alcancé a terminar esa orden. ¿Me la repites más corta?', historial: mensajes };
  }

  // Lo que se va a decir en voz alta: sin marcas de formato
  const limpiarParaVoz = s => String(s || '')
    .replace(/[*_#`>|]/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ').trim();

  const api = { PROMPT, HERRAMIENTAS, recortarHistorial, conversar, limpiarParaVoz };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.EurbeAgenteIA = api;
})(typeof window !== 'undefined' ? window : globalThis);
