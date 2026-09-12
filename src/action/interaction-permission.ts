import type { ClientSnapshot } from "../shared/types";

// Conservative subset of ServerChatRoomGetAllowItem. Restricted relationship
// rules require more authoritative data than Lite currently retains.
export function interactionPermission(state: Readonly<ClientSnapshot> | undefined, targetId: number) {
  if (!state?.player || state.phase !== "in-room" || !state.room) return "not-in-room";
  const target = state.characters.find(c => c.MemberNumber === targetId);
  if (!target) return "target-missing";
  if (targetId === state.player.MemberNumber || (target.AllowedInteractions ?? target.ItemPermission) === 0) return null;
  return (target.AllowedInteractions ?? target.ItemPermission) === undefined ? "permission-unknown" : "restricted-permission";
}

