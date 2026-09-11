import { t } from "../i18n";
import { exportHistory, type HistoryPolicy } from "../storage/history";
import type { HistorySession } from "../storage/history-session";
import { el, select, field, button, checkbox } from "./dom";
import { showConfirm } from '../platform/dialogs';

interface HistorySettingsContext {
  history: HistorySession; owner:()=>string; hasError:()=>boolean; notice:(message:string)=>void;
}

export function buildHistorySettings(context: HistorySettingsContext): HTMLElement {
    const {history, owner, hasError, notice} = context;
    const panel = el("section", "settings-card history-settings");
    panel.append(el("h2", "", t("history.title")), el("p", "", t("history.privacy")), el("p", "muted", t("history.cleanup")));
    for (const [key, choices] of [["recentDays", [0,7,14,30]], ["roomDays", [0,1,3,7]], ["privateDays", [0,1,3,7]]] as const) {
      const control = select(t(`history.${key}`), choices.map(days => [String(days), days ? t("history.days", [days]) : t("history.off")]), String(history.policy[key]));
      control.id = `History-${key}`;
      control.addEventListener("change", () => {
        const value = Number(control.value), account=owner();
        const apply=()=>{
          control.value=String(value); control.disabled=true;
          const policy: HistoryPolicy={...history.policy,[key]:value};
          void history.configure(policy).then(() => refresh()).catch(() => { notice(t("history.error")); }).finally(() => { control.disabled = false; });
        };
        if (value < history.policy[key]) { control.value=String(history.policy[key]); showConfirm(t('history.shorten'),apply,{valid:()=>panel.isConnected && owner()===account}); }
        else apply();
      }); panel.append(field(t(`history.${key}`), control));
    }
    const status = el("p", "muted", hasError() ? t("history.error") : t("history.loading")); status.setAttribute("role", "status");
    const dates = select(t("history.date"), [], ""); dates.id = "HistoryDate";
    let records: Array<{day:string;count:number}> = [], includePrivate = false;
    const download = button(t("history.export"), "secondary", "button"); download.disabled = true;
    const updateDates = () => {
      const selected = dates.value;
      dates.replaceChildren();
      for (const date of records.map(row => row.day)) {
        const option = document.createElement("option"); option.value = date; option.textContent = date; dates.append(option);
      }
      if ([...dates.options].some(option => option.value === selected)) dates.value = selected;
      download.disabled = !dates.options.length;
      status.textContent = hasError() ? t("history.error") : records.length ? t("history.count", [records.reduce((sum,row)=>sum+row.count,0)]) : t("history.empty");
    };
    let refreshRequest=0;
    const refresh = async () => { try { const key=owner(), request=++refreshRequest; const data = await history.days(includePrivate); if (panel.isConnected && owner()===key && request===refreshRequest) { records = data; updateDates(); } } catch { status.textContent = t("history.error"); } };
    download.addEventListener("click", () => {
      // Re-read on click so expired records or a changed retention policy cannot leak into export.
      const day = dates.value, key = owner(), privateIncluded = includePrivate;
      void history.day(day, privateIncluded).then(data => {
        if (!panel.isConnected || owner() !== key) return;
        const labels: Record<string,string> = {Chat:t("history.chat"),Emote:t("history.emote"),Action:t("history.action"),Activity:t("history.action"),Whisper:t("m029"),Beep:t("m028"),Local:t("history.system"),ServerMessage:t("history.system")};
        const content = exportHistory(data, day, privateIncluded, type => labels[type] || type);
        const url = URL.createObjectURL(new Blob(["\uFEFF", content], {type:"text/plain;charset=utf-8"}));
        const a = document.createElement("a"); a.href = url; a.download = `BC-Lite-${key.replaceAll(":", "-")}-${day}.txt`; document.body.append(a); a.click(); a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }).catch(() => { status.textContent = t("history.error"); });
    });
    const clear = button(t("history.clear"), "ghost danger", "button");
    clear.addEventListener("click", () => {
      const account=owner();
      showConfirm(t('history.clearConfirm'),()=>{clear.disabled=true; void history.clear().then(refresh).catch(()=>{status.textContent=t('history.error');}).finally(()=>{clear.disabled=false;});},{valid:()=>panel.isConnected && owner()===account});
    });
    panel.append(status, field(t("history.date"), dates), checkbox(t("history.includePrivate"), false, value => { includePrivate = value; void refresh(); }), download, clear);
    void refresh(); return panel;
  }
