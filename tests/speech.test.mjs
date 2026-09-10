import test from 'node:test';
import assert from 'node:assert/strict';
import { receivedSpeech } from './speech-helper.mjs';

test('LCE speech Original is appended for chat and whisper without altering its dictionary', () => {
  const dictionary = Object.freeze([Object.freeze({ Effects:['gagged'], Original:'你好' })]);
  for (const type of ['Chat','Whisper']) assert.equal(receivedSpeech('唔唔',type,dictionary),'唔唔 [你好]');
  for (const type of ['Action','Activity','Emote','Hidden','Status','ServerMessage']) assert.equal(receivedSpeech('raw',type,dictionary),'raw');
});

test('missing, blank, invalid, duplicate and oversized originals do not invent recovered speech', () => {
  for (const Original of [null, undefined, 123, {}, '', '  ', 'raw', 'x'.repeat(10001)]) assert.equal(receivedSpeech('raw','Chat',[{Original}]),'raw');
  assert.equal(receivedSpeech('raw','Chat',[]),'raw');
  assert.equal(receivedSpeech('raw','Chat',[{Original:'<img src=x onerror=alert(1)>'}]),'raw [<img src=x onerror=alert(1)>]');
});
