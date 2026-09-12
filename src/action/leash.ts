import definitions from './native-data.json';
import { interactionPermission } from './interaction-permission';
import type { CharacterSummary, ClientSnapshot } from '../shared/types';

/** Receive-side leash checks; appearance is read, never rewritten. */
export function canFollowLeash(state: Readonly<ClientSnapshot>, holder: CharacterSummary): boolean {
  if (!state.player || !state.room || state.phase !== 'in-room') return false;
  if (state.room.BlockCategory !== undefined && (!Array.isArray(state.room.BlockCategory) || state.room.BlockCategory.includes('Leashing'))) return false;
  if (state.room.MapType && state.room.MapType !== 'Never') return false;
  const self = { ...state.player, ...state.characters.find(c => c.MemberNumber === state.player!.MemberNumber) };
  if (self.OnlineSharedSettings?.AllowPlayerLeashing !== true || self.AssetFamily !== 'Female3DCG' || !Array.isArray(self.Appearance)) return false;
  if (holder.MemberNumber === self.MemberNumber || [self.BlackList, self.GhostList].some(list => list !== undefined && (!Array.isArray(list) || list.includes(holder.MemberNumber)))) return false;
  if (interactionPermission({ ...state, player: { ...holder, AccountName: '', ID: holder.ID || '' }, characters: [holder, self] }, self.MemberNumber)) return false;
  let leash = false;
  for (const raw of self.Appearance) {
    if (!raw || typeof raw !== 'object') return false;
    const item = raw as {Group?:string;Name?:string;Property?:{Effect?:unknown;LockedBy?:unknown}};
    const rule = (definitions.items as Record<string,{Effect?:string[];unknown?:boolean}>)[`${item.Group}/${item.Name}`];
    if (!rule || rule.unknown) return false;
    const extra = item.Property?.Effect;
    if (extra !== undefined && (!Array.isArray(extra) || !extra.every(effect => typeof effect === 'string'))) return false;
    const effects = [...(rule.Effect || []), ...(extra as string[] | undefined || [])];
    if (!effects.includes('Leash') && effects.some(effect => ['Tethered','Mounted','Enclose','OneWayEnclose'].includes(effect))) return false;
    if (!effects.includes('Leash')) continue;
    leash = true;
    if (item.Group !== 'ItemNeckRestraints' || !item.Property?.LockedBy) continue;
    if (typeof item.Property.LockedBy !== 'string') return false;
    const lock = (definitions.locks as Record<string,{owner:boolean;lover:boolean;family:boolean}>)[item.Property.LockedBy];
    if (!lock) return false;
    const owner = self.Ownership?.MemberNumber === holder.MemberNumber;
    const lover = Array.isArray(self.Lovership) && self.Lovership.some(love => love?.MemberNumber === holder.MemberNumber);
    if ((lock.owner || lock.lover || lock.family) && !owner && !((lock.lover || lock.family) && lover)) return false;
  }
  return leash;
}
