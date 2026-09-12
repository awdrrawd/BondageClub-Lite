import type { BcLiteClient } from "../network/client";
import type { ClientSnapshot, DisplayMessage } from "../shared/types";

export function classifyMessage(message: DisplayMessage) {
  if (message.presence) return "presence";
  const types = { Chat: "chat", Whisper: "whisper", Emote: "emote", Action: "action", Activity: "activity", ServerMessage: "server", Local: "local", Beep: "beep" } as const;
  return types[message.type] ?? "unknown";
}

// Conservative subset of ServerChatRoomGetAllowItem. Restricted relationship
// rules require more authoritative data than Lite currently retains.
export function interactionPermission(state: Readonly<ClientSnapshot> | undefined, targetId: number) {
  if (!state?.player || state.phase !== "in-room" || !state.room) return "not-in-room";
  const target = state.characters.find(c => c.MemberNumber === targetId);
  if (!target) return "target-missing";
  if (targetId === state.player.MemberNumber || target.AllowedInteractions === 0) return null;
  return target.AllowedInteractions === undefined ? "permission-unknown" : "restricted-permission";
}

export function createExtensionAPI(client: Pick<BcLiteClient, "subscribe" | "subscribeMessages" | "sendChat" | "sendBeep" | "activityOptions" | "sendActivity">) {
  let state: Readonly<ClientSnapshot>;
  client.subscribe(value => { state = value; });
  const plugins = new Set<string>();
  return Object.freeze({
    client: "Lite", apiVersion: 1,
    capabilities: Object.freeze({ messages: true, chat: true, beep: true, nativeActivities: true, inventory: false, roomAdmin: false, musicControl: false, map: false, modSdkCompatible: false }),
    registerPlugin(id: string, options: { allowSend?: boolean; privateMessages?: boolean } = {}) {
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id) || plugins.has(id)) throw new Error("Invalid or duplicate plugin id");
      plugins.add(id);
      const allowSend = options.allowSend === true, privateMessages = options.privateMessages === true;
      const subscriptions = new Set<() => void>();
      let disposed = false, lastSend = 0;
      const alive = () => { if (disposed) throw new Error("Plugin disposed"); };
      const sending = () => {
        alive();
        if (!allowSend) throw new Error("Sending not enabled for this plugin");
        if (Date.now() - lastSend < 1500) throw new Error("Plugin rate limit: 1500ms");
        lastSend = Date.now();
      };
      const permission = (target: number) => {
        const reason = interactionPermission(state, target);
        if (reason) throw new Error(reason);
      };
      return Object.freeze({
        getState() {
          alive();
          return { phase: state.phase, self: state.player?.MemberNumber ?? null, room: state.room?.Name ?? null,
            members: state.characters.map(c => ({ memberNumber: c.MemberNumber, name: c.Nickname || c.Name })) };
        },
        onMessage(callback: (event: Readonly<{ id: string; kind: string; type: string; text: string; sender: number | null; target: number | null; self: boolean; room: string | null; timestamp: number; key: string | null }>) => unknown) {
          alive();
          if (typeof callback !== "function") throw new Error("Callback required");
          const off = client.subscribeMessages(message => {
            if (!privateMessages && ["Whisper", "Beep"].includes(message.type)) return;
            const event = Object.freeze({ id: message.id, kind: classifyMessage(message), type: message.type, text: message.text,
              sender: message.sender, target: message.target ?? null, self: message.sender === state.player?.MemberNumber,
              room: message.roomName ?? null, timestamp: message.time.getTime(), key: message.translation?.content ?? null });
            try { void Promise.resolve(callback(event)).catch(() => console.warn(`BCLite plugin ${id}: message callback failed`)); }
            catch { console.warn(`BCLite plugin ${id}: message callback failed`); }
          });
          const remove = () => { off(); subscriptions.delete(remove); };
          subscriptions.add(remove);
          return remove;
        },
        sendChat(text: string) { sending(); if (typeof text !== "string") throw new Error("Text required"); client.sendChat(text); },
        sendBeep(target: number, text: string) { sending(); client.sendBeep(target, text); },
        activityOptions(target: number) {
          alive(); permission(target);
          return client.activityOptions(target, false, true).filter(o => o.source === "BC").map(o => ({ ...o }));
        },
        sendActivity(target: number, group: string, name: string) {
          sending(); permission(target);
          const option = client.activityOptions(target, false, true).find(o => o.source === "BC" && o.name === name && o.group === group);
          if (!option || option.reason) throw new Error(option?.reason || "Unsupported activity");
          client.sendActivity(target, group, name, false);
        },
        dispose() { if (disposed) return; disposed = true; for (const off of subscriptions) off(); plugins.delete(id); }
      });
    }
  });
}
