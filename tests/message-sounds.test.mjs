import { loadTypeScript } from './load-typescript.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=loadTypeScript('src/platform/message-sounds.ts');
test('sounds are opt-in, independently persisted, gesture-unlocked and burst-limited',async()=>{
  const saved=new Map(), tones=[];
  const localStorage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
  class AudioContext {
    state='suspended';currentTime=0;destination={};
    async resume(){this.state='running';} async close(){this.state='closed';}
    createOscillator(){const tone={frequency:{value:0},connect(){},disconnect(){},start(){tones.push(this.frequency.value)},stop(){}};return tone;}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  const Sounds=new Function('window','localStorage',source+';return MessageSounds;')({AudioContext},localStorage),s=new Sounds();
  await s.play('beep');assert.deepEqual(tones,[]);
  await s.enable('beep',true);assert.deepEqual(tones,[660]);
  await s.play('whisper',true);assert.deepEqual(tones,[660]);
  await s.play('beep');assert.equal(tones.length,1);
  await s.enable('whisper',true);assert.deepEqual(tones,[660,880]);
  await s.enable('beep',false);assert.deepEqual(new Sounds().enabled,{beep:false,whisper:true,mention:false});
  s.stop();await s.play('whisper',true);assert.equal(tones.length,2);
});
