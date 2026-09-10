import { validAppearance } from "../safety/safeword";
import type { CharacterSummary } from "../shared/types";
export const cuddleNames = ["钻进怀里", "抱入怀中"];
export function cuddleReason(self: CharacterSummary, peer: CharacterSummary, receiving = false): string | null {
  if (self.MemberNumber === peer.MemberNumber || !validAppearance(self.Appearance) || !self.Appearance.length || !validAppearance(peer.Appearance) || !peer.Appearance.length) return "native.data";
  if (self.Appearance.some(item => item.Group === "ItemMisc") || peer.Appearance.some(item => item.Group === "ItemMisc" && !(receiving && item.Name === "贴贴"))) return "cuddle.occupied";
  // Avoid claiming full movement validation without the inventory engine.
  if (self.Appearance.some(item => ["ItemFeet", "ItemLegs", "ItemDevices"].includes(item.Group)) || self.ActivePose?.length) return "cuddle.movement";
  return null;
}
export function cuddleState(name: string, peer: number, receiving = false) {
  if (!cuddleNames.includes(name)) throw new Error("Invalid cuddle activity");
  const lead = (name === "钻进怀里") !== receiving;
  return { ...(lead ? { prevCharacter: peer } : { nextCharacter: peer }), associatedAsset: { group: "ItemMisc", asset: "贴贴" }, leash: lead ? "lead" : "follow" };
}
