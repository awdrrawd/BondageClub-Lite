import { loadTypeScript } from './load-typescript.mjs';
import { t } from './i18n-helper.mjs';
import { embeddedAction, literalAction } from './community-helper.mjs';
const code = loadTypeScript(new URL('../src/action/render.ts', import.meta.url));
export const { renderAction, formatServerText, dictionaryText, pronounEntries } = new Function('t', 'embeddedAction', 'literalAction', code + ';return {renderAction,formatServerText,dictionaryText,pronounEntries};')(t, embeddedAction, literalAction);
