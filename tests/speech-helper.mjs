import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const code = stripTypeScriptTypes(readFileSync('src/network/speech.ts', 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
export const receivedSpeech = new Function(code + ';return receivedSpeech;')();
