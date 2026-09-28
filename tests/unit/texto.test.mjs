import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { esc } = createRequire(import.meta.url)('../../js/texto.js');

test('escapa los cinco caracteres peligrosos', () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`),
    '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
});
test('null y undefined dan cadena vacía; números se convierten', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(12.5), '12.5');
});
