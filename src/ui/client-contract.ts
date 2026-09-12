import type { BcLiteClient } from "../network/client";

// Type-only UI surface shared by the real client and offline preview.
export type UiClient = Pick<BcLiteClient, "restoreMessages" | "recordLifecycle" | "resumeConnection" | "setMessageLimit" | "subscribe" | "setTextCatalog" | "relocalize" | "disconnect" | "refreshFriends" | "setFriend" | "sendChat" | "sendBeep" | "requestLoverRoom" | "connectionDiagnostics" | "acceptSummon" | "dismissSummon" | "configureSummons" | "search" | "leave" | "join" | "login" | "createRoom" | "clearMessages" | "respondCuddle" | "cuddleInfo" | "activateSafeword" | "activityOptions" | "sendActivity">;
