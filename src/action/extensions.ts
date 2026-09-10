import entries from "./extension-data.json";
import { renderAction } from "./render";
import type { CharacterSummary } from "../shared/types";

// Dialogue-only registry. Never invoke plugin hooks or synthesize appearance/pairing data.
export const extensionActivities = entries;
export function extensionText(key: string, group: string, actor: CharacterSummary, target: CharacterSummary, catalog: Record<string, string>): string {
  if (!Object.hasOwn(catalog, key)) throw new Error("Missing activity translation");
  const name = (character: CharacterSummary) => character.Nickname || character.Name;
  return renderAction(key, "Action", [
    { Tag: "SourceCharacter", Text: name(actor) },
    { Tag: "DestinationCharacter", Text: name(target) },
    { Tag: "TargetCharacter", Text: name(target) },
    { Tag: "PronounPossessive", Text: name(actor) },
    { FocusGroupName: group },
  ], catalog);
}
