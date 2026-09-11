import test from 'node:test';
import assert from 'node:assert/strict';
import { literalAction } from './community-helper.mjs';
import { renderAction } from './action-helper.mjs';

// Wire format from LSCG src/utils.ts SendAction, not an activity CSV fallback.
function lscgDictionary(text) {
  return [
    ...['Beep', '发送私聊', 'Biep', 'Sonner'].map(Tag => ({ Tag, Text: 'msg' })),
    { Tag: 'msg', Text: text },
  ];
}

test('LSCG Beep actions resolve their literal payload regardless of catalog language', () => {
  for (const text of ['Neko 牽著 W 走出房間.', 'W leads out of the room by the hand.', 'msg Beep SourceCharacter <script>literal</script>']) {
    for (const catalog of [{}, { Beep: '发送私聊' }, { Beep: 'Beep' }, { Beep: 'Sonner' }]) {
      assert.equal(renderAction('Beep', 'Action', lscgDictionary(text), catalog), text);
    }
  }
});

test('LSCG literal extraction requires its action envelope and bounded string payload', () => {
  for (const type of ['Chat', 'Whisper', 'Hidden', 'Activity', 'ServerMessage']) {
    assert.equal(literalAction('Beep', type, lscgDictionary('text')), undefined);
  }
  assert.equal(literalAction('OtherAction', 'Action', lscgDictionary('text')), undefined);
  assert.equal(literalAction('Beep', 'Action', [{ Tag: 'msg', Text: 'text' }]), undefined);
  for (const payload of [null, 123, {}, 'x'.repeat(20001)]) {
    assert.equal(literalAction('Beep', 'Action', lscgDictionary(payload)), undefined);
  }
  assert.equal(renderAction('Beep', 'Action', [], { Beep: '发送私聊' }), '发送私聊');
});
