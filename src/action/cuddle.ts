import { validAppearance, type BundledItem } from "../safety/safeword";
import type { CharacterSummary } from "../shared/types";
export const cuddleNames = ["钻进怀里", "抱入怀中"];
/** Minimal built-in asset registration for the bundle-only client. No ECHO runtime or textures. */
export const cuddleAsset = Object.freeze({ Group: "ItemMisc", Name: "贴贴" });
export function createCuddleItem(): BundledItem {
  return { ...cuddleAsset, Color: "Default", Difficulty: 0 };
}
export function cuddleReason(self: CharacterSummary, peer: CharacterSummary): string | null {
  if (self.MemberNumber === peer.MemberNumber || !validAppearance(self.Appearance) || !self.Appearance.length || !validAppearance(peer.Appearance) || !peer.Appearance.length) return "native.data";
  // Occupancy is a consent decision, not activity eligibility. Each client changes only its own slot.
  return null;
}
export function cuddleState(name: string, peer: number, receiving = false) {
  if (!cuddleNames.includes(name)) throw new Error("Invalid cuddle activity");
  const lead = (name === "钻进怀里") !== receiving;
  return { ...(lead ? { prevCharacter: peer } : { nextCharacter: peer }), associatedAsset: { group: cuddleAsset.Group, asset: cuddleAsset.Name }, leash: lead ? "lead" : "follow" };
}
