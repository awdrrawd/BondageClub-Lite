import type { BcLiteClient } from "../network/client";

/** The bridge uses only these operations; no raw socket or appearance writes. */
export type ExtensionClient = Pick<BcLiteClient,
  "subscribe" | "subscribeMessages" | "sendChat" | "sendBeep" | "activityOptions" | "sendActivity">;

export type MessageKind = "chat" | "whisper" | "emote" | "action" | "activity" |
  "presence" | "beep" | "server" | "local" | "unknown";

export type PluginMessage = Readonly<{
  id: string;
  kind: MessageKind;
  type: string;
  text: string;
  sender: number | null;
  target: number | null;
  self: boolean;
  room: string | null;
  timestamp: number;
  key: string | null;
}>;

export interface PluginOptions {
  allowSend?: boolean;
  privateMessages?: boolean;
}
