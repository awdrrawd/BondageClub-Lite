import type { CharacterSummary } from "../shared/types";
const partAliases: Record<string, string> = {
  ItemMouth2: "ItemMouth", ItemMouth3: "ItemMouth", ItemTorso2: "ItemTorso",
  ItemNipplesPiercings: "ItemNipples", ItemNeckAccessories: "ItemNeck", ItemNeckRestraints: "ItemNeck", ItemHandheld: "ItemHands",
};
export function canonicalPartGroup(group: string): string { return partAliases[group] || group; }
export function hasPenis(character: CharacterSummary): boolean {
  return Boolean(character.Appearance?.some(raw => { const item = raw as { Group?: string; Name?: string; Asset?: { Name?: string; Group?: { Name?: string } } }; return (item?.Asset?.Group?.Name ?? item?.Group) === "Pussy" && (item?.Asset?.Name ?? item?.Name) === "Penis"; }));
}
export function physicalGroup(group: string): string { return group === "ItemPenis" ? "ItemVulva" : group === "ItemGlans" ? "ItemVulvaPiercings" : group; }
export function textGroup(group: string, character: CharacterSummary): string {
  return hasPenis(character) ? group === "ItemVulva" ? "ItemPenis" : group === "ItemVulvaPiercings" ? "ItemGlans" : group : group;
}
export function activityLabel(name: string, group: string, character: CharacterSummary, self: boolean, catalog: Record<string, string>): string {
  const groups = [...new Set([textGroup(group, character), group, canonicalPartGroup(group)])];
  const modes = self ? ["Self", "Other"] : ["Other", "Self"];
  const keys = groups.flatMap(candidate => modes.map(mode => `Label-Chat${mode}-${candidate}-${name}`));
  keys.push(`Label-Activity-${name}`);
  for (const key of keys) {
    const value = catalog[key];
    if (value && !/MISSING TEXT|MISSING ACTIVITY|STRING_RETRIEVAL_FAILED/.test(value)) return value;
  }
  return name.replace(/^(XSAct_|LSCG_)/, "");
}
