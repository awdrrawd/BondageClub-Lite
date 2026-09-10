import definitions from "./native-data.json";
import type { CharacterSummary } from "../shared/types";
export const nativeActivities = definitions.activities;
export function activityReason(actor: CharacterSummary, target: CharacterSummary, group: string, name: string, room: { BlockCategory?: string[]; MapType?: string }): string | null {
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
  // No guessed inventory capabilities: equipment, plugin bodies and mirrored zones need the full engine.
  const body = new Set(["BodyUpper", "BodyLower", "Height", "Eyes", "Eyes2", "Eyebrows", "Mouth", "Blush", "Fluids", "Emoticon", "HairFront", "HairBack"]);
  for (const character of [actor, target]) {
    if (!Array.isArray(character.Appearance) || !character.Appearance.length) return "native.data";
    for (const raw of character.Appearance) {
      const item = raw as { Group?: string; Name?: string; Property?: unknown };
      if (!item || !item.Group || !body.has(item.Group) || !item.Name || !(definitions.bodies as Record<string, string[]>)[item.Group]?.includes(item.Name) || item.Property) return "native.equipment";
    }
  }
  if (activity.special || activity.prerequisites.some(pre => !["UseMouth", "UseTongue", "UseHands", "UseArms", "UseFeet", "MoveHead"].includes(pre))) return "native.unsupported";
  if (actor.ActivePose?.length || target.ActivePose?.length) return "native.equipment";
  // Automatic actor arousal, expression timers and punishment caches are not emulated.
  if (actor.ArousalSettings?.Active !== "Manual") return "native.actor";
  const settings = target.ArousalSettings;
  const zoneId = (definitions.zones as Record<string, number>)[group];
  if (!settings || !["Manual", "Hybrid", "Automatic"].includes(settings.Active || "") || typeof settings.Zone !== "string" || zoneId === undefined || settings.Zone.length <= zoneId) return "native.data";
  const zone = settings.Zone.charCodeAt(zoneId) - 100;
  if (zone < 0 || zone % 10 === 0) return "native.permission";
  for (const [character, receiving] of [[actor, false], [target, true]] as const) {
    if (typeof character.ArousalSettings?.Activity !== "string") return "native.data";
    const encoded = character.ArousalSettings.Activity.charCodeAt(activity.id) - 100;
    const value = receiving ? encoded % 10 : Math.floor(encoded / 10);
    if (value === 0) return "native.permission";
  }
  return null;
}
