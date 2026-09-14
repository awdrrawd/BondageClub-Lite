// Optional maintainer tool: generate missing translation drafts from public catalog
// strings. Never imported by the client or run by build/dev. Review before shipping.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCatalogs } from './compile-action-catalogs.mjs';
import { writeJson } from './catalog-utils.mjs';

export const actionKey = key => /^(?:Chat(?:Self|Other)-|Label-|Action|Activity|Pronoun|DialogGroupName)/.test(key);
export const tokens = text => text.match(/ActivityPlushieAssetTheirs|ActivityPlushieAssetMine|ActivityPlushieAsset|ActivityAsset|TargetCharacterName|SourceCharacter|TargetCharacter|DestinationCharacter|TargetPronoun\w+|Pronoun(?:Object|Possessive|Self|Subject)|FocusAssetGroup|NextAsset|PrevAsset|CoinResult|DiceResult|DiceType|\{\d+\}/g) || [];
export function protect(text) {
  const names = [...new Set(tokens(text))].sort((a,b)=>b.length-a.length);
  for (const [index, name] of names.entries()) text = text.replaceAll(name, `⟦${index}⟧`);
  return { text, names };
}
export function restore(text, names) {
  // Some language pairs insert spaces inside the numeric marker.
  text = text.replace(/⟦\s*(\d+)\s*⟧/g, (_, index) => names[Number(index)] ?? `⟦${index}⟧`);
  if (/[⟦⟧]/.test(text)) throw new Error('Unrecognized placeholder');
  return text.trim();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function translate(text, locale) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  for (const [key,value] of Object.entries({client:'gtx', sl:'auto', tl:locale === 'zh' ? 'zh-TW' : locale === 'zh-cn' ? 'zh-CN' : locale, dt:'t', q:text})) url.searchParams.set(key,value);
  for (let attempt=0; attempt<5; attempt++) {
    try {
      const response = await fetch(url, {signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error(`Translation HTTP ${response.status}`);
      const result = await response.json();
      return result[0].map(part=>part[0] || '').join('');
    } catch (error) { if (attempt === 4) throw error; await sleep(1500 * (attempt+1)); }
  }
}

async function main() {
  const catalogs = compileCatalogs();
  const keys = Object.keys(catalogs.en).filter(actionKey);
  for (const locale of process.argv.slice(2).length ? process.argv.slice(2) : ['ja','ko','uk','fr','de','ru','zh-cn','zh']) {
    const file = `src/translations/overrides/${locale}.json`;
    const dictionary = existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : {};
    const groups = new Map();
    for (const key of keys) {
      if (Object.hasOwn(catalogs[locale] || {},key) || Object.hasOwn(dictionary,key)) continue;
      // Existing Chinese messages provide clearer context for short East Asian
      // action phrases than isolated English words such as Pet, Scratch or Nuzzle.
      const source = ['ja','ko'].includes(locale) ? catalogs.zh[key] || catalogs.en[key] : catalogs.en[key];
      if (!groups.has(source)) groups.set(source,[]);
      groups.get(source).push(key);
    }
    const pending = [...groups].map(([source,keys])=>({source,keys,...protect(source)}));
    const failures = [];
    let done=0;
    const save = () => writeJson(file,dictionary);
    const accept = (item,text) => {
      const value = restore(text,item.names);
      if (!value || JSON.stringify(tokens(value).sort()) !== JSON.stringify(tokens(item.source).sort())) throw new Error('Placeholder mismatch');
      for (const key of item.keys) dictionary[key]=value;
      done++;
    };
    while (pending.length) {
      const batch=[]; let size=0;
      while (pending.length && batch.length<30 && size+pending[0].text.length<2400) {
        const item=pending.shift(); batch.push(item); size+=item.text.length+1;
      }
      if (!batch.length) batch.push(pending.shift());
      try {
        const result=(await translate(batch.map(item=>item.text).join('\n'),locale)).split(/\r?\n/);
        if (result.length!==batch.length) throw new Error('Line count mismatch');
        for(let i=0;i<batch.length;i++) {
          try {accept(batch[i],result[i]);} catch {failures.push(batch[i]);}
        }
      } catch { failures.push(...batch); }
      save();
      console.log(`${locale}: ${done}/${groups.size}, retry ${failures.length}`);
      await sleep(150);
    }
    const unresolved=[];
    for (const item of failures) {
      try {accept(item,await translate(item.text,locale));} catch {unresolved.push(item);}
      save();
      await sleep(150);
    }
    writeJson(`.action-translation-${locale}-unresolved.json`,unresolved);
    console.log(`${locale}: saved ${done}/${groups.size}; unresolved ${unresolved.length}`);
  }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
