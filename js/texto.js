// Escapa texto para insertarlo en HTML. Todo lo que venga de datos (notas,
// nombres, motivos) pasa por aqui: con varios usuarios, una nota con <script>
// se ejecutaria en el navegador de los demas.
(function (raiz) {
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { esc };
  else raiz.esc = esc;
})(typeof window !== 'undefined' ? window : globalThis);
