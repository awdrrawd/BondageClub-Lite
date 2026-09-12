import { loadTypeScript } from './load-typescript.mjs';
import { t } from './i18n-helper.mjs';
import { dialogs } from './dialogs-helper.mjs';
const providerSource = loadTypeScript('src/media/providers.ts');
export const resolveMedia = new Function(providerSource + ';return resolveMedia;')();
const source = loadTypeScript(new URL('../src/media/chat-links.ts', import.meta.url));
export const { appendChatLinks, MediaConsent } = new Function('t', 'resolveMedia', 'showNotice', source + '; return {appendChatLinks,MediaConsent};')(t, resolveMedia,(message,doc)=>dialogs(doc).showNotice(message,doc));
