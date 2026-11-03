// Agente de voz económico: oído y voz del propio navegador (gratis) y, como
// cerebro, DeepSeek a través de un intermediario que guarda la clave
// (proxy-ia/worker.js). Usa las mismas herramientas que el agente de
// ElevenLabs (window.EurbeAgenteVoz.herramientas), con su confirmación en dos
// pasos y la regla de escribir solo en obras de «Pruebas».
// Se habla pulsando el micrófono; también se puede escribir la orden.
(function () {
  // Dirección del intermediario (Cloudflare Worker). Vacía = no configurado,
  // y js/agente-voz.js vuelve al widget de ElevenLabs.
  const URL_PROXY = '';

  const IA = window.EurbeAgenteIA;
  const $ = id => document.getElementById(id);
  let historial = [];
  let ocupado = false, escuchando = false, reconocedor = null, vozElegida = null;
  let llamarModeloPrueba = null;            // solo pruebas automáticas (ver final)

  window.agenteEconomicoConfigurado = () => !!URL_PROXY;

  // ── Voz (texto → voz) ──
  function elegirVoz() {
    const voces = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    const es = voces.filter(v => /^es/i.test(v.lang));
    const puntaje = v => (/natural|online|neural/i.test(v.name) ? 4 : 0)
      + (/es-CO/i.test(v.lang) ? 3 : /es-(MX|US|419)/i.test(v.lang) ? 2 : /es-ES/i.test(v.lang) ? 1 : 0);
    vozElegida = es.sort((a, b) => puntaje(b) - puntaje(a))[0] || null;
  }
  function hablar(texto) {
    if (!window.speechSynthesis || !texto) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(IA.limpiarParaVoz(texto));
    if (vozElegida) { u.voice = vozElegida; u.lang = vozElegida.lang; } else u.lang = 'es-CO';
    u.rate = 1.05;
    u.onstart = () => estado('hablando');
    u.onend = u.onerror = () => estado(ocupado ? 'pensando' : 'listo');
    speechSynthesis.speak(u);
  }

  // ── Oído (voz → texto) ──
  const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
  function escuchar() {
    if (!Reconocimiento) { mostrar('sistema', 'Este navegador no reconoce voz. Usa Chrome o Edge, o escribe la orden.'); return; }
    if (window.speechSynthesis) speechSynthesis.cancel();
    reconocedor = new Reconocimiento();
    reconocedor.lang = 'es-CO';
    reconocedor.interimResults = true;
    reconocedor.continuous = false;
    let final = '';
    reconocedor.onresult = ev => {
      let parcial = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final += t; else parcial += t;
      }
      $('av-eco-parcial').textContent = (final + parcial).trim();
    };
    reconocedor.onerror = ev => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed')
        mostrar('sistema', 'El navegador no dio permiso al micrófono. Actívalo en el candado de la barra de direcciones.');
      else if (ev.error !== 'no-speech' && ev.error !== 'aborted') mostrar('sistema', 'No se pudo escuchar (' + ev.error + ').');
    };
    reconocedor.onend = () => {
      escuchando = false; $('av-eco-parcial').textContent = '';
      estado('listo');
      if (final.trim()) enviar(final.trim());
    };
    escuchando = true; estado('escuchando');
    reconocedor.start();
  }

  // ── Cerebro (DeepSeek por el intermediario) ──
  async function llamarModelo(mensajes) {
    const u = window.Nube && Nube.usuario();
    if (!u) throw new Error('Inicia sesión para usar el asistente.');
    const token = await u.getIdToken();
    const r = await fetch(URL_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ messages: mensajes, tools: IA.HERRAMIENTAS }),
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = { 401: 'tu sesión no es válida; vuelve a entrar', 402: 'la cuenta de DeepSeek se quedó sin saldo',
                    403: 'esta dirección no está autorizada en el intermediario', 429: 'hay demasiadas órdenes seguidas; espera un momento' }[r.status];
      throw new Error(msg || (datos.error && (datos.error.message || datos.error)) || ('error ' + r.status));
    }
    const m = datos.choices && datos.choices[0] && datos.choices[0].message;
    if (!m) throw new Error('el modelo no respondió');
    return m;
  }

  async function enviar(dicho) {
    if (ocupado || !dicho) return;
    ocupado = true; estado('pensando');
    mostrar('tu', dicho);
    try {
      const r = await IA.conversar({
        historial, dicho, llamarModelo: llamarModeloPrueba || llamarModelo,
        herramientas: window.EurbeAgenteVoz.herramientas,
        alUsarHerramienta: n => console.info('[agente-voz-eco] herramienta', n),
      });
      historial = r.historial;
      const texto = IA.limpiarParaVoz(r.texto) || 'Listo.';
      mostrar('agente', texto);
      hablar(texto);
    } catch (e) {
      console.error('[agente-voz-eco]', e);
      const t = 'No pude responder: ' + (e && e.message || e) + '.';
      mostrar('sistema', t); hablar(t);
    } finally {
      ocupado = false;
      if (!(window.speechSynthesis && speechSynthesis.speaking)) estado('listo');
    }
  }

  // ── Interfaz ──
  const ESTADOS = { listo: ['🎙️', 'Pulsa y habla'], escuchando: ['⏺', 'Escuchando…'],
                    pensando: ['…', 'Pensando…'], hablando: ['🔊', 'Respondiendo… (pulsa para callar)'] };
  function estado(e) {
    const b = $('av-eco-mic'); if (!b) return;
    b.textContent = ESTADOS[e][0]; b.dataset.estado = e;
    $('av-eco-estado').textContent = ESTADOS[e][1];
  }
  function mostrar(quien, texto) {
    const log = $('av-eco-log');
    const d = document.createElement('div');
    d.className = 'av-eco-msg av-eco-' + quien;
    d.textContent = (quien === 'tu' ? 'Tú: ' : quien === 'agente' ? 'E-Urbe: ' : '') + texto;
    log.appendChild(d);
    while (log.children.length > 12) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
    $('av-eco-panel').hidden = false;
  }

  window.montarAgenteEconomico = function () {
    if ($('av-eco')) return;
    const css = document.createElement('style');
    css.textContent = `
      #av-eco { position: fixed; right: 20px; bottom: 20px; z-index: 9999; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; font-family: inherit; }
      #av-eco-panel { width: 320px; max-width: calc(100vw - 40px); background: #fff; border: 1px solid #d5d9e0; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.16); }
      #av-eco-panel[hidden] { display: none; }
      .av-eco-cab { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid #eceff3; font-size: 12px; font-weight: 700; color: #3c4a2a; }
      .av-eco-cab button { margin-left: auto; border: 0; background: none; cursor: pointer; font-size: 13px; color: #888; }
      #av-eco-log { max-height: 220px; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; line-height: 1.4; }
      .av-eco-msg { padding: 5px 8px; border-radius: 8px; }
      .av-eco-tu { align-self: flex-end; background: #eef6e2; }
      .av-eco-agente { align-self: flex-start; background: #f3f4f6; }
      .av-eco-sistema { align-self: stretch; background: #fff6e8; color: #8a5300; }
      #av-eco-parcial { padding: 0 10px; min-height: 0; font-size: 11px; color: #888; font-style: italic; }
      .av-eco-pie { display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid #eceff3; }
      .av-eco-pie input { flex: 1; min-width: 0; height: 30px; border: 1px solid #d5d9e0; border-radius: 6px; padding: 0 8px; font-size: 12px; }
      .av-eco-barra { display: flex; align-items: center; gap: 8px; }
      #av-eco-estado { font-size: 11px; color: #555; background: #fff; border: 1px solid #e0e3e8; border-radius: 12px; padding: 3px 9px; box-shadow: 0 2px 6px rgba(0,0,0,.08); }
      #av-eco-mic { width: 54px; height: 54px; border-radius: 50%; border: 0; cursor: pointer; font-size: 22px; color: #fff; background: #6E9B2A; box-shadow: 0 4px 14px rgba(0,0,0,.22); }
      #av-eco-mic[data-estado="escuchando"] { background: #E05050; animation: av-eco-pulso 1.1s infinite; }
      #av-eco-mic[data-estado="pensando"] { background: #8a96a8; }
      #av-eco-mic[data-estado="hablando"] { background: #3A7FC1; }
      @keyframes av-eco-pulso { 50% { box-shadow: 0 0 0 10px rgba(224,80,80,.18); } }`;
    document.head.appendChild(css);

    const caja = document.createElement('div');
    caja.id = 'av-eco';
    caja.innerHTML = `
      <div id="av-eco-panel" hidden>
        <div class="av-eco-cab">Asistente E-Urbe <span style="font-weight:400;color:#999">· voz económica</span>
          <button type="button" title="Olvidar la conversación" id="av-eco-nuevo">↺</button>
          <button type="button" title="Ocultar" id="av-eco-cerrar" style="margin-left:0">✕</button></div>
        <div id="av-eco-log"></div>
        <div id="av-eco-parcial"></div>
        <form class="av-eco-pie" id="av-eco-form">
          <input id="av-eco-texto" type="text" placeholder="o escribe: muéstrame el piso 3" autocomplete="off">
          <button type="submit" class="btn btn-secondary btn-sm">Enviar</button>
        </form>
      </div>
      <div class="av-eco-barra"><span id="av-eco-estado"></span>
        <button type="button" id="av-eco-mic" title="Hablar con el asistente"></button></div>`;
    document.body.appendChild(caja);
    estado('listo');

    $('av-eco-mic').onclick = () => {
      $('av-eco-panel').hidden = false;
      if (window.speechSynthesis && speechSynthesis.speaking) { speechSynthesis.cancel(); estado('listo'); return; }
      if (escuchando) { reconocedor && reconocedor.stop(); return; }
      if (ocupado) return;
      escuchar();
    };
    $('av-eco-form').onsubmit = ev => {
      ev.preventDefault();
      const t = $('av-eco-texto').value.trim();
      $('av-eco-texto').value = '';
      enviar(t);
    };
    $('av-eco-cerrar').onclick = () => { $('av-eco-panel').hidden = true; };
    $('av-eco-nuevo').onclick = () => { historial = []; $('av-eco-log').innerHTML = ''; mostrar('sistema', 'Conversación nueva.'); };

    if (window.speechSynthesis) { elegirVoz(); speechSynthesis.onvoiceschanged = elegirVoz; }
    console.info('[agente-voz-eco] Asistente montado; intermediario:', URL_PROXY);
  };

  // Solo para pruebas automáticas: reemplaza la llamada al modelo
  window.EurbeAgenteEco = { enviar, _probarCon: fn => { llamarModeloPrueba = fn; } };
})();
