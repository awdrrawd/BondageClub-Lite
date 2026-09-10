import type { RoomSearchResult } from "../shared/types";

export type RoomSort = "friends" | "name" | "count";
export function canJoinRoom(room: RoomSearchResult): boolean {
  return room.CanJoin && room.MemberCount < room.MemberLimit;
}
export function sortRooms(rooms: readonly RoomSearchResult[], sort: RoomSort, locale: string): RoomSearchResult[] {
  const names = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return [...rooms].sort((a, b) => {
    const availability = Number(!canJoinRoom(a)) - Number(!canJoinRoom(b));
    if (availability) return availability;
    if (sort === "friends") {
      const friends = (b.Friends?.length || 0) - (a.Friends?.length || 0);
      if (friends) return friends;
    }
    if (sort === "count" && a.MemberCount !== b.MemberCount) return b.MemberCount - a.MemberCount;
    return names.compare(a.Name, b.Name);
  });
}
