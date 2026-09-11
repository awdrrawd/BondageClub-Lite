import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import LZString from 'lz-string';
import { IDBKeyRange } from 'fake-indexeddb';
const code = path => stripTypeScriptTypes(readFileSync(path, 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
export const history = new Function('IDBKeyRange', code('src/storage/history.ts') + ';return {HistoryStore,historyBatch,historyOwner,historyPolicy,retained,localDay,exportHistory,privateRows};')(IDBKeyRange);
export const {decodeFriendNames, contactName} = new Function('LZString', code('src/profile/friend-names.ts') + ';return {decodeFriendNames,contactName};')(LZString);
export function sessionClass(window) {
  return new Function('window','localStorage',...Object.keys(history), code('src/storage/history-session.ts') + ';return HistorySession;')(window,window.localStorage,...Object.values(history));
}
