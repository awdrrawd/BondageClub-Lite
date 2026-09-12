import { loadTypeScript } from './load-typescript.mjs';
const source = ['../src/profile/afc.ts', '../src/action/embedded.ts'].map(file => loadTypeScript(new URL(file, import.meta.url))).join('\n');
export const { afcLovers, embeddedAction, literalAction } = new Function(source + ';return {afcLovers,embeddedAction,literalAction};')();
