import definitions from "./native-data.json";
import { resolveItemProperties } from './item-properties';
import type { CharacterSummary } from "../shared/types";
const activityGroup = (group: string) => (definitions.mirrors as Record<string, string>)[group] ?? group;
export const nativeActivities = definitions.activities.map(activity => ({ ...activity,
  target: [...new Set(activity.target.map(activityGroup))], self: [...new Set(activity.self.map(activityGroup))],
}));
export type ActivityPrerequisite = string | { all?: ActivityPrerequisite[]; any?: ActivityPrerequisite[]; not?: ActivityPrerequisite; subject?: string; check?: string; args?: (string | string[])[] };

function activityZoneCode(character: CharacterSummary, group: string): number {
  const id = (definitions.zones as Record<string, number>)[activityGroup(group)];
  return id === undefined ? NaN : (character.ArousalSettings?.Zone?.charCodeAt(id) ?? NaN) - 100;
}

/** Explicit refusals must take precedence over incomplete local data. */
function activityPreferenceReason(actor: CharacterSummary, target: CharacterSummary, group: string, id: number): string | null {
  const settings = target.ArousalSettings;
  const zone = activityZoneCode(target, group);
  if (settings?.Active === "Inactive" || (Number.isFinite(zone) && zone >= 0 && zone % 10 === 0)) return "native.permission";
  for (const [character, receiving] of [[actor, false], [target, true]] as const) {
    // BC permits missing activity preferences.
    const encoded = (character.ArousalSettings?.Activity?.charCodeAt(id) ?? NaN) - 100;
    if ((receiving ? encoded % 10 : Math.floor(encoded / 10)) === 0) return "native.permission";
  }
  if (!settings || !["NoMeter", "Manual", "Hybrid", "Automatic"].includes(settings.Active || "") || !Number.isFinite(zone)) return "native.preferences";
  return zone < 0 ? "native.permission" : null;
}

/** Incomplete local emulation is not an explicit refusal. Never relax known restrictions. */
export function activityAvailability(reason: string | null, compatibility: boolean) {
  if (compatibility && reason && ["native.equipment", "native.unsupported", "native.preferences"].includes(reason)) {
    return { reason: null, warning: reason };
  }
  return { reason, warning: "" };
}
type ItemRule = { Effect?: string[]; Block?: string[]; AllowActivityOn?: string[]; AllowActivity?: string[]; Expose?: string[]; SetPose?: string[]; AllowActivePose?: string[]; TypeRecord?: Record<string, unknown>; unknown?: boolean };
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

/** Resolve the actual worn item again at send time; never use an inventory-only item. */
export function activityAssets(actor: CharacterSummary, target: CharacterSummary, name: string, prerequisites?: ActivityPrerequisite[]) {
  const pre = (prerequisites ?? nativeActivities.find(activity => activity.name === name)?.prerequisites)?.find((pre): pre is string => typeof pre === "string" && /^(Target)?Needs-/.test(pre));
  if (!pre) return [];
  const acting = inventoryState(actor);
  const wearer = pre.startsWith("TargetNeeds-") ? inventoryState(target) : acting;
  return wearer.activityItems(pre.replace(/^(Target)?Needs-/, "")).filter(item => !acting.blocked(item.group))
    .map(item => ({ Tag: "ActivityAsset", AssetName: item.name, GroupName: item.group }));
}

/** Check known item effects; unknown assets never invalidate unrelated activities. */
export function createActivityInventoryCheck(actor: CharacterSummary, target: CharacterSummary, relaxActorRestraints = false) {
  const a = inventoryState(actor), b = inventoryState(target);
  const kneels = (_character: CharacterSummary, state: ReturnType<typeof inventoryState>) => state.effects.has("ForceKneel") || ["Kneel", "KneelingSpread"].includes(state.pose.BodyLower);
  return (group: string, prerequisites: ActivityPrerequisite[] = [], source: "BC" | "plugin" = "plugin"): string | null => {
  group = activityGroup(group);
  const code = activityZoneCode(target, group);
  if (Number.isFinite(code) && code >= 0 && code % 10 === 0) return "native.permission";
  if (actor.MemberNumber !== target.MemberNumber && ((!relaxActorRestraints && (a.effects.has("Enclose") || a.effects.has("OneWayEnclose"))) || b.effects.has("Enclose"))) return "native.blocked";
  const walk = !["Freeze", "Tethered", "Mounted"].some(effect => a.effects.has(effect));
  const hands = !a.effects.has("Block");
  const arms = hands || (!a.groups.has("ItemArms") && !a.blocked("ItemArms"));
  const gagged = [...a.effects].some(effect => /^Gag/.test(effect));
  const evaluate = (pre: ActivityPrerequisite): boolean | undefined => {
    if (typeof pre !== "string") {
      if (pre.not !== undefined) { const result = evaluate(pre.not); return result === undefined ? undefined : !result; }
      if (pre.all || pre.any) {
        const results = (pre.all ?? pre.any ?? []).map(evaluate);
        if (pre.all && results.includes(false)) return false;
        if (pre.any && results.includes(true)) return true;
        return results.includes(undefined) ? undefined : !!pre.all;
      }
      const state = pre.subject === "Acting" ? a : pre.subject === "Acted" ? b : null;
      if (!state) return undefined;
      const args = pre.args ?? [], list = (value: string | string[] | undefined) => value === undefined ? [] : Array.isArray(value) ? value : [value];
      switch (pre.check) {
        case "GroupIs": return state.hasItem(String(args[0]), list(args[1]));
        case "GroupEmpty": return list(args[0]).every(part => !state.hasItem(part));
        case "TargetGroupEmpty": return !state.hasItem(group);
        case "TargetGroupIs": return state.hasItem(group, list(args[0]));
        case "GroupAccessible": return !state.blocked(String(args[0]));
        case "PoseIs": return list(args[1]).includes(state.pose[String(args[0])]);
        case "PoseIsStanding": return ["BaseLower", "LegsClosed", "Spread"].includes(state.pose.BodyLower);
        case "PoseIsKneeling": return kneels(actor, state);
        case "PoseIsAllFours": return state.pose.BodyFull === "AllFours";
        case "PoseIsHogtied": return state.pose.BodyFull === "Hogtied";
        default: return undefined;
      }
    }
    // Lite's text-first actor is not physically immobilized. Keep actual state for
    // restraint-specific variants (CantUse*, IsGagged), tool needs and target access.
    if (relaxActorRestraints && ["UseMouth", "UseTongue", "UseHands", "UseArms", "UseFeet", "TargetZoneAccessible"].includes(pre)) return true;
    let allowed: boolean | undefined;
    switch (pre) {
      case "CanHeadbutt": allowed = !a.effects.has("FixedHead"); break;
      case "HasCrotchRope": allowed = b.effects.has("CrotchRope"); break;
      case "ItemHoodCovered": allowed = !a.hasItem("ItemHood"); break;
      case "TargetItemHoodCovered": allowed = !b.hasItem("ItemHood"); break;
      case "ItemNoseCovered": allowed = !a.hasItem("ItemNose"); break;
      case "CanLook": case "Luzi_NotBlind": allowed = ![...a.effects].some(effect => /^Blind/.test(effect)); break;
      case "Kneeling": case "Luzi_IsKneeling": allowed = kneels(actor, a); break;
      case "NotKneeling": allowed = !kneels(actor, a); break;
      case "Luzi_IsAllFours": allowed = a.pose.BodyFull === "AllFours"; break;
      case "Luzi_TargetAllFours": allowed = b.pose.BodyFull === "AllFours"; break;
      case "Luzi_KneelOrAllFours": allowed = kneels(actor, a) || a.pose.BodyFull === "AllFours"; break;
      case "Luzi_TargetKneelOrAllFours": allowed = kneels(target, b) || b.pose.BodyFull === "AllFours"; break;
      case "Luzi_IsStanding": allowed = ["BaseLower", "LegsClosed", "Spread"].includes(a.pose.BodyLower); break;
      case "Luzi_HasBreast": allowed = a.hasItem("BodyUpper", ["Small", "Normal", "Large", "XLarge"]); break;
      case "Luzi_TargetHasBreast": allowed = b.hasItem("BodyUpper", ["Small", "Normal", "Large", "XLarge"]); break;
      case "Luzi_HasKennel": allowed = b.hasItem("ItemDevices", ["Kennel"]); break;
      case "Luzi_TargetHasItemVulva": allowed = b.hasItem("ItemVulva"); break;
      case "Luzi_HasPetSuit": allowed = a.hasItem("ItemArms", ["ShinyPetSuit", "BitchSuit", "StrictLeatherPetCrawler", "乳胶宠物拘束服"])
        || (a.hasItem("ItemArms", ["宠物服上", "PawPaddedPetsuitArms", "StrappedPetsuitArms"]) && a.hasItem("ItemLegs", ["宠物服下", "PawPaddedPetsuitLegs", "StrappedPetsuitLegs"])); break;
      case "Luzi_Female": allowed = !a.hasItem("Pussy", ["Penis"]); break;
      case "Luzi_TargetFemale": allowed = !b.hasItem("Pussy", ["Penis"]); break;
      case "HasPenis": case "Luzi_HasPenis": allowed = a.hasItem("Pussy", ["Penis"]); break;
      case "TargetHasPenis": allowed = b.hasItem("Pussy", ["Penis"]); break;
      // BC's ActivityCheckPrerequisite leaves HasVagina to VulvaEmpty on the target;
      // plugin activities use it to require the acting character's anatomy.
      case "HasVagina": allowed = source === "BC" || a.hasItem("Pussy", ["Pussy1", "Pussy2", "Pussy3"]); break;
      case "CanUsePenis": allowed = !a.hasItem("Pussy", ["Penis"]) || a.exposed("ItemVulva"); break;
      case "VulvaEmpty": allowed = group !== "ItemVulva" || (b.hasItem("Pussy", ["Pussy1", "Pussy2", "Pussy3"]) && !b.effects.has("FillVulva")); break;
      case "UseMouth": allowed = !a.effects.has("BlockMouth") && !gagged; break;
      case "UseTongue": allowed = !a.effects.has("BlockMouth"); break;
      case "TargetMouthBlocked": allowed = b.effects.has("BlockMouth"); break;
      case "IsGagged": allowed = gagged; break;
      case "TargetKneeling": allowed = kneels(target, b); break;
      case "UseHands": allowed = hands && !a.effects.has("MergedFingers"); break;
      case "UseArms": allowed = arms; break;
      case "CantUseArms": allowed = !arms; break;
      case "UseFeet": case "UseLegs": case "Luzi_CanWalk": allowed = walk; break;
      case "CantUseFeet": allowed = !walk; break;
      case "TargetCanUseTongue": allowed = !b.effects.has("BlockMouth"); break;
      case "TargetMouthOpen": allowed = group !== "ItemMouth" || !b.groups.has("ItemMouth") || b.effects.has("OpenMouth"); break;
      case "MoveHead": allowed = group !== "ItemHead" || !b.effects.has("FixedHead"); break;
      case "AssEmpty": allowed = group !== "ItemButt" || !b.effects.has("IsPlugged"); break;
      case "ZoneAccessible": allowed = !b.zoneBlocked(group); break;
      case "TargetZoneAccessible": allowed = !a.zoneBlocked(group); break;
      case "ZoneNaked": allowed = b.naked(group); break;
      case "TargetZoneNaked": allowed = a.naked(group); break;
      case "Luzi_ActedZoneNaked": allowed = b.echoNaked(group); break;
      case "Luzi_PrivateExposed": allowed = a.exposed("ItemVulva"); break;
      case "Luzi_TargetPelvisExposed": allowed = b.pelvisExposed(); break;
      case "Luzi_Has鱼鱼尾": allowed = a.hasItem("动物身体_Luzi", ["鱼鱼尾"]); break;
      case "Luzi_TargetHasItemVulvaPiercings": allowed = b.hasItem("ItemVulvaPiercings", ["StraightClitPiercing", "RoundClitPiercing", "BarbellClitPiercing", "ChastityClitPiercing", "JewelClitPiercing", "AdornedClitPiercing", "VibeHeartClitPiercing", "ClitRing"]); break;
      case "Luzi_HasSword": {
        const item = a.item("ItemHandheld"), type = item?.property?.TypeRecord;
        allowed = !!item && (["Sword", "分层剑"].includes(item.name) || (item.name === "武器组合" && type?.t === 1 && type?.s === 1) || (item.name === "刀" && type?.A === 1)); break;
      }
      case "CanHighFive": allowed = !b.effects.has("Block") && !b.effects.has("MergedFingers"); break;
      case "CanCustomFlick": allowed = group === "ItemBoots" ? b.naked(group) : ["ItemVulva", "ItemVulvaPiercings"].includes(group) ? b.crotchAccessible() && !b.effects.has("Chaste") : true; break;
      case "CanGrindWithPussy": allowed = group === "ItemVulva" && b.hasItem("Pussy", ["Penis"]) ? !a.effects.has("FillVulva") : kneels(target, b) || ["Hogtied", "AllFours"].includes(b.pose.BodyFull); break;
      case "SourceAssEmpty": allowed = a.exposed("ItemButt") && !(a.effects.has("IsPlugged") || (a.effects.has("ButtChaste") && !a.blocked("ItemButt", true))); break;
      case "Sisters": case "Brothers": case "SiblingsWithDifferentGender": {
        const owner = actor.Ownership, other = target.Ownership;
        const siblings = owner?.Stage === 1 && other?.Stage === 1 && typeof owner.MemberNumber === "number" && owner.MemberNumber === other.MemberNumber;
        const first = a.hasItem("Pussy", ["Penis"]), second = b.hasItem("Pussy", ["Penis"]);
        allowed = siblings && (pre === "Sisters" ? !first && !second : pre === "Brothers" ? first && second : first !== second); break;
      }
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
        if (pre.startsWith("Needs-")) allowed = a.activityItems(pre.slice(6)).some(item => !a.blocked(item.group));
        else if (pre.startsWith("TargetNeeds-")) allowed = b.activityItems(pre.slice(12)).some(item => !a.blocked(item.group));
    }
    return allowed;
  };
  const results = prerequisites.map(evaluate);
  return results.includes(false) ? "native.blocked" : results.includes(undefined) ? "native.unsupported" : null;
  };
}
export function activityReason(actor: CharacterSummary, target: CharacterSummary, group: string, name: string, room: { BlockCategory?: string[]; MapType?: string }, checkInventory = createActivityInventoryCheck(actor, target)): string | null {
  const activity = nativeActivities.find(value => value.name === name);
  const self = actor.MemberNumber === target.MemberNumber;
  if (room.BlockCategory !== undefined && !Array.isArray(room.BlockCategory)) return "native.room";
  if (!activity || !(self ? activity.self : activity.target).includes(group)) return "native.target";
  if (room.BlockCategory?.includes("Arousal") || (room.MapType && room.MapType !== "Never")) return "native.room";
  // Check explicit refusals before limitations, so compatibility mode cannot bypass them.
  const preferenceReason = activityPreferenceReason(actor, target, group, activity.id);
  if (preferenceReason === "native.permission") return preferenceReason;
  // CharacterLoadOnline creates Female3DCG characters; raw online bundles omit this field.
  if ((actor.AssetFamily ?? "Female3DCG") !== "Female3DCG" || (target.AssetFamily ?? "Female3DCG") !== "Female3DCG") return "native.data";
  if (![actor, target].every(character => Array.isArray(character.Appearance) && character.Appearance.length)) return "native.data";
  const inventoryReason = checkInventory(group, activity.prerequisites, "BC");
  if (inventoryReason) return inventoryReason;
  // Local expression/arousal effects are execution limitations, not eligibility conditions.
  return preferenceReason;
}
