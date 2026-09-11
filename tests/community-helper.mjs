import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = ['../src/profile/afc.ts', '../src/action/embedded.ts'].map(file => stripTypeScriptTypes(readFileSync(new URL(file, import.meta.url), 'utf8')).replaceAll('export ', '')).join('\n');
export const { afcLovers, embeddedAction, literalAction } = new Function(source + ';return {afcLovers,embeddedAction,literalAction};')();
