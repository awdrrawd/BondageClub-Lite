import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { t } from './i18n-helper.mjs';
const source=stripTypeScriptTypes(readFileSync('src/platform/dialogs.ts','utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
export function dialogs(document) {
  return new Function('t','document',source+';return {showConfirm,showNotice};')(t,document);
}
