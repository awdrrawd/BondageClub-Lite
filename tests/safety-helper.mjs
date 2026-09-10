import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync(new URL('../src/safeword.ts', import.meta.url), 'utf8')).replaceAll('export ', '');
export const { validAppearance, copyAppearance, releaseAppearance } = new Function(source + '; return {validAppearance,copyAppearance,releaseAppearance};')();
