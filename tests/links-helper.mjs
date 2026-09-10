import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/chat-links.ts', import.meta.url), 'utf8')).replace('export ', '');
export const appendChatLinks = new Function(source + '; return appendChatLinks;')();
