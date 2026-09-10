import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { t } from './i18n-helper.mjs';
const providerSource = stripTypeScriptTypes(readFileSync('src/media/providers.ts', 'utf8')).replaceAll('export ', '');
export const resolveMedia = new Function(providerSource + ';return resolveMedia;')();
const source = stripTypeScriptTypes(readFileSync(new URL('../src/media/chat-links.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
export const { appendChatLinks, MediaConsent } = new Function('t', 'resolveMedia', source + '; return {appendChatLinks,MediaConsent};')(t, resolveMedia);
