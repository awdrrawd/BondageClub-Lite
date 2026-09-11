import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Window} from 'happy-dom';
import {history} from './history-helper.mjs';
const code=stripTypeScriptTypes(readFileSync('src/storage/history-export.ts','utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
const {exportHistoryHTML,exportHistoryXLSX}=new Function('localDay',code+';return {exportHistoryHTML,exportHistoryXLSX};')(history.localDay);
const labels={title:'BC Lite',private:'Private',columns:['Time','Room','Channel','ID','Name','Target ID','Target','Text'],type:t=>t};
const now=Date.now(),day=history.localDay(now);
const row=(id,kind='room')=>({key:id,owner:'PROD:123',timestamp:now,kind,room:'<房間>',message:{id,sender:55,senderName:'<Alice>',target:123,targetName:'Me',type:kind==='private'?'Whisper':'Chat',text:'=1+1\n中文 <img src="https://example.test/track"> & _x0041_',time:new Date(now)}});
function unzip(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder(),files={};let offset=0;
  while(view.getUint32(offset,true)===0x04034b50){
    const size=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),start=offset+30+nameLength+extra;
    assert.equal(view.getUint16(offset+8,true),0);
    const data=bytes.subarray(start,start+size);let crc=0xffffffff;
    for(const byte of data){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    assert.equal((crc^0xffffffff)>>>0,view.getUint32(offset+14,true));
    files[decoder.decode(bytes.subarray(offset+30,offset+30+nameLength))]=decoder.decode(data);offset=start+size;
  }
  assert.equal(view.getUint32(offset,true),0x02014b50);
  const end=bytes.length-22;assert.equal(view.getUint32(end,true),0x06054b50);assert.equal(view.getUint32(end+16,true),offset);
  assert.equal(view.getUint16(end+10,true),Object.keys(files).length);
  return files;
}
test('HTML groups rooms and preserves literal multiline text without active markup or private leakage',async()=>{
  const window=new Window();try{
    const privateRow=row('secret','private');privateRow.message.text='private-only';
    const html=exportHistoryHTML([row('one'),privateRow,{...row('old'),timestamp:now-86400000}],day,false,labels);
    window.document.write(html);
    assert.equal(window.document.querySelectorAll('article').length,1);
    assert.equal(window.document.querySelector('h2').textContent,'<房間>');
    assert.equal(window.document.querySelector('article p').textContent,row('one').message.text);
    assert.equal(window.document.querySelector('img,script,iframe,a'),null);
    assert.ok(!html.includes('private-only'));assert.match(html,/default-src 'none'/);
    assert.match(exportHistoryHTML([privateRow],day,true,labels),/private-only/);
  }finally{await window.happyDOM.close();}
});
test('XLSX is a valid ZIP/XML package with literal cells, headers, filtering and private opt-in',async()=>{
  const window=new Window();try{
    const privateRow=row('secret','private');privateRow.message.text='private-only';
    const files=unzip(exportHistoryXLSX([row('one'),privateRow],day,false,labels));
    assert.equal(Object.keys(files).length,6);
    const parse=text=>new window.DOMParser().parseFromString(text,'application/xml');
    for(const xml of Object.values(files))assert.equal(parse(xml).querySelector('parsererror'),null);
    const sheet=parse(files['xl/worksheets/sheet1.xml']);
    assert.equal(sheet.querySelectorAll('row').length,2);assert.equal(sheet.querySelectorAll('f').length,0);
    assert.equal(sheet.querySelector('[r="H2"]').getAttribute('t'),'inlineStr');
    assert.match(sheet.querySelector('[r="H2"] t').textContent,/^=1\+1\n中文/);
    assert.match(files['xl/worksheets/sheet1.xml'],/_x005F_x0041_/);
    assert.equal(sheet.querySelector('pane').getAttribute('state'),'frozen');
    assert.equal(sheet.querySelector('autoFilter').getAttribute('ref'),'A1:H2');
    assert.ok(!files['xl/worksheets/sheet1.xml'].includes('private-only'));
    assert.match(unzip(exportHistoryXLSX([privateRow],day,true,labels))['xl/worksheets/sheet1.xml'],/private-only/);
    const long=row('long');long.message.text='x'.repeat(32768);
    assert.throws(()=>exportHistoryXLSX([long],day,false,labels),/limit/);
  }finally{await window.happyDOM.close();}
});
