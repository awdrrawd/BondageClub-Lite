import { t } from "../i18n";
import definitions from "../action/native-data.json";
import { canonicalPartGroup } from "../action/labels";

type ActivityOption = { group: string; groupLabel: string; name: string; label: string; reason: string | null; warning?: string; source?: string };
export function openActivityDialog(name: string, getOptions: (compatibility: boolean) => ActivityOption[], send: (group: string, name: string, compatibility: boolean) => void | boolean): HTMLDialogElement {
  const dialog = document.createElement("dialog"); dialog.className = "profile-dialog activity-dialog";
  const heading = document.createElement("h2"); heading.textContent = `${t("interaction.title")} · ${name}`;
  const close = document.createElement("button"); close.type = "button"; close.className = "button ghost dialog-close"; close.textContent = "×"; close.setAttribute("aria-label", t("m173"));
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  const help = document.createElement("p"); help.className = "muted"; help.textContent = t("native.help"); help.hidden = true;
  const mode = document.createElement("label"); mode.className = "checkbox";
  const allActions = document.createElement("input"); allActions.type = "checkbox"; allActions.checked = false;
  mode.className='activity-all'; allActions.hidden=true; mode.append(allActions);
  const allButton=document.createElement('button'); allButton.type='button'; allButton.className='button ghost'; allButton.textContent='ALL'; allButton.title=t('interaction.allActions'); allButton.setAttribute('aria-pressed','false');
  allButton.addEventListener('click',()=>{allActions.checked=!allActions.checked;allButton.setAttribute('aria-pressed',String(allActions.checked));allActions.dispatchEvent(new window.Event('change'));}); mode.append(allButton);
  const info=document.createElement('button');info.type='button';info.className='button ghost activity-info';info.textContent='i';info.setAttribute('aria-label',t('rooms.details'));info.setAttribute('aria-expanded','false');
  info.addEventListener('click',()=>{help.hidden=!help.hidden;info.setAttribute('aria-expanded',String(!help.hidden));});
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
    group = canonicalPartGroup(group);
    selectedGroup = group; selected.textContent = label; activities.replaceChildren(); status.textContent = "";
    dialog.classList.add("show-actions");
    for (const control of body.querySelectorAll("[data-body-group]")) control.setAttribute("aria-pressed", String(canonicalPartGroup(control.getAttribute("data-body-group") || "") === group));
    // Prefer an eligible sibling before deduplication, independent of upstream ordering.
    const options = new Map<string, ActivityOption>();
    for (const option of getOptions(allActions.checked).filter(option => canonicalPartGroup(option.group) === group && (allActions.checked || !option.reason))) {
      const identity = `${option.source}:${option.name.replace(/(Chat(?:Self|Other))-Item\w+-/, "$1-")}`;
      if (!options.has(identity) || (options.get(identity)!.reason && !option.reason)) options.set(identity, option);
    }
    for (const option of options.values()) {
      const row = document.createElement("div"); row.className = "activity-option";
      const action = document.createElement("button"); action.type = "button"; action.className = "button secondary";
      action.textContent = option.label;
      if(option.source){const ribbon=document.createElement('span');ribbon.className='activity-source';ribbon.textContent=option.source;row.append(ribbon);action.setAttribute('aria-label',`${option.label} (${option.source})`);} action.disabled = Boolean(option.reason);
      action.addEventListener("click", () => {
        try { if (send(option.group, option.name, allActions.checked) !== false) status.textContent = t("interaction.sent"); }
        catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      }); row.append(action);
      const explanation = option.reason || option.warning;
      if (explanation) action.title = t(explanation as Parameters<typeof t>[0]);
      activities.append(row);
    }
    if (!activities.childElementCount) status.textContent = t("interaction.noAvailable");
    if (focus && window.matchMedia("(max-width: 760px)").matches) back.focus();
  };
  let extraRegion = 0;
  const groups = new Map(getOptions(true).map(option => [option.group, option.groupLabel]));
  const families = new Map([...groups].map(([group, label]) => [canonicalPartGroup(group), groups.get(canonicalPartGroup(group)) || label]));
  for (const group of Object.keys(definitions.geometry)) if (families.has(canonicalPartGroup(group))) groups.set(group, families.get(canonicalPartGroup(group))!);
  for (const [group, label] of groups) {
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
  allActions.addEventListener("change", () => { if (selectedGroup) select(selectedGroup, selected.textContent || selectedGroup); });
  dialog.addEventListener("activity-refresh", () => { if (selectedGroup) select(selectedGroup, selected.textContent || selectedGroup, false); });
  body.append(svg); results.append(back, selected, status, activities); layout.append(body, results);
  dialog.append(heading, close, info, help, mode, layout); document.body.append(dialog); dialog.showModal();
  return dialog;
}
