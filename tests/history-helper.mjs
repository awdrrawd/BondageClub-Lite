import { loadTypeScript } from './load-typescript.mjs';
import LZString from 'lz-string';
import { IDBKeyRange } from 'fake-indexeddb';
const code = path => loadTypeScript(path);
export const history = new Function('IDBKeyRange', code('src/storage/history.ts') + ';return {HistoryStore,historyBatch,historyOwner,historyPolicy,retained,localDay,exportHistory,privateRows,matchesHistory};')(IDBKeyRange);
export const {decodeFriendNames, contactName} = new Function('LZString', code('src/profile/friend-names.ts') + ';return {decodeFriendNames,contactName};')(LZString);
export function sessionClass(window) {
  return new Function('window','localStorage',...Object.keys(history), code('src/storage/history-session.ts') + ';return HistorySession;')(window,window.localStorage,...Object.values(history));
}
