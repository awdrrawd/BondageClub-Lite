import { interactionPermission } from "../action/interaction-permission";
import type { ExtensionClient, MessageKind, PluginMessage, PluginOptions } from "./types";
import type { ClientSnapshot, DisplayMessage } from "../shared/types";

const messageKinds = { Chat: "chat", Whisper: "whisper", Emote: "emote", Action: "action", Activity: "activity", ServerMessage: "server", Local: "local", Beep: "beep" } as const;

export function classifyMessage(message: DisplayMessage): MessageKind {
  if (message.presence) return "presence";
  return messageKinds[message.type] ?? "unknown";
}

export function createExtensionAPI(client: ExtensionClient) {
  let state: Readonly<ClientSnapshot>;
  const unsubscribe = client.subscribe(value => { state = value; });
  const plugins = new Set<string>();
  const disposers = new Set<() => void>();
  let closed = false;
  return Object.freeze({
    client: "Lite", apiVersion: 1,
    capabilities: Object.freeze({ messages: true, chat: true, beep: true, nativeActivities: true, inventory: false, roomAdmin: false, musicControl: false, map: false, modSdkCompatible: false }),
    registerPlugin(id: string, options: PluginOptions = {}) {
      if (closed) throw new Error("Extension API disposed");
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id) || plugins.has(id)) throw new Error("Invalid or duplicate plugin id");
      plugins.add(id);
      const allowSend = options.allowSend === true, privateMessages = options.privateMessages === true;
      const subscriptions = new Set<() => void>();
      let disposed = false, lastSend = 0;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        for (const off of subscriptions) off();
        plugins.delete(id); disposers.delete(dispose);
      };
      disposers.add(dispose);
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
        onMessage(callback: (event: PluginMessage) => unknown) {
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
        dispose
      });
    },
    dispose() {
      if (closed) return;
      closed = true;
      for (const dispose of disposers) dispose();
      unsubscribe();
    }
  });
}
