import definitions from "./native-data.json";
import { resolveItemProperties } from "./item-properties";
import type { CharacterSummary } from "../shared/types";

type ItemRule = { Effect?: string[]; Block?: string[]; AllowActivityOn?: string[]; AllowActivity?: string[]; Expose?: string[]; SetPose?: string[]; AllowActivePose?: string[]; TypeRecord?: Record<string, unknown>; unknown?: boolean };
type AppearanceItem = { Group?: string; Name?: string; Property?: ItemRule; Asset?: ItemRule & { Name?: string; Group?: { Name?: string } } };
export function appearanceState(character: CharacterSummary) {
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
    const resolved = resolveItemProperties(group, name, item.Property);
    const effectiveProperty = resolved.property;
    items.push({ group, name, rule, property: effectiveProperty });
    // BC CharacterGetEffects and activity zone blocking union Asset and Property arrays.
    for (const [key, result] of [["Effect", effects], ["Block", blocked], ["AllowActivityOn", accessible]] as const) {
      if (key === "Effect" || group.startsWith("Item")) {
        for (const source of [rule, effectiveProperty]) for (const value of strings(source?.[key])) result.add(value);
      }
    }
  }
  // Clothing access uses Property before Asset (InventoryGetItemProperty), unlike activity Block.
  const property = (item: typeof items[number], key: "Block" | "Expose" | "AllowActivity" | "SetPose" | "AllowActivePose") => {
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
  const crotchAccessible = () => !clothingBlocks("ItemPelvis", ["Cloth", "ClothLower", "ClothOuter", "Socks", "Panties"])
    && !["ItemVulva", "ItemVulvaPiercings", "ItemButt"].every(part => covered(part, ["ClothLower", "Panties"]));
  const exposed = (zone: string) => !clothingBlocks(zone, ["Cloth", "Panties", "Socks", "ClothLower", "ItemPelvis", "ItemVulvaPiercings"])
    && !covered(zone, ["ClothLower", "Panties"]) && !effects.has(zone === "ItemButt" ? "ButtChaste" : "Chaste");
  const naked = (zone: string) => {
    if (zone === "ItemBoots") return !["ItemBoots", "Socks", "Shoes"].some(slot => groups.has(slot));
    if (zone === "ItemHands") return !["ItemHands", "Gloves"].some(slot => groups.has(slot));
    if (zone === "ItemBreast" || zone === "ItemNipples") return !covered("ItemBreast", ["Cloth", "ClothOuter", "Bra"]) && !effects.has("BreastChaste");
    if (["ItemButt", "ItemVulva", "ItemVulvaPiercings"].includes(zone)) {
      const target = zone === "ItemButt" ? "ItemButt" : "ItemVulva";
      return (target === "ItemButt" || crotchAccessible()) && exposed(target)
        && !(target === "ItemButt" && effects.has("IsPlugged"));
    }
    return true;
  };
  const activityItems = (activity: string) => items.filter(item => property(item, "AllowActivity")?.includes(activity)
    && !(item.name === "Penis" && effects.has("Chaste"))
    && ![...(item.rule?.Effect ?? []), ...(item.property?.Effect ?? [])].includes("UseRemote"));
  const hasItem = (group: string, names?: string[]) => items.some(item => item.group === group && (!names || names.includes(item.name)));
  // PoseRefresh: active poses take priority only when permitted by every worn item.
  const categories = definitions.poses as Record<string, string>;
  const byCategory = (values: string[]) => {
    const result: Record<string, string[]> = {};
    for (const value of values) if (categories[value]) (result[categories[value]] ??= []).push(value);
    return result;
  };
  const allowed: Record<string, string[]> = {}, forced: string[] = [];
  for (const item of items) {
    let set = property(item, "SetPose") ?? [];
    const active = property(item, "AllowActivePose") ?? [];
    if (!set.length && active.length) set = active.slice(0, 1);
    const allow = [...new Set([...set, ...active])];
    const parts = byCategory(allow);
    // AssetParsePosePrerequisite adds full-body alternatives to compatible poses.
    if ((parts.BodyUpper || parts.BodyLower) && (!parts.BodyUpper || parts.BodyUpper.includes("BackElbowTouch")) && (!parts.BodyLower || parts.BodyLower.includes("Kneel"))) allow.push("Hogtied");
    if (!parts.BodyUpper && parts.BodyLower?.includes("Kneel")) allow.push("AllFours");
    const mapped = byCategory(allow);
    for (const [category, values] of Object.entries(mapped)) if (values) allowed[category] = allowed[category]?.filter(pose => values.includes(pose)) ?? values;
    if ((mapped.BodyUpper || mapped.BodyLower) && !mapped.BodyFull) allowed.BodyFull = [];
    forced.push(...set);
  }
  const pose: Record<string, string> = {};
  for (const [category, candidates] of Object.entries(byCategory([...(character.ActivePose ?? []), ...forced]))) {
    const value = candidates?.find(candidate => !allowed[category] || allowed[category].includes(candidate));
    if (value) pose[category] = value;
  }
  if (pose.BodyFull) { delete pose.BodyUpper; delete pose.BodyLower; }
  else { pose.BodyUpper ??= "BaseUpper"; pose.BodyLower ??= "BaseLower"; }
  const isBlocked = (group: string, activity = false) => blocked.has(group) && !(activity && accessible.has(group));
  const mirrors = definitions.mirrors as Record<string, string>;
  const zoneBlocked = (group: string) => [group, ...Object.keys(mirrors).filter(key => mirrors[key] === group)].every(part => isBlocked(part, true));
  const echoNaked = (group: string) => group === "ItemHands" ? !effects.has("MergedFingers")
    : ["ItemVulva", "ItemVulvaPiercings"].includes(group) ? exposed("ItemVulva") : group === "ItemButt" ? exposed(group) : naked(group);
  return { effects, groups, naked, exposed, crotchAccessible, echoNaked, pose, hasItem, activityItems, blocked: isBlocked, zoneBlocked,
    pelvisExposed: () => !clothingBlocks("ItemPelvis", ["Cloth", "ClothLower"]) && !covered("ItemVulva", ["ClothLower"]),
    item: (group: string) => items.find(item => item.group === group) };
}

