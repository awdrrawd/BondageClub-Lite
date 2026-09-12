import { loadTypeScript } from './load-typescript.mjs';
import { t } from './i18n-helper.mjs';
const source=loadTypeScript('src/platform/dialogs.ts');
export function dialogs(document) {
  return new Function('t','document',source+';return {showConfirm,showNotice};')(t,document);
}
