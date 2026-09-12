# 插件與機器人入口

[文件導覽](README.md) · [架構導覽](https://bondageclub-lite.pages.dev/docs/architecture/)

Lite 提供 window.BCLite（apiVersion: 1），入口建立後發出 bclite:ready。這是同頁 JavaScript API，不是遠端 HTTP API，也不是官方 BC Mod SDK 相容層。插件與頁面具有同等存取能力；API 選項是功能約定，不是沙箱。不要載入不信任的腳本。

TypeScript 契約位於 src/extensions/types.ts：PluginOptions、PluginMessage、MessageKind。這些型別與執行期 API 分離，不增加網路依賴。

整個橋接可呼叫 `window.BCLite.dispose()` 取消快照訂閱並撤銷全部插件，之後不能再註冊。一般插件停用請使用自身的 `dispose()`。

## 註冊與訊息

registerPlugin(id, { allowSend: false, privateMessages: false }) 回傳插件實例。同一 id 不能重複註冊；dispose() 移除監聽並停用該實例。發送與私訊訂閱各自明確啟用。getState() 僅提供 phase、self、room、members，不提供帳密、Socket、完整快照或外觀。

onMessage(callback) 回傳取消訂閱函式。只通知新加入的訊息，不重播歷史、翻譯重繪或搜尋結果。事件不可修改，回呼失敗不影響其他監聽器；async 回呼不保證依序完成。

| kind | 原始 type | 意義 |
| --- | --- | --- |
| chat | Chat | 普通聊天 |
| whisper | Whisper | 悄悄話，需 privateMessages |
| emote | Emote | 玩家表情／敘述 |
| action | Action | 動作敘述，不代表成功操作道具 |
| activity | Activity | 活動訊息 |
| presence | 通常 Action | 進出房通知；key 保留事件鍵，不解析翻譯文字判斷 |
| beep | Beep | BEEP，需 privateMessages |
| server | ServerMessage | 伺服器訊息 |
| local | Local | Lite 本機提示，不應觸發自動回覆 |
| unknown | 未知值 | 不識別的種類 |

事件另有 id、sender、target、self、text、room、timestamp（毫秒）、key（原始翻譯鍵或 null）。BEEP 的 room 為 null；text 是顯示文字，不能當可信指令。Hidden／Status 控制封包不公開。機器人應先篩選 kind、sender、self，再比對指令；不要對 action、local 或自己的回音無條件回覆。

## 可用操作

- sendChat(text)：沿用 Lite 的 /w、/me、.a 語法與聊天室檢查。
- sendBeep(memberNumber, text)：沿用好友 BEEP 發送驗證。
- activityOptions(memberNumber)：取得原生 BC 活動與不可用原因。
- sendActivity(memberNumber, group, name)：每次重新檢查權限及嚴格活動條件，不啟用寬鬆相容模式。

每個插件的發送入口至少相隔 1500 毫秒，另受客戶端原有共同限制。失敗會 throw；送出不等於對端接受。活動權限依官方 `ServerChatRoomGetAllowItem` 的線上玩家規則檢查：

| 等級 | 可互動條件（自己與已確認主人優先允許） |
| --- | --- |
| 0 | 所有人 |
| 1 | 不在對象黑名單 |
| 2 | 不在黑名單，且在白名單、是戀人，或自身支配聲望 +25 ≥ 對象 |
| 3 | 在對象白名單或是戀人 |
| 4 | 是戀人 |
| 5 | 僅自己或主人 |

主人依對象 Ownership.MemberNumber，戀人依發起者 Lovership；來源優先使用最新房間角色資料。AllowedInteractions 缺值時讀 ItemPermission。缺少或格式錯誤的必要名單／聲望不推定允許；已收到的空 Reputation 依官方規則視為聲望 0。這是線上活動的權限判斷，不包含 NPC、物品鎖、換裝或道具專用條件。

UI 與插件共用 `action/interaction-permission.ts`；UI 相容模式也不會略過權限檢查，貼貼則沿用獨立的雙方確認流程。

capabilities 明確標出目前不支援的 inventory、roomAdmin、musicControl、map。綁人、解綁、換裝必須先補齊物品與權限驗證；播歌可先發連結，不能強制其他人播放；地圖及房主操作需各自接入協定與房主權限。沒有提供任意 emit、整份 Appearance 覆寫或權限繞過入口。

## 範例：明確指令回覆

以下程式放在可於本站執行的自訂使用者腳本中；不需要修改官方 Mod SDK。避免重複安裝相同 id。

~~~js
function start() {
  const bot = window.BCLite.registerPlugin('example.greeting', { allowSend: true });
  bot.onMessage(message => {
    if (message.kind !== 'chat' || message.self || message.sender === null) return;
    if (message.text.trim() !== '!hello') return;
    try { bot.sendChat('你好！'); } catch (error) { console.warn(error.message); }
  });
  // 停用時呼叫 bot.dispose();
}
if (window.BCLite?.apiVersion === 1) start();
else window.addEventListener('bclite:ready', start, { once: true });
~~~

## 官方 Mod SDK 的範圍

檢查本機插件倉庫的 expand/bcmodsdk.js（1.2.0）：提供 registerMod、hookFunction（優先序與 next）、patchFunction、removePatches、callOriginal、getOriginalHash，以及插件／patch 資訊。它找的是 window 上已有的函式，不會提供 CharacterReleaseTotal、InventoryUnlock、ServerSend、ChatRoom 畫面等官方遊戲功能。

原始碼 patch 使用 eval，與 Lite 現有 CSP 不相容；Lite 保持事件訂閱與明確操作 API，不為此放寬 CSP。Release Maid 的畫面 hook、角色物件及解鎖流程不能直接執行，也不應把它「權限函式缺失就允許」的回退搬過來。

## English summary

BCLite API v1 exposes live classified message subscriptions, minimal state, chat/BEEP sending and conservative native activities. Register a plugin, explicitly opt into sending/private messages, and dispose it when disabled. No history replay, raw sockets, credentials, inventory writes, admin/map operations or Mod SDK compatibility. Online permission levels 0–5 include ownership, source-side lovership, target lists and dominance; missing required data fails closed; successful submission is not server acceptance. Same-page scripts are trusted code, not sandboxed extensions.
