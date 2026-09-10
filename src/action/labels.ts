import type { CharacterSummary } from "../shared/types";
export function hasPenis(character: CharacterSummary): boolean {
  return Boolean(character.Appearance?.some(raw => { const item = raw as { Group?: string; Name?: string }; return item?.Group === "Pussy" && item.Name === "Penis"; }));
}
export function physicalGroup(group: string): string { return group === "ItemPenis" ? "ItemVulva" : group === "ItemGlans" ? "ItemVulvaPiercings" : group; }
export function textGroup(group: string, character: CharacterSummary): string {
  return hasPenis(character) ? group === "ItemVulva" ? "ItemPenis" : group === "ItemVulvaPiercings" ? "ItemGlans" : group : group;
}
export function activityLabel(name: string, group: string, character: CharacterSummary, self: boolean, catalog: Record<string, string>): string {
  const aliases: Record<string, string> = { ItemMouth2: "ItemMouth", ItemMouth3: "ItemMouth" };
  for (const candidate of new Set([textGroup(group, character), group, aliases[group]].filter(Boolean))) {
    for (const mode of self ? ["Self", "Other"] : ["Other", "Self"]) {
      const value = catalog[`Label-Chat${mode}-${candidate}-${name}`];
      if (value && !/MISSING TEXT|MISSING ACTIVITY|STRING_RETRIEVAL_FAILED/.test(value)) return value;
    }
  }
  return name.replace(/^(XSAct_|LSCG_)/, "");
}
