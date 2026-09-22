// Reviewed Japanese/Korean terminology and native sentence patterns. Run after
// generating drafts; this keeps short labels and common actions consistent.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCatalogs } from './compile-action-catalogs.mjs';
import { writeJson } from './catalog-utils.mjs';
const glossary=JSON.parse(readFileSync(new URL('./action-language-glossary.json',import.meta.url),'utf8'));
const index=locale=>locale==='ja'?0:1;
const parts=new Map(Object.entries(glossary.parts).map(([key,value])=>[key.toLowerCase(),value]));

export function reviewedLabel(text,locale) {
  if(glossary.labels[text]) return glossary.labels[text][index(locale)];
  for(const [verb,suffix] of Object.entries(glossary.labelVerbs)) {
    if(!text.startsWith(verb+' ')) continue;
    const part=parts.get(text.slice(verb.length+1).toLowerCase());
    if(part) return part[index(locale)]+suffix[index(locale)];
  }
}
function noun(text,locale) {
  const i=index(locale);
  if(text==='ActivityAsset') return text;
  for(const [prefix,ja,ko] of [["TargetCharacter's ",'TargetCharacterの','TargetCharacter의 '],['PronounPossessive own ','PronounPossessive','PronounPossessive '],['PronounPossessive ','PronounPossessive','PronounPossessive '],['TargetPronounPossessive ','TargetPronounPossessive','TargetPronounPossessive ']]) {
    if(!text.startsWith(prefix)) continue;
    const rest=text.slice(prefix.length);
    const value=rest==='ActivityAsset'?rest:parts.get(rest)?.[i];
    if(value) return (i===0?ja:ko)+value;
  }
}
const object=text=>text+(/[가-힣]$/.test(text)?(text.charCodeAt(text.length-1)-0xAC00)%28?'을':'를':'을(를)');
const verbs={
  bites:['を噛みます','깨뭅니다'], caresses:['を愛撫します','어루만집니다'],
  injects:['に注射します','에 주사합니다'], kisses:['にキスします','에 입맞춥니다'],
  licks:['を舐めます','핥습니다'], massages:['をマッサージします','마사지합니다'],
  nibbles:['を甘噛みします','살짝 깨뭅니다'], pinches:['をつまみます','꼬집습니다'],
  scratches:['を軽く引っ掻きます','살짝 긁습니다'], spanks:['を叩きます','때립니다'],
  tickles:['をくすぐります','간지럽힙니다'], gropes:['を揉みます','주무릅니다'],
  masturbates:['を刺激します','자극합니다'], slaps:['を平手で叩きます','손바닥으로 때립니다'],
  cleans:['をきれいにします','닦아줍니다'], brushes:['をブラシで梳きます','빗습니다'],
  pulls:['を引っ張ります','잡아당깁니다'], rubs:['をこすります','문지릅니다'],
  boops:['を軽くつつきます','살짝 콕 건드립니다'], wiggles:['を小刻みに動かします','꼼지락거립니다'],
  shakes:['を揺らします','흔듭니다'], flicks:['を指で弾きます','손가락으로 튕깁니다'],
  releases:['を放します','놓아줍니다'], grabs:['をつかみます','잡습니다']
};
export function reviewedMessage(source,locale) {
  if(!source.startsWith('SourceCharacter ') || !source.endsWith('.')) return;
  const i=index(locale), subject=i===0?'SourceCharacterは':'SourceCharacter 님이 ';
  const clause=source.slice(16,-1);
  const sentence=(body,ja,ko)=>subject+(i===0?body+ja:(ko.startsWith('에 ')?body+ko:object(body)+' '+ko))+'.';
  let m=clause.match(/^(bites|caresses|injects|kisses|licks|massages|nibbles|pinches|scratches|spanks|tickles|gropes|masturbates|slaps|cleans|brushes|pulls|rubs|boops|wiggles|shakes|flicks|releases|grabs) (.+)$/);
  if(m) {
    const body=noun(m[2],locale);
    if(body) return sentence(body,...verbs[m[1]]).replace(/\.$/,i===0?'。':'.');
  }
  for(const [pattern,ja,ko] of [
    [/^grabs (.+) firmly$/,'をしっかりつかみます','단단히 잡습니다'],
    [/^scratches over (.+)$/,'を軽く引っ掻きます','살짝 긁습니다'],
    [/^nibbles on (.+)$/,'を甘噛みします','살짝 깨뭅니다'],
    [/^pulls on (.+)$/,'を引っ張ります','잡아당깁니다'],
    [/^sucks on (.+)$/,'を吸います','빱니다'],
    [/^gently pets (.+)$/,'を優しく撫でます','부드럽게 쓰다듬습니다'],
    [/^politely kisses (.+)$/,'にそっとキスします','에 가볍게 입맞춥니다'],
    [/^gives a small(?: and polite)? kiss on (.+)$/,'にそっとキスします','에 가볍게 입맞춥니다'],
    [/^cleans and polishes (.+)$/,'をきれいに磨きます','깨끗하게 닦습니다']
  ]) {
    m=clause.match(pattern); const body=m&&noun(m[1],locale);
    if(body) return sentence(body,ja,ko).replace(/\.$/,i===0?'。':'.');
  }
  m=clause.match(/^(rubs|shocks|hits|tickles|masturbates) (.+) with (PronounPossessive ActivityAsset)$/);
  if(m) {
    const body=noun(m[2],locale), tool=noun(m[3],locale);
    const action={rubs:['をこすります','문지릅니다'],shocks:['に電気刺激を与えます','에 전기 자극을 줍니다'],hits:['を叩きます','때립니다'],tickles:['をくすぐります','간지럽힙니다'],masturbates:['を刺激します','자극합니다']}[m[1]];
    if(body) return i===0?`${subject}${tool}で${body}${action[0]}。`:`${subject}${tool}(으)로 ${action[1].startsWith('에 ')?body+action[1]:object(body)+' '+action[1]}.`;
  }
  m=clause.match(/^(pours ActivityAsset onto|rolls a ActivityAsset over|throws ActivityAsset (?:on|at|into)) (.+)$/);
  if(m) {
    const body=noun(m[2],locale);
    if(body) {
      if(m[1].startsWith('pours')) return i===0?`${subject}${body}にActivityAssetを注ぎます。`:`${subject}${body}에 ActivityAsset을(를) 붓습니다.`;
      if(m[1].startsWith('rolls')) return i===0?`${subject}${body}の上でActivityAssetを転がします。`:`${subject}${body} 위로 ActivityAsset을(를) 굴립니다.`;
      return i===0?`${subject}${body}にActivityAssetを投げます。`:`${subject}${body}에 ActivityAsset을(를) 던집니다.`;
    }
  }
  const exact={
    'cuddles with TargetCharacter':['TargetCharacterを抱き寄せます','TargetCharacter 님을 꼭 껴안습니다'],
    'baps TargetCharacter':['TargetCharacterを軽く叩きます','TargetCharacter 님을 가볍게 톡 칩니다'],
    'headbutts TargetCharacter':['TargetCharacterに頭突きをします','TargetCharacter 님을 머리로 들이받습니다'],
    'flops on top of TargetCharacter':['TargetCharacterの上に寝そべります','TargetCharacter 님 위에 엎드립니다'],
    'nose-nuzzles with TargetCharacter':['TargetCharacterと鼻をすり合わせます','TargetCharacter 님과 코를 비빕니다'],
    'nods':['頷きます','고개를 끄덕입니다'],
    'eats some ActivityAsset':['ActivityAssetを食べます','ActivityAsset을(를) 먹습니다']
  }[clause];
  if(exact) return subject+exact[i]+(i===0?'。':'.');
}

function main() {
  const catalogs=compileCatalogs();
  for(const locale of ['ja','ko']) {
    const file=`src/translations/overrides/${locale}.json`;
    const dictionary=JSON.parse(readFileSync(file,'utf8'));
    let labels=0,messages=0;
    for(const [key,text] of Object.entries(catalogs.en)) {
      if(/^(Label-|Activity)/.test(key)) {const value=reviewedLabel(text,locale);if(value){dictionary[key]=value;labels++;}}
      if(/^Chat(?:Self|Other)-/.test(key)) {const value=reviewedMessage(text,locale);if(value){dictionary[key]=value;messages++;}}
    }
    // Possessive suffixes belong in the dictionary; reviewed templates place the
    // token directly before the possessed noun.
    const pronouns=locale==='ja'?{HeHim:'彼の',SheHer:'彼女の',TheyThem:'その人の',ItIt:'それの'}:{HeHim:'그의',SheHer:'그녀의',TheyThem:'그 사람의',ItIt:'그것의'};
    for(const [name,value] of Object.entries(pronouns)) dictionary[`PronounPossessive${name}`]=value;
    for(const [key,pair] of Object.entries(glossary.messages)) dictionary[key]=pair[index(locale)];
    const corrections=JSON.parse(readFileSync(new URL('./action-sentence-corrections.json',import.meta.url),'utf8'))[locale];
    for(const key of Object.keys(dictionary).filter(key=>/^Chat(?:Self|Other)-/.test(key))) {
      let text=dictionary[key];
      // Activity messages describe events; they are not instructions to the reader.
      for(const [from,to] of Object.entries(corrections).sort(([a],[b])=>b.length-a.length)) text=text.replaceAll(from,to);
      text=text.replace(/(TargetPronounPossessive|PronounPossessive)\s*(?:の|의)\s*/g,'$1 ');
      if(text.startsWith('SourceCharacter')) {
        const rest=text.slice('SourceCharacter'.length).trimStart();
        if(locale==='ja') text='SourceCharacter'+(/^[はがのをにと]/.test(rest)?'':'は')+rest;
        else if(/^(은|는|이|가)(?=\s|[A-Z])/.test(rest)) text='SourceCharacter 님'+rest.replace(/^(은|는)/,'은').replace(/^(이|가)/,'이');
        else if(!/^(의|을|를|와|과)/.test(rest)) text='SourceCharacter '+(rest.startsWith('님')?'':'님이 ')+rest;
      }
      if(/[^\d]\}$/.test(text)) text=text.slice(0,-1);
      dictionary[key]=text;
    }
    writeJson(file,dictionary);
    console.log(`${locale}: reviewed ${labels} labels, ${messages} messages`);
  }
  const lscg=JSON.parse(readFileSync(new URL('./lscg-label-glossary.json',import.meta.url),'utf8'));
  for(const [i,locale] of lscg.locales.entries()) {
    const file=`src/translations/overrides/${locale}.json`, dictionary=JSON.parse(readFileSync(file,'utf8'));
    for(const [name,values] of Object.entries(lscg.names)) dictionary[`Label-Activity-LSCG_${name}`]=values[i];
    // Also replace untranslated raw labels; direct consumers may bypass the
    // shared activity label lookup used by the built-in menu.
    for(const [key,text] of Object.entries(catalogs.en)) {
      if(!key.startsWith('Label-') || !key.includes('-LSCG_')) continue;
      if((catalogs[locale][key]||text)===text) {
        const name=key.split('-LSCG_')[1];
        if(lscg.names[name]) dictionary[key]=lscg.names[name][i];
      }
    }
    writeJson(file,dictionary);
  }
  const corrections=JSON.parse(readFileSync(new URL('./action-language-corrections.json',import.meta.url),'utf8'));
  for(const [locale,phrases] of Object.entries(corrections)) {
    const file=`src/translations/overrides/${locale}.json`,dictionary=JSON.parse(readFileSync(file,'utf8'));
    const upstreamFile=`src/translations/action/xiaosu/${locale}.json`;
    const upstream=existsSync(upstreamFile)?JSON.parse(readFileSync(upstreamFile,'utf8')):{};
    for(const [key,text] of Object.entries(catalogs.en)) if(phrases[text] && !Object.hasOwn(upstream,key)) dictionary[key]=phrases[text];
    writeJson(file,dictionary);
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main();
