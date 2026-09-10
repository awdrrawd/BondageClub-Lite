import { t } from "../i18n";
import definitions from "../action/native-data.json";

type ActivityOption = { group: string; groupLabel: string; name: string; label: string; reason: string | null; warning?: string; source?: string };
export function openActivityDialog(name: string, getOptions: (compatibility: boolean) => ActivityOption[], send: (group: string, name: string, compatibility: boolean) => void): HTMLDialogElement {
  const dialog = document.createElement("dialog"); dialog.className = "profile-dialog activity-dialog";
  const heading = document.createElement("h2"); heading.textContent = `${t("interaction.title")} · ${name}`;
  const close = document.createElement("button"); close.type = "button"; close.className = "button ghost dialog-close"; close.textContent = "×"; close.setAttribute("aria-label", t("m173"));
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  const help = document.createElement("p"); help.className = "muted"; help.textContent = t("native.help");
  const mode = document.createElement("label"); mode.className = "checkbox";
  const compatibility = document.createElement("input"); compatibility.type = "checkbox"; compatibility.checked = true;
  mode.append(compatibility, document.createTextNode(t("interaction.compatibility")));
  const layout = document.createElement("div"); layout.className = "activity-layout";
  const body = document.createElement("div"); body.className = "body-picker";
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 500 1000"); svg.classList.add("activity-body-svg"); svg.setAttribute("aria-label", t("interaction.body"));
  // Only native hit regions: no silhouette, textures or duplicate body-part list.
  const results = document.createElement("section"); results.className = "body-results";
  const selected = document.createElement("h3"); selected.textContent = t("interaction.choosePart");
  const activities = document.createElement("div"); activities.className = "body-activities";
  const status = document.createElement("p"); status.className = "notice"; status.setAttribute("role", "status");
  const back = document.createElement("button"); back.type = "button"; back.className = "button ghost activity-back"; back.textContent = t("interaction.back");
  back.addEventListener("click", () => { dialog.classList.remove("show-actions"); svg.querySelector<SVGElement>('[aria-pressed="true"]')?.focus(); });
  let selectedGroup = "";
  const select = (group: string, label: string, focus = true) => {
    selectedGroup = group; selected.textContent = label; activities.replaceChildren(); status.textContent = "";
    dialog.classList.add("show-actions");
    for (const control of body.querySelectorAll("[data-body-group]")) control.setAttribute("aria-pressed", String(control.getAttribute("data-body-group") === group));
    for (const option of getOptions(compatibility.checked).filter(option => option.group === group && !["native.blocked", "native.permission", "native.target"].includes(option.reason || ""))) {
      const row = document.createElement("div"); row.className = "activity-option";
      const action = document.createElement("button"); action.type = "button"; action.className = "button secondary";
      action.textContent = `${option.source && option.source !== "BC" ? `${option.source} · ` : ""}${option.label}`; action.disabled = Boolean(option.reason);
      action.addEventListener("click", () => {
        if (option.name.startsWith("cuddle:") && option.name !== "cuddle:stop" && !window.confirm(t("cuddle.confirm"))) return;
        try { send(group, option.name, compatibility.checked); status.textContent = t("interaction.sent"); }
        catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      }); row.append(action);
      const explanation = option.reason || option.warning;
      if (explanation) { const note = document.createElement("small"); note.className = "muted"; note.textContent = t(explanation as Parameters<typeof t>[0]); row.append(note); }
      activities.append(row);
    }
    if (!activities.childElementCount) status.textContent = t("interaction.noAvailable");
    if (focus && window.matchMedia("(max-width: 760px)").matches) back.focus();
  };
  let extraRegion = 0;
  for (const [group, label] of new Map(getOptions(true).map(option => [option.group, option.groupLabel]))) {
    // Plugin-only groups without native geometry get auxiliary tiles, not invented body zones.
    const regions = (definitions.geometry as Record<string, number[][]>)[group] || [[370, 750 + extraRegion++ * 75, 125, 65]];
    for (const [x, y, width, height] of regions) {
      const region = document.createElementNS(ns, "rect"); region.classList.add("body-zone");
      for (const [key, value] of Object.entries({ x, y, width, height, rx: 10 })) region.setAttribute(key, String(value));
      region.setAttribute("data-body-group", group); region.setAttribute("role", "button"); region.setAttribute("tabindex", "0"); region.setAttribute("aria-label", label); region.setAttribute("aria-pressed", "false");
      const title = document.createElementNS(ns, "title"); title.textContent = label; region.append(title);
      region.addEventListener("click", () => select(group, label));
      region.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(group, label); } });
      svg.append(region);
      const caption = document.createElementNS(ns, "text"); caption.setAttribute("x", String(x + width / 2)); caption.setAttribute("y", String(y + height / 2)); caption.setAttribute("text-anchor", "middle"); caption.setAttribute("dominant-baseline", "middle"); caption.classList.add("body-zone-label"); caption.textContent = label; svg.append(caption);
    }
  }
  compatibility.addEventListener("change", () => { if (selectedGroup) select(selectedGroup, selected.textContent || selectedGroup); });
  dialog.addEventListener("activity-refresh", () => { if (selectedGroup) select(selectedGroup, selected.textContent || selectedGroup, false); });
  body.append(svg); results.append(back, selected, status, activities); layout.append(body, results);
  dialog.append(heading, close, help, mode, layout); document.body.append(dialog); dialog.showModal();
  return dialog;
}
