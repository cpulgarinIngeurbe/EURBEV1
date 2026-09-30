// Empaqueta el modelo (el mismo objeto que recibe loadModel) para guardarlo en
// Firestore: JSON -> gzip -> trozos de 900 KB (un documento no pasa de 1 MB).
// La huella SHA-256 del comprimido detecta descargas corruptas o incompletas.
(function (raiz) {
  const TAM_TROZO = 900 * 1024;

  async function pasarPor(u8, transform) {
    const flujo = new Blob([u8]).stream().pipeThrough(transform);
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  async function huellaDe(u8) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
    return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
  }

  function partir(u8) {
    const out = [];
    for (let i = 0; i < u8.length; i += TAM_TROZO) out.push(u8.slice(i, i + TAM_TROZO));
    return out;
  }

  function unir(trozos) {
    const total = trozos.reduce((s, t) => s + t.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const t of trozos) { out.set(t, pos); pos += t.length; }
    return out;
  }

  async function empaquetar(data) {
    const crudo = new TextEncoder().encode(JSON.stringify(data));
    const comprimido = await pasarPor(crudo, new CompressionStream('gzip'));
    return { trozos: partir(comprimido), huella: await huellaDe(comprimido),
             bytes: comprimido.length, bytesOriginales: crudo.length };
  }

  // Bytes del JSON original (verificando la huella): sirve para descargarlo
  // como archivo sin volver a serializar un objeto de decenas de MB
  async function bytesJSON(trozos, huellaEsperada) {
    const comprimido = unir(trozos);
    if (huellaEsperada && (await huellaDe(comprimido)) !== huellaEsperada) {
      const e = new Error('El modelo descargado no coincide con el publicado (descarga incompleta o dañada).');
      e.code = 'huella';
      throw e;
    }
    return pasarPor(comprimido, new DecompressionStream('gzip'));
  }

  async function desempaquetar(trozos, huellaEsperada) {
    return JSON.parse(new TextDecoder().decode(await bytesJSON(trozos, huellaEsperada)));
  }

  const api = { TAM_TROZO, empaquetar, desempaquetar, bytesJSON, huellaDe, unir };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.EurbePaquete = api;
})(typeof window !== 'undefined' ? window : globalThis);
