// Intermediario del agente de voz económico (Cloudflare Worker).
// La página no puede llevar la clave de DeepSeek (cualquiera la vería), así
// que le pregunta a este Worker, que:
//   1. solo atiende a las direcciones de E-Urbe (ORIGENES),
//   2. solo a personas con sesión válida y correo verificado en el Firebase
//      de E-Urbe (se verifica la firma del token con las llaves de Google),
//   3. fija el modelo y el tamaño de la respuesta (la página no los elige),
//   4. y le pasa la pregunta a DeepSeek con la clave guardada como secreto.
//
// Variables del Worker (Settings → Variables):
//   DEEPSEEK_API_KEY   secreto (Encrypt). La clave de platform.deepseek.com
//   FIREBASE_PROJECT_ID  eurbe-piloto
//   ORIGENES           https://cpulgariningeurbe.github.io,http://localhost:5174
//   MODELO             opcional, por defecto deepseek-chat
//   URL_API            opcional, por defecto https://api.deepseek.com/chat/completions

const LLAVES_GOOGLE = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let llaves = null, llavesVencen = 0;
const usoPorPersona = new Map();          // límite simple por minuto (por instancia)

const json = (datos, status, cabeceras) =>
  new Response(JSON.stringify(datos), { status, headers: { ...cabeceras, 'Content-Type': 'application/json' } });

const b64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const leerJSON = s => JSON.parse(new TextDecoder().decode(b64url(s)));

async function llavesFirebase() {
  if (llaves && Date.now() < llavesVencen) return llaves;
  const r = await fetch(LLAVES_GOOGLE);
  const edad = /max-age=(\d+)/.exec(r.headers.get('Cache-Control') || '');
  llaves = (await r.json()).keys;
  llavesVencen = Date.now() + (edad ? +edad[1] * 1000 : 3600e3);
  return llaves;
}

async function verificarTokenFirebase(token, proyecto) {
  const partes = (token || '').split('.');
  if (partes.length !== 3) throw new Error('token mal formado');
  const cab = leerJSON(partes[0]), datos = leerJSON(partes[1]);
  if (cab.alg !== 'RS256') throw new Error('algoritmo no permitido');
  const jwk = (await llavesFirebase()).find(k => k.kid === cab.kid);
  if (!jwk) throw new Error('llave desconocida');
  const llave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', llave, b64url(partes[2]),
    new TextEncoder().encode(partes[0] + '.' + partes[1]));
  if (!ok) throw new Error('firma inválida');
  const ahora = Math.floor(Date.now() / 1000);
  if (datos.aud !== proyecto || datos.iss !== 'https://securetoken.google.com/' + proyecto) throw new Error('proyecto distinto');
  if (!(datos.exp > ahora) || !(datos.iat <= ahora + 60) || !datos.sub) throw new Error('token vencido');
  if (datos.email_verified !== true) throw new Error('correo sin verificar');
  return datos;
}

function demasiadas(uid) {
  const minuto = Math.floor(Date.now() / 60000);
  const u = usoPorPersona.get(uid);
  if (!u || u.minuto !== minuto) { usoPorPersona.set(uid, { minuto, n: 1 }); return false; }
  return ++u.n > 30;
}

export default {
  async fetch(req, env) {
    const origen = req.headers.get('Origin') || '';
    const permitidos = (env.ORIGENES || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': permitidos.includes(origen) ? origen : 'null',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405, cors);
    if (!permitidos.includes(origen)) return json({ error: 'Origen no permitido' }, 403, cors);

    let persona;
    try {
      persona = await verificarTokenFirebase((req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env.FIREBASE_PROJECT_ID);
    } catch (e) { return json({ error: 'Sesión no válida: ' + e.message }, 401, cors); }
    if (demasiadas(persona.sub)) return json({ error: 'Demasiadas órdenes seguidas' }, 429, cors);

    const texto = await req.text();
    if (texto.length > 80000) return json({ error: 'Conversación demasiado larga' }, 413, cors);
    let cuerpo;
    try { cuerpo = JSON.parse(texto); } catch (e) { return json({ error: 'JSON inválido' }, 400, cors); }
    if (!Array.isArray(cuerpo.messages) || cuerpo.messages.length > 40) return json({ error: 'Mensajes inválidos' }, 400, cors);

    const r = await fetch(env.URL_API || 'https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY },
      body: JSON.stringify({
        model: env.MODELO || 'deepseek-chat',
        messages: cuerpo.messages,
        tools: Array.isArray(cuerpo.tools) ? cuerpo.tools.slice(0, 12) : undefined,
        tool_choice: Array.isArray(cuerpo.tools) ? 'auto' : undefined,
        temperature: 0.2,
        max_tokens: 400,
      }),
    });
    return new Response(r.body, { status: r.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  },
};
