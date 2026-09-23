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

/** Item restrictions are independent of the general interaction level. */
export function activityItemPermission(actor: CharacterSummary, target: CharacterSummary, group: string, name: string, typeRecord?: Record<string, unknown>): string | null {
  if (typeRecord && Object.values(typeRecord).some(value => !Number.isInteger(value) || Number(value) < 0)) return "native.data";
  // Include defaults restored from the minimized TypeRecord, plus the whole-item restriction.
  const types = ["", ...Object.entries(typeRecord ?? {}).map(([key, value]) => `${key}${value}`)];
  const matches = (data: unknown): boolean | undefined => {
    if (data === undefined || data === null) return false; // BC initializes omitted item lists to empty.
    if (Array.isArray(data)) return data.some(row => row?.Group === group && row?.Name === name && types.includes(row.Type || ""));
    if (typeof data !== "object") return undefined;
    const entry = (data as Record<string, Record<string, unknown>>)[group]?.[name];
    if (entry === undefined) return false;
    return Array.isArray(entry) && entry.every(type => typeof type === "string") ? entry.some(type => types.includes(type)) : undefined;
  };
  const permission = target.PermissionItems?.[`${group}/${name}`];
  const blocked = matches(target.BlockItems), limited = matches(target.LimitedItems);
  const resolved = types.map(type => type ? permission?.TypePermissions?.[type] : permission?.Permission);
  if (blocked || resolved.includes("Block")) return "native.permission";
  if (blocked === undefined || limited === undefined) return "native.data";
  if (!limited && !resolved.includes("Limited")) return null;
  if (actor.MemberNumber === target.MemberNumber || target.Ownership?.MemberNumber === actor.MemberNumber || target.Lovership?.some(love => love.MemberNumber === actor.MemberNumber)) return null;
  const level = target.AllowedInteractions ?? target.ItemPermission;
  return typeof level === "number" && level < 3 && listed(target.WhiteList, actor.MemberNumber) === true ? null : "native.permission";
}
