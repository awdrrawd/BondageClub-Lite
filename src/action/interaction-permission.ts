import type { CharacterSummary, ClientSnapshot } from "../shared/types";

function listed(list: number[] | undefined, member: number): boolean | undefined {
  return Array.isArray(list) && list.every(id => Number.isSafeInteger(id) && id > 0) ? list.includes(member) : undefined;
}
function dominant(character: CharacterSummary): number | undefined {
  if (!Array.isArray(character.Reputation) || !character.Reputation.every(row => row && typeof row.Type === "string" && Number.isFinite(row.Value) && row.Value >= -100 && row.Value <= 100)) return undefined;
  const entry = character.Reputation.find(row => row?.Type === "Dominant");
  if (!entry) return 0; // Official ReputationGet default for a received, empty reputation list.
  return Number.isFinite(entry.Value) && entry.Value >= -100 && entry.Value <= 100 ? entry.Value : undefined;
}

/** Online-player branches of ServerChatRoomGetAllowItem. Never infer missing lists. */
export function interactionPermission(state: Readonly<ClientSnapshot> | undefined, targetId: number) {
  if (!state?.player || state.phase !== "in-room" || !state.room) return "not-in-room";
  if (!Number.isSafeInteger(targetId) || targetId <= 0) return "target-missing";
  const target = state.characters.find(c => c.MemberNumber === targetId);
  if (!target) return "target-missing";
  const actor = { ...state.player, ...state.characters.find(c => c.MemberNumber === state.player?.MemberNumber) };
  if (!Number.isSafeInteger(actor.MemberNumber) || actor.MemberNumber <= 0) return "permission-unknown";
  const level = target.AllowedInteractions ?? target.ItemPermission;
  if (targetId === actor.MemberNumber || target.Ownership?.MemberNumber === actor.MemberNumber) return null;
  if (!Number.isInteger(level) || level! < 0 || level! > 5) return "permission-unknown";
  if (level === 0) return null;
  const black = listed(target.BlackList, actor.MemberNumber);
  const white = listed(target.WhiteList, actor.MemberNumber);
  // Official online lovers are identified from the source's Lovership, regardless of stage.
  const lover = Array.isArray(actor.Lovership) && actor.Lovership.some(love => love?.MemberNumber === targetId);
  if (level === 1 && black === false) return null;
  if (level === 2 && black === false) {
    if (white === true || lover) return null;
    const sourceRep = dominant(actor), targetRep = dominant(target);
    if (sourceRep !== undefined && targetRep !== undefined && sourceRep + 25 >= targetRep) return null;
  }
  if (level === 3 && (white === true || lover)) return null;
  if (level === 4 && lover) return null;
  return "restricted-permission";
}
