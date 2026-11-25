import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pacote = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('pacote é ESM e exige Node 20+', () => {
  assert.equal(pacote.type, 'module');
  assert.match(pacote.engines.node, /20/);
});
