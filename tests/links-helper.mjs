import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { t } from './i18n-helper.mjs';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/media/chat-links.ts', import.meta.url), 'utf8')).replace('import { t } from "../i18n";', '').replaceAll('export ', '');
export const { appendChatLinks, MediaConsent } = new Function('t', source + '; return {appendChatLinks,MediaConsent};')(t);
