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
  // A neutral schematic, not a character renderer. Hit regions come from BC AssetGroup.Zone.
  const outline = document.createElementNS(ns, "path"); outline.classList.add("body-outline");
  outline.setAttribute("d", "M250 30 C175 30 175 170 220 190 L220 220 L150 240 L100 520 L140 540 L200 330 L190 580 L190 950 L235 950 L250 640 L265 950 L310 950 L310 580 L300 330 L360 540 L400 520 L350 240 L280 220 L280 190 C325 170 325 30 250 30Z"); svg.append(outline);
  const parts = document.createElement("div"); parts.className = "body-parts";
  const results = document.createElement("section"); results.className = "body-results";
  const selected = document.createElement("h3"); selected.textContent = t("interaction.choosePart");
  const activities = document.createElement("div"); activities.className = "body-activities";
  const status = document.createElement("p"); status.className = "notice"; status.setAttribute("role", "status");
  let selectedGroup = "";
  const select = (group: string, label: string) => {
    selectedGroup = group; selected.textContent = label; activities.replaceChildren(); status.textContent = "";
    for (const control of body.querySelectorAll("[data-body-group]")) control.setAttribute("aria-pressed", String(control.getAttribute("data-body-group") === group));
    for (const option of getOptions(compatibility.checked).filter(option => option.group === group)) {
      const row = document.createElement("div"); row.className = "activity-option";
      const action = document.createElement("button"); action.type = "button"; action.className = "button secondary";
      action.textContent = `${option.source && option.source !== "BC" ? `${option.source} · ` : ""}${option.label}`; action.disabled = Boolean(option.reason);
      action.addEventListener("click", () => {
        try { send(group, option.name, compatibility.checked); status.textContent = t("interaction.sent"); }
        catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      }); row.append(action);
      const explanation = option.reason || option.warning;
      if (explanation) { const note = document.createElement("small"); note.className = "muted"; note.textContent = t(explanation as Parameters<typeof t>[0]); row.append(note); }
      activities.append(row);
    }
  };
  for (const [group, label] of new Map(getOptions(true).map(option => [option.group, option.groupLabel]))) {
    const button = document.createElement("button"); button.type = "button"; button.className = "button ghost"; button.dataset.bodyGroup = group; button.textContent = label;
    button.addEventListener("click", () => select(group, label)); parts.append(button);
    for (const [x, y, width, height] of (definitions.geometry as Record<string, number[][]>)[group] || []) {
      const region = document.createElementNS(ns, "rect"); region.classList.add("body-zone");
      for (const [key, value] of Object.entries({ x, y, width, height, rx: 10 })) region.setAttribute(key, String(value));
      region.setAttribute("data-body-group", group); region.setAttribute("role", "button"); region.setAttribute("tabindex", "0"); region.setAttribute("aria-label", label); region.setAttribute("aria-pressed", "false");
      const title = document.createElementNS(ns, "title"); title.textContent = label; region.append(title);
      region.addEventListener("click", () => select(group, label));
      region.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(group, label); } });
      svg.append(region);
    }
  }
  compatibility.addEventListener("change", () => { if (selectedGroup) select(selectedGroup, selected.textContent || selectedGroup); });
  body.append(svg, parts); results.append(selected, status, activities); layout.append(body, results);
  dialog.append(heading, close, help, mode, layout); document.body.append(dialog); dialog.showModal();
  return dialog;
}
