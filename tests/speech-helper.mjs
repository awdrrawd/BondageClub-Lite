import { loadTypeScript } from './load-typescript.mjs';
const code = loadTypeScript('src/network/speech.ts');
export const receivedSpeech = new Function(code + ';return receivedSpeech;')();
