import definitions from "./native-data.json";
import { appearanceState } from "./appearance-state";
import { activityItemPermission } from "./interaction-permission";
import type { CharacterSummary } from "../shared/types";
const activityGroup = (group: string) => (definitions.mirrors as Record<string, string>)[group] ?? group;
export const nativeActivities = definitions.activities.map(activity => ({ ...activity,
  target: [...new Set(activity.target.map(activityGroup))], self: [...new Set(activity.self.map(activityGroup))],
}));
export type ActivityPrerequisite = string | { all?: ActivityPrerequisite[]; any?: ActivityPrerequisite[]; not?: ActivityPrerequisite; subject?: string; check?: string; args?: (string | string[])[] };

function activityZoneCode(character: CharacterSummary, group: string): number {
  const id = (definitions.zones as Record<string, number>)[activityGroup(group)];
  const zone = character.ArousalSettings?.Zone;
  return id === undefined || typeof zone !== "string" ? NaN : zone.charCodeAt(id) - 100;
}

/** Explicit refusals must take precedence over incomplete local data. */
function activityPreferenceReason(actor: CharacterSummary, target: CharacterSummary, id: number): string | null {
  for (const [character, receiving] of [[actor, false], [target, true]] as const) {
    // BC permits missing activity preferences.
    const activity = character.ArousalSettings?.Activity;
    if (activity != null && typeof activity !== "string") return "native.preferences";
    const encoded = (activity?.charCodeAt(id) ?? NaN) - 100;
    if ((receiving ? encoded % 10 : Math.floor(encoded / 10)) === 0) return "native.permission";
  }
  return null;
}

/** Shared target/room gates for native and plugin activities, independent of prerequisites. */
export function activityTargetReason(actor: CharacterSummary, target: CharacterSummary, group: string, room: { BlockCategory?: string[]; MapType?: string }): string | null {
  if (room.BlockCategory !== undefined && !Array.isArray(room.BlockCategory)) return "native.room";
  if (room.BlockCategory?.includes("Arousal") || (room.MapType && room.MapType !== "Never")) return "native.room";
  const settings = target.ArousalSettings, zone = activityZoneCode(target, group);
  if (settings?.Active === "Inactive" || (Number.isFinite(zone) && (zone < 0 || zone % 10 === 0))) return "native.permission";
  if (![actor, target].every(character => (character.AssetFamily ?? "Female3DCG") === "Female3DCG" && Array.isArray(character.Appearance) && character.Appearance.length)) return "native.data";
  if (!settings || !["NoMeter", "Manual", "Hybrid", "Automatic"].includes(settings.Active || "") || !Number.isFinite(zone)) return "native.preferences";
  return null;
}

/** One read-only snapshot per actor/target pair, shared by eligibility and tool selection. */
export function createActivityContext(actor: CharacterSummary, target: CharacterSummary) {
  const a = appearanceState(actor), b = actor === target ? a : appearanceState(target);
  const tools = (pre: string) => (pre.startsWith("TargetNeeds-") ? b : a).activityItems(pre.replace(/^(Target)?Needs-/, ""))
    .map(item => ({ item, reason: activityItemPermission(actor, target, item.group, item.name, item.property?.TypeRecord) || (a.blocked(item.group) ? "native.blocked" : null) }));
  const assets = (name: string, prerequisites?: ActivityPrerequisite[]) => {
    const pre = (prerequisites ?? nativeActivities.find(activity => activity.name === name)?.prerequisites)?.find((pre): pre is string => typeof pre === "string" && /^(Target)?Needs-/.test(pre));
    return pre ? tools(pre).map(({ item, reason }) => ({ asset: { Tag: "ActivityAsset", AssetName: item.name, GroupName: item.group }, reason })) : [];
  };
  const kneels = (state: ReturnType<typeof appearanceState>) => ["Kneel", "KneelingSpread"].includes(state.pose.BodyLower);
  const checkInventory = (group: string, prerequisites: ActivityPrerequisite[] = [], source: "BC" | "plugin" = "plugin"): string | null => {
  group = activityGroup(group);
  const code = activityZoneCode(target, group);
  if (Number.isFinite(code) && code >= 0 && code % 10 === 0) return "native.permission";
  if (actor.MemberNumber !== target.MemberNumber && (a.effects.has("Enclose") || a.effects.has("OneWayEnclose") || b.effects.has("Enclose"))) return "native.blocked";
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
        case "PoseIsKneeling": return kneels(state);
        case "PoseIsAllFours": return state.pose.BodyFull === "AllFours";
        case "PoseIsHogtied": return state.pose.BodyFull === "Hogtied";
        default: return undefined;
      }
    }
    let allowed: boolean | undefined;
    switch (pre) {
      case "CanHeadbutt": allowed = !a.effects.has("FixedHead"); break;
      case "HasCrotchRope": allowed = b.effects.has("CrotchRope"); break;
      case "ItemHoodCovered": allowed = !a.hasItem("ItemHood"); break;
      case "TargetItemHoodCovered": allowed = !b.hasItem("ItemHood"); break;
      case "ItemNoseCovered": allowed = !a.hasItem("ItemNose"); break;
      case "CanLook": case "Luzi_NotBlind": allowed = ![...a.effects].some(effect => /^Blind/.test(effect)); break;
      case "Kneeling": case "Luzi_IsKneeling": allowed = kneels(a); break;
      case "NotKneeling": allowed = !kneels(a); break;
      case "Luzi_IsAllFours": allowed = a.pose.BodyFull === "AllFours"; break;
      case "Luzi_TargetAllFours": allowed = b.pose.BodyFull === "AllFours"; break;
      case "Luzi_KneelOrAllFours": allowed = kneels(a) || a.pose.BodyFull === "AllFours"; break;
      case "Luzi_TargetKneelOrAllFours": allowed = kneels(b) || b.pose.BodyFull === "AllFours"; break;
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
      case "TargetKneeling": allowed = kneels(b); break;
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
      case "CanGrindWithPussy": allowed = group === "ItemVulva" && b.hasItem("Pussy", ["Penis"]) ? !a.effects.has("FillVulva") : kneels(b) || ["Hogtied", "AllFours"].includes(b.pose.BodyFull); break;
      case "SourceAssEmpty": allowed = a.exposed("ItemButt") && !(a.effects.has("IsPlugged") || (a.effects.has("ButtChaste") && !a.blocked("ItemButt", true))); break;
      case "Sisters": case "Brothers": case "SiblingsWithDifferentGender": {
        const owner = actor.Ownership, other = target.Ownership;
        const siblings = typeof owner?.MemberNumber === "number" && owner.MemberNumber > 0 && owner.MemberNumber === other?.MemberNumber;
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
        if (/^(Target)?Needs-/.test(pre)) allowed = tools(pre).some(candidate => !candidate.reason);
    }
    return allowed;
  };
  const results = prerequisites.map(evaluate);
  return results.includes(false) ? "native.blocked" : results.includes(undefined) ? "native.unsupported" : null;
  };
  return { checkInventory, assets };
}
export function activityReason(actor: CharacterSummary, target: CharacterSummary, group: string, name: string, room: { BlockCategory?: string[]; MapType?: string }, checkInventory = createActivityContext(actor, target).checkInventory): string | null {
  const activity = nativeActivities.find(value => value.name === name);
  const self = actor.MemberNumber === target.MemberNumber;
  if (!activity || !(self ? activity.self : activity.target).includes(group)) return "native.target";
  const targetReason = activityTargetReason(actor, target, group, room);
  if (targetReason === "native.room" || targetReason === "native.permission") return targetReason;
  // Report explicit refusals before incomplete-data limitations.
  const preferenceReason = activityPreferenceReason(actor, target, activity.id);
  if (preferenceReason === "native.permission") return preferenceReason;
  if (targetReason === "native.data") return targetReason;
  const inventoryReason = checkInventory(group, activity.prerequisites, "BC");
  if (inventoryReason) return inventoryReason;
  // Local expression/arousal effects are execution limitations, not eligibility conditions.
  return targetReason || preferenceReason;
}
