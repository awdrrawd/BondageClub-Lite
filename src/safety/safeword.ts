import { isDecorativePluginItem } from './plugin-appearance';
/** Native Category=Item groups from BC Assets/Female3DCG/Female3DCG.js.
 * Never infer categories from prefixes: unknown plugin groups remain untouched.
 */
const ITEM_GROUPS = new Set(["ItemFeet", "ItemLegs", "ItemVulva", "ItemVulvaPiercings", "ItemButt", "ItemPelvis", "ItemTorso", "ItemTorso2", "ItemNipples", "ItemNipplesPiercings", "ItemBreast", "ItemArms", "ItemHands", "ItemHandheld", "ItemNeck", "ItemNeckAccessories", "ItemNeckRestraints", "ItemMouth", "ItemMouth2", "ItemMouth3", "ItemHead", "ItemNose", "ItemHood", "ItemEars", "ItemMisc", "ItemDevices", "ItemAddon", "ItemBoots"]);
export type BundledItem = { Group: string; Name: string; Property?: { Effect?: unknown[]; [key: string]: unknown }; [key: string]: unknown };
export function validAppearance(value: unknown): value is BundledItem[] {
  return Array.isArray(value) && value.every(item => item && typeof item === "object" && typeof item.Group === "string" && typeof item.Name === "string") && new Set(value.map(item => item.Group)).size === value.length;
}
export function copyAppearance(items: BundledItem[]): BundledItem[] { return JSON.parse(JSON.stringify(items)); }
export function releaseAppearance(items: BundledItem[], owned: boolean): BundledItem[] {
  return copyAppearance(items).filter(item => {
    // SCA can occupy native Item* slots without being a restraint. AEE drawing
    // payloads and companion layers also stay opaque, including compressed data.
    if (isDecorativePluginItem(item)) return true;
    if (item.Group === "ItemNeck" && item.Name === "SlaveCollar" && owned) {
      // CharacterReleaseTotal keeps an owned collar, removing its gameplay variant.
      if (Array.isArray(item.Property?.Effect) && item.Property.Effect.length) item.Property = { TypeRecord: { noarch: 0 } };
      return true;
    }
    return !ITEM_GROUPS.has(item.Group);
  });
}
