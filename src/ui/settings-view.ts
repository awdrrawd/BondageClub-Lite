import { t } from '../i18n';
import { el, select, field, button, checkbox } from './dom';
import type { Locale } from '../i18n';
export interface DisplaySettings { theme: string; background: boolean; largeText: boolean; timestamps: boolean; locale: Locale }
export interface SettingsContext {
 settings: DisplaySettings;
 appearanceCount: number | string;
 applySettings(): void;
 notice(message: string): void;
 accountPrivacyNote(): HTMLElement;
 forgetAccount(): void;
 disconnect(): void;
 confirmAction(message: string, action: () => void): void;
 buildSoundSettings(): HTMLElement;
 buildSummonSettings(): HTMLElement;
 buildPerformanceSettings(): HTMLElement;
 buildHistorySettings(): HTMLElement;
 stabilityPanel(): HTMLElement;
 mediaPanel(): HTMLElement;
}
export function buildSettingsView(context: SettingsContext): HTMLElement {
    const section = el("section", "settings-view");
    section.append(el("p", "eyebrow", t("m055")), el("h1", "", t("m056")));
    const panel = el("div", "settings-card");
    panel.append(el("h2", "", t("settings.appearance")));
    const theme = select(t("settings.theme"), (["default", "midnight", "forest"] as const).map(value => [value, t(`theme.${value}`)]), context.settings.theme);
    theme.id = "ThemeSelect";
    theme.addEventListener("change", () => { context.settings.theme = theme.value; context.applySettings(); try { localStorage.setItem("bc-lite-display-v1", JSON.stringify(context.settings)); } catch { context.notice(t("m060")); } });
    panel.append(field(t("settings.theme"), theme));
    for (const [key, label] of [["background", t("m057")], ["largeText", t("m058")], ["timestamps", t("m059")]] as const) {
      panel.append(checkbox(label, context.settings[key], value => {
        context.settings[key] = value; context.applySettings();
        try { localStorage.setItem("bc-lite-display-v1", JSON.stringify(context.settings)); } catch { context.notice(t("m060")); }
      }));
    }
    panel.append(el("p", "muted", t("m061")));
    const privacy = el("div", "settings-card");
    privacy.append(el("h2", "", t("m062")), context.accountPrivacyNote());
    const forget = button(t("m063"), "ghost", "button");
    forget.addEventListener("click", () => { context.forgetAccount(); });
    privacy.append(forget, el("p", "muted", t("m064")), el("p", "muted", t("privacy.lastRoom")));
    const compatibility = el("div", "settings-card");
    compatibility.append(el("h2", "", t("m065")), el("p", "", t("m066", [context.appearanceCount])), el("p", "muted", t("m068")));
    compatibility.append(el("p", "muted", t("m069")));
    const disconnect = button(t("m070"), "ghost danger", "button");
    disconnect.addEventListener("click", () => context.confirmAction(t("m071"),()=>context.disconnect()));
    const jumps = el("nav", "settings-jumps"); jumps.setAttribute("aria-label", t("settings.jump"));
    const groups: Array<[string, string, HTMLElement[]]> = [
      ["appearance", t("settings.appearance"), [panel]],
      ["function", t("settings.function"), [context.buildSoundSettings(), context.buildSummonSettings(), compatibility]],
      ["performance", t("settings.performance"), [context.buildPerformanceSettings(), context.stabilityPanel()]],
      ["storage", t("settings.storage"), [context.buildHistorySettings()]],
      ["privacy", t("settings.privacy"), [privacy, context.mediaPanel()]],
    ];
    section.append(jumps);
    for (const [id, label, panels] of groups) {
      const anchor = el("a", "button ghost", label) as HTMLAnchorElement; anchor.href = `#settings-${id}`; jumps.append(anchor);
      const group = el("section", "settings-group"); group.id = `settings-${id}`; group.append(el("h2", "", label), ...panels); section.append(group);
    }
    section.append(disconnect);
    return section;
  }
