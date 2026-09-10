import entries from "./extension-data.json";
import { renderAction } from "./render";
import { textGroup } from "./labels";
import type { CharacterSummary } from "../shared/types";

// Text registry. Cuddle's explicitly confirmed item/state writes live in the network adapter.
export const extensionActivities = entries;
export function extensionText(key: string, group: string, actor: CharacterSummary, target: CharacterSummary, catalog: Record<string, string>): string {
  const mapped = key.replace(`-${group}-`, `-${textGroup(group, target)}-`);
  if (Object.hasOwn(catalog, mapped)) key = mapped;
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
