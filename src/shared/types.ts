export type ConnectionPhase =
  | "idle"
  | "connecting"
  | "authenticating"
  | "waiting-server"
  | "ready"
  | "joining"
  | "in-room"
  | "reconnecting"
  | "error";

export interface PlayerSummary extends CharacterSummary {
  GameplaySettings?: { EnableSafeword?: boolean };
  AllowedInteractions?: number;
  AssetFamily?: string;
  FriendList?: number[];
  /** Opaque server bundles: never rebuild with an incomplete asset registry. */
  Appearance?: unknown[];
  OnlineSharedSettings?: Record<string, unknown>;
  Environment?: string;
  AccountName: string;
  ID: string;
  MemberNumber: number;
  Name: string;
  Nickname?: string;
}

export interface CharacterSummary {
  OnlineSharedSettings?: Record<string, unknown>;
  Appearance?: unknown[];
  ActivePose?: string[] | null;
  Owner?: string;
  Ownership?: { Name?: string; MemberNumber?: number; Stage?: number };
  Lovership?: Array<{ Name?: string; MemberNumber?: number; Stage?: number }>;
  Description?: string;
  ID?: string;
  MemberNumber: number;
  Name: string;
  Nickname?: string;
}

export interface RoomSearchRequest {
  Query: string;
  Language: "" | "EN" | "DE" | "FR" | "ES" | "CN" | "RU" | "UA";
  Space: "" | "X" | "M" | "Asylum";
  Game: "";
  FullRooms: boolean;
  ShowLocked: boolean;
  SearchDescs: boolean;
}

export interface RoomSearchResult {
  Game?: string;
  Name: string;
  Language: string;
  Creator: string;
  CreatorMemberNumber: number;
  MemberCount: number;
  MemberLimit: number;
  Description: string;
  Friends?: Array<{ MemberNumber: number }>;
  Space: string;
  Visibility?: string[];
  Access?: string[];
  CanJoin: boolean;
  MapType?: string;
}

export interface RoomCreateOptions {
  Background?: string;
  Admin?: number[];
  Whitelist?: number[];
  Ban?: number[];
  Game?: string;
  Visibility?: string[];
  Access?: string[];
  BlockCategory?: string[];
  Custom?: { ImageURL?: string; MusicURL?: string; ImageFilter?: string; SizeMode?: number };
  MapData?: { Type: "Never" | "Hybrid" | "Always"; Fog?: boolean; Tiles?: string; Objects?: string; Effects?: string };
}

export interface RoomSync {
  Game?: string;
  Space?: string;
  Name: string;
  Description: string;
  Language: string;
  Limit: number;
  Character: CharacterSummary[];
  SourceMemberNumber: number;
}

export interface DictionaryEntry {
  Tag?: string;
  Text?: string;
  MemberNumber?: number;
  CharacterName?: string;
  Name?: string;
  AssetName?: string;
  AssetGroupName?: string;
  [key: string]: unknown;
}

export type ChatMessageType = "Action" | "Chat" | "Whisper" | "Emote" | "Activity" | "Hidden" | "ServerMessage" | "Status";

export interface ChatMessage {
  Sender?: number;
  Target?: number;
  Content: string;
  Type: ChatMessageType;
  Dictionary?: DictionaryEntry[];
}

export interface DisplayMessage {
  replyId?: string;
  nativeId?: string;
  target?: number;
  translation?: { content: string; dictionary: DictionaryEntry[] };
  id: string;
  sender: number | null;
  senderName: string;
  targetName?: string;
  text: string;
  type: Exclude<ChatMessageType, "Hidden" | "Status"> | "Local";
  time: Date;
}

export interface ClientSnapshot {
  whispers?: DisplayMessage[];
  summon?: { sender: number; room: string; space: string; expires: number } | null;
  loverRooms?: Record<number, { name: string; space: string }>;
  friendsQueryState: "idle" | "loading" | "ready" | "error";
  friends: OnlineFriend[];
  friendsStatus: string;
  beeps: BeepMessage[];
  onlinePlayers?: number;
  phase: ConnectionPhase;
  status: string;
  player: PlayerSummary | null;
  rooms: RoomSearchResult[];
  room: RoomSync | null;
  characters: CharacterSummary[];
  messages: DisplayMessage[];
}

export interface OnlineFriend {
  MemberNumber: number;
  MemberName: string;
  Type: string;
  ChatRoomName?: string | null;
  ChatRoomSpace?: string | null;
  ChatRoomMemberCount?: number;
  ChatRoomLimit?: number;
  Private?: boolean;
}

export interface BeepMessage {
  id: string;
  memberNumber: number;
  name: string;
  text: string;
  incoming: boolean;
  time: Date;
}
