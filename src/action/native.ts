import definitions from "./native-data.json";
import type { CharacterSummary } from "../shared/types";
export const nativeActivities = definitions.activities;

/** Incomplete local emulation is not an explicit refusal. Never relax known restrictions. */
export function activityAvailability(reason: string | null, compatibility: boolean) {
  if (compatibility && reason && ["native.equipment", "native.unsupported", "native.actor", "native.preferences"].includes(reason)) {
    return { reason: null, warning: reason };
  }
  return { reason, warning: "" };
}
type ItemRule = { Effect?: string[]; Block?: string[]; AllowActivityOn?: string[]; unknown?: boolean };
function inventoryState(character: CharacterSummary) {
  const effects = new Set<string>(), blocked = new Set<string>(), accessible = new Set<string>(), groups = new Set<string>();
  let unknown = !Array.isArray(character.Appearance) || !character.Appearance.length;
  for (const raw of Array.isArray(character.Appearance) ? character.Appearance : []) {
    const item = raw as { Group?: string; Name?: string; Property?: ItemRule } | null;
    if (!item || typeof item.Group !== "string" || typeof item.Name !== "string") { unknown = true; continue; }
    groups.add(item.Group);
    const rule = (definitions.items as Record<string, ItemRule>)[`${item.Group}/${item.Name}`];
    if (!rule || rule.unknown) unknown = true;
    for (const [key, result] of [["Effect", effects], ["Block", blocked], ["AllowActivityOn", accessible]] as const) {
      for (const source of [rule, item.Property]) {
        const values = source?.[key];
        if (values !== undefined && (!Array.isArray(values) || values.some(value => typeof value !== "string"))) { unknown = true; continue; }
        if (key === "Effect" || item.Group.startsWith("Item")) for (const value of values || []) result.add(value);
      }
    }
  }
  return { effects, groups, unknown, blocked: (group: string, activity = false) => blocked.has(group) && !(activity && accessible.has(group)) };
}

/** Native Appearance effects are unioned with Property effects; unknown prerequisites fail closed. */
export function createActivityInventoryCheck(actor: CharacterSummary, target: CharacterSummary) {
  const a = inventoryState(actor), b = inventoryState(target);
  return (group: string, prerequisites: string[] = []): string | null => {
  const zone = (definitions.zones as Record<string, number>)[group];
  const code = zone === undefined ? NaN : (target.ArousalSettings?.Zone?.charCodeAt(zone) ?? NaN) - 100;
  if (Number.isFinite(code) && code >= 0 && code % 10 === 0) return "native.permission";
  if (actor.MemberNumber !== target.MemberNumber && (a.effects.has("Enclose") || b.effects.has("Enclose"))) return "native.blocked";
  const walk = !["Freeze", "Tethered", "Mounted"].some(effect => a.effects.has(effect));
  const hands = !a.effects.has("Block");
  const arms = hands || (!a.groups.has("ItemArms") && !a.blocked("ItemArms"));
  const gagged = [...a.effects].some(effect => /^Gag/.test(effect));
  let unsupported = false;
  for (const pre of prerequisites) {
    let allowed: boolean | undefined;
    switch (pre) {
      case "UseMouth": allowed = !a.effects.has("BlockMouth") && !gagged; break;
      case "UseTongue": allowed = !a.effects.has("BlockMouth"); break;
      case "TargetMouthBlocked": allowed = b.effects.has("BlockMouth"); break;
      case "IsGagged": allowed = gagged; break;
      case "TargetKneeling": allowed = b.effects.has("ForceKneel") || (target.ActivePose || []).some(pose => ["Kneel", "KneelingSpread"].includes(pose)); break;
      case "UseHands": allowed = hands && !a.effects.has("MergedFingers"); break;
      case "UseArms": allowed = arms; break;
      case "CantUseArms": allowed = !arms; break;
      case "UseFeet": allowed = walk; break;
      case "CantUseFeet": allowed = !walk; break;
      case "TargetCanUseTongue": allowed = !b.effects.has("BlockMouth"); break;
      case "TargetMouthOpen": allowed = group !== "ItemMouth" || !b.groups.has("ItemMouth") || b.effects.has("OpenMouth"); break;
      case "MoveHead": allowed = group !== "ItemHead" || !b.effects.has("FixedHead"); break;
      case "AssEmpty": allowed = group !== "ItemButt" || !b.effects.has("IsPlugged"); break;
      case "ZoneAccessible": allowed = !b.blocked(group, true); break;
      case "TargetZoneAccessible": allowed = !a.blocked(group, true); break;
      default: unsupported = true;
    }
    if (allowed === false) return "native.blocked";
  }
  if (a.unknown || b.unknown) return "native.equipment";
  return unsupported ? "native.unsupported" : null;
  };
}
export function activityInventoryReason(actor: CharacterSummary, target: CharacterSummary, group: string, prerequisites: string[] = []): string | null {
  return createActivityInventoryCheck(actor, target)(group, prerequisites);
}
export function activityReason(actor: CharacterSummary, target: CharacterSummary, group: string, name: string, room: { BlockCategory?: string[]; MapType?: string }, checkInventory = createActivityInventoryCheck(actor, target)): string | null {
  const activity = nativeActivities.find(value => value.name === name);
  const self = actor.MemberNumber === target.MemberNumber;
  if (room.BlockCategory !== undefined && !Array.isArray(room.BlockCategory)) return "native.room";
  if (!activity || !(self ? activity.self : activity.target).includes(group)) return "native.target";
  if (room.BlockCategory?.includes("Arousal") || (room.MapType && room.MapType !== "Never")) return "native.room";
  // Check explicit refusals before limitations, so compatibility mode cannot bypass them.
  if (target.ArousalSettings?.Active === "Inactive") return "native.permission";
  const knownZone = (definitions.zones as Record<string, number>)[group];
  const zoneCode = (target.ArousalSettings?.Zone?.charCodeAt(knownZone) ?? NaN) - 100;
  if (Number.isFinite(zoneCode) && zoneCode >= 0 && zoneCode % 10 === 0) return "native.permission";
  for (const [character, receiving] of [[actor, false], [target, true]] as const) {
    const encoded = (character.ArousalSettings?.Activity?.charCodeAt(activity.id) ?? NaN) - 100;
    if ((receiving ? encoded % 10 : Math.floor(encoded / 10)) === 0) return "native.permission";
  }
  // CharacterLoadOnline creates Female3DCG characters; raw online bundles omit this field.
  if ((actor.AssetFamily ?? "Female3DCG") !== "Female3DCG" || (target.AssetFamily ?? "Female3DCG") !== "Female3DCG") return "native.data";
  if (![actor, target].every(character => Array.isArray(character.Appearance) && character.Appearance.length)) return "native.data";
  const inventoryReason = checkInventory(group, activity.prerequisites);
  if (inventoryReason) return inventoryReason;
  if (activity.special) return "native.unsupported";
  // Automatic actor arousal, expression timers and punishment caches are not emulated.
  if (actor.ArousalSettings?.Active !== "Manual") return "native.actor";
  const settings = target.ArousalSettings;
  const zoneId = (definitions.zones as Record<string, number>)[group];
  if (!settings || !["Manual", "Hybrid", "Automatic"].includes(settings.Active || "") || typeof settings.Zone !== "string" || zoneId === undefined || settings.Zone.length <= zoneId) return "native.preferences";
  const zone = settings.Zone.charCodeAt(zoneId) - 100;
  if (zone < 0 || zone % 10 === 0) return "native.permission";
  for (const [character, receiving] of [[actor, false], [target, true]] as const) {
    if (typeof character.ArousalSettings?.Activity !== "string") continue; // BC permits missing activity preferences.
    const encoded = character.ArousalSettings.Activity.charCodeAt(activity.id) - 100;
    const value = receiving ? encoded % 10 : Math.floor(encoded / 10);
    if (value === 0) return "native.permission";
  }
  return null;
}
