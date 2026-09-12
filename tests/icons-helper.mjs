import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
export function uiIcons(window) {
  const source=readFileSync('src/ui/icons.ts','utf8');
  const imports=[...source.matchAll(/import (\w+) from '(.+)';/g)];
  const code=stripTypeScriptTypes(source).replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
  const icon=new Function('document',...imports.map(m=>m[1]),code+';return icon;')(window.document,...imports.map(m=>m[2].endsWith('?no-inline') ? '/src/ui/'+m[2].replace('./','').replace('?no-inline','') : readFileSync('src/ui/'+m[2].replace('?raw',''),'utf8')));
  const selectCode=stripTypeScriptTypes(readFileSync('src/ui/icon-select.ts','utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
  const iconSelect=new Function('document','Event','icon',selectCode+';return iconSelect;')(window.document,window.Event,icon);
  return {icon,iconSelect};
}
