import { LiteApp } from "../ui/app";
import { createPreviewClient } from "./client";
const preview = createPreviewClient();
preview.client.search({ Query: "", Language: "", Space: "X", Game: "", FullRooms: true, ShowLocked: true, SearchDescs: false });
new LiteApp(preview.client);
const bar = document.createElement("aside"); bar.className = "preview-tools";
const label = document.createElement("strong"); label.textContent = "OFFLINE · UI PREVIEW"; bar.append(label);
for (const [label, action] of [["新增訊息",preview.inject], ["3000 則",preview.stress], ["模擬斷線",preview.simulateDisconnect], ["恢復",() => preview.client.login("", "")]] as const) {
  const button = document.createElement("button"); button.className = "button ghost"; button.type = "button"; button.textContent = label; button.addEventListener("click",action); bar.append(button);
}
document.body.append(bar);
