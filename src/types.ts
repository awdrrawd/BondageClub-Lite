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

export interface PlayerSummary {
  AccountName: string;
  ID: string;
  MemberNumber: number;
  Name: string;
  Nickname?: string;
}

export interface CharacterSummary {
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

export interface RoomSync {
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
  id: string;
  sender: number | null;
  senderName: string;
  targetName?: string;
  text: string;
  type: Exclude<ChatMessageType, "Hidden"> | "Local";
  time: Date;
}

export interface ClientSnapshot {
  phase: ConnectionPhase;
  status: string;
  player: PlayerSummary | null;
  rooms: RoomSearchResult[];
  room: RoomSync | null;
  characters: CharacterSummary[];
  messages: DisplayMessage[];
}
