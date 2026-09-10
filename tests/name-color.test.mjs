import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const nameColor = new Function(stripTypeScriptTypes(readFileSync('src/ui/name-color.ts', 'utf8')).replaceAll('export ', '') + ';return nameColor;')();
test('shared label colors preserve bright colors, lift dark colors and reject CSS injection', () => {
  assert.equal(nameColor('#FFE800', 1), '#ffe800');
  assert.notEqual(nameColor('#000000', 1), '#000000');
  assert.equal(nameColor('url(https://bad)', 1), nameColor(undefined, 1));
  assert.notEqual(nameColor(undefined, 1), nameColor(undefined, 2));
  for (const input of ['#000000', '#30213a', '#ff0000', '#ffffff']) {
    const rgb = nameColor(input, 1).match(/[\da-f]{2}/g).map(v => parseInt(v, 16));
    const lum = c => c.map(n => n / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126,.7152,.0722][i], 0);
    assert.ok((lum(rgb) + .05) / (lum([48,33,58]) + .05) >= 4.5);
  }
});
