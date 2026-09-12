import { loadTypeScript } from './load-typescript.mjs';
import { readFileSync } from 'node:fs';
export function uiIcons(window) {
  const source=readFileSync('src/ui/icons.ts','utf8');
  const imports=[...source.matchAll(/import (\w+) from '(.+)';/g)];
  const code=loadTypeScript('src/ui/icons.ts');
  const icon=new Function('document',...imports.map(m=>m[1]),code+';return icon;')(window.document,...imports.map(m=>m[2].endsWith('?no-inline') ? '/src/ui/'+m[2].replace('./','').replace('?no-inline','') : readFileSync('src/ui/'+m[2].replace('?raw',''),'utf8')));
  const selectCode=loadTypeScript('src/ui/icon-select.ts');
  const iconSelect=new Function('document','Event','icon',selectCode+';return iconSelect;')(window.document,window.Event,icon);
  return {icon,iconSelect};
}
