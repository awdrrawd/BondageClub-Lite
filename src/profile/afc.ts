import type { CharacterSummary } from "../shared/types";
export interface AFCLover { memberNumber: number; name: string; stage?: number }
/** Read shared AFC data only. No migration, saving or relation writes. */
export function afcLovers(character: CharacterSummary | null | undefined): AFCLover[] {
  const afc = character?.OnlineSharedSettings?.AFC as { lovers?: unknown } | undefined;
  if (!Array.isArray(afc?.lovers)) return [];
  return afc.lovers.filter((value): value is AFCLover => value && typeof value === "object" && Number.isSafeInteger(value.memberNumber) && value.memberNumber > 0 && typeof value.name === "string").slice(0, 200);
}
