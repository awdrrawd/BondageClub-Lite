import definitions from "./native-data.json";
import type { CharacterSummary } from "../shared/types";
export const nativeActivities = definitions.activities;

/** Incomplete local emulation is not an explicit refusal. Never relax known restrictions. */
export function activityAvailability(reason: string | null, compatibility: boolean) {
  if (compatibility && reason && ["native.equipment", "native.unsupported", "native.preferences"].includes(reason)) {
    return { reason: null, warning: reason };
  }
  return { reason, warning: "" };
}
type ItemRule = { Effect?: string[]; Block?: string[]; AllowActivityOn?: string[]; AllowActivity?: string[]; Expose?: string[]; unknown?: boolean };
type AppearanceItem = { Group?: string; Name?: string; Property?: ItemRule; Asset?: ItemRule & { Name?: string; Group?: { Name?: string } } };
function inventoryState(character: CharacterSummary) {
  const effects = new Set<string>(), blocked = new Set<string>(), accessible = new Set<string>(), groups = new Set<string>();
  const items: { group: string; name: string; rule?: ItemRule; property?: ItemRule }[] = [];
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  for (const raw of Array.isArray(character.Appearance) ? character.Appearance : []) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as AppearanceItem;
    const group = item.Asset?.Group?.Name ?? item.Group, name = item.Asset?.Name ?? item.Name;
    if (typeof group !== "string" || typeof name !== "string") continue;
    groups.add(group);
    const rule = item.Asset ?? (definitions.items as Record<string, ItemRule>)[`${group}/${name}`];
    items.push({ group, name, rule, property: item.Property });
    // BC CharacterGetEffects and activity zone blocking union Asset and Property arrays.
    for (const [key, result] of [["Effect", effects], ["Block", blocked], ["AllowActivityOn", accessible]] as const) {
      if (key === "Effect" || group.startsWith("Item")) {
        for (const source of [rule, item.Property]) for (const value of strings(source?.[key])) result.add(value);
      }
    }
  }
  // Clothing access uses Property before Asset (InventoryGetItemProperty), unlike activity Block.
  const property = (item: typeof items[number], key: "Block" | "Expose" | "AllowActivity") => {
    const value = item.property?.[key] ?? item.rule?.[key];
    if (value !== undefined) return Array.isArray(value) ? strings(value) : null;
    return item.rule && !item.rule.unknown ? [] : null;
  };
  const clothingBlocks = (zone: string, slots: string[]) => items.some(item => slots.includes(item.group) && property(item, "Block")?.includes(zone));
  const covered = (zone: string, slots: string[]) => items.some(item => {
    if (!slots.includes(item.group)) return false;
    const expose = property(item, "Expose");
    return expose !== null && !expose.includes(zone);
  });
  const naked = (zone: string) => {
    if (zone === "ItemBoots") return !["ItemBoots", "Socks", "Shoes"].some(slot => groups.has(slot));
    if (zone === "ItemHands") return !["ItemHands", "Gloves"].some(slot => groups.has(slot));
    if (zone === "ItemBreast" || zone === "ItemNipples") return !covered("ItemBreast", ["Cloth", "ClothOuter", "Bra"]) && !effects.has("BreastChaste");
    if (["ItemButt", "ItemVulva", "ItemVulvaPiercings"].includes(zone)) {
      const target = zone === "ItemButt" ? "ItemButt" : "ItemVulva";
      const crotch = clothingBlocks("ItemPelvis", ["Cloth", "ClothLower", "ClothOuter", "Socks", "Panties"])
        || ["ItemVulva", "ItemVulvaPiercings", "ItemButt"].every(part => covered(part, ["ClothLower", "Panties"]));
      return !crotch && !clothingBlocks(target, ["Cloth", "Panties", "Socks", "ClothLower", "ItemPelvis", "ItemVulvaPiercings"])
        && !covered(target, ["ClothLower", "Panties"]) && !effects.has(target === "ItemButt" ? "ButtChaste" : "Chaste")
        && !(target === "ItemButt" && effects.has("IsPlugged"));
    }
    return true;
  };
  const needs = (activity: string): boolean | undefined => {
    const values = items.map(item => property(item, "AllowActivity"));
    if (values.some(value => value?.includes(activity))) return true;
    return values.some(value => value === null) ? undefined : false;
  };
  const hasItem = (group: string, names?: string[]) => items.some(item => item.group === group && (!names || names.includes(item.name)));
  return { effects, groups, naked, needs, hasItem, blocked: (group: string, activity = false) => blocked.has(group) && !(activity && accessible.has(group)) };
}

/** Check known item effects; unknown assets never invalidate unrelated activities. */
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
      case "ZoneNaked": allowed = b.naked(group); break;
      case "TargetZoneNaked": allowed = a.naked(group); break;
      case "Collared": allowed = b.groups.has("ItemNeck"); break;
      case "Luzi_HasPawMittens": allowed = a.hasItem("ItemHands", ["PawMittens", "ElbowLengthMittens"]); break;
      case "Luzi_TargetHasPawMittens": allowed = b.hasItem("ItemHands", ["PawMittens", "ElbowLengthMittens"]); break;
      case "Luzi_HasTail": allowed = a.hasItem("TailStraps"); break;
      case "Luzi_TargetHasTail": allowed = b.hasItem("TailStraps"); break;
      case "Luzi_HasWings": allowed = a.hasItem("Wings"); break;
      case "Luzi_TargetHasWings": allowed = b.hasItem("Wings"); break;
      case "Luzi_HasCatTail": case "Luzi_TargetHasCatTail":
        allowed = (pre.startsWith("Luzi_Target") ? b : a).hasItem("TailStraps", ["TailStrap", "KittenTailStrap2", "KittenTailStrap1", "穿戴式浅色猫尾镜像", "小型穿戴式软猫尾镜像"]); break;
      case "Luzi_HasTentacles": case "Luzi_TargetHasTentacles": {
        const wearer = pre.startsWith("Luzi_Target") ? b : a;
        allowed = wearer.hasItem("TailStraps", ["Tentacles"]) || wearer.hasItem("ItemButt", ["Tentacles"]); break;
      }
      default:
        if (pre.startsWith("Needs-")) allowed = a.needs(pre.slice(6));
        else if (pre.startsWith("TargetNeeds-")) allowed = b.needs(pre.slice(12));
        // Item-specific packet expansion and plugin-only rules are not fully emulated.
        unsupported = true;
    }
    if (allowed === false) return "native.blocked";
  }
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
  // Local expression/arousal effects are execution limitations, not eligibility conditions.
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
