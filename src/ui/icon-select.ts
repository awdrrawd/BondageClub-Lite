import { icon, type IconName } from './icons';

/** Native desktop select and existing change handler; mobile uses labelled icon buttons. */
export function iconSelect(select: HTMLSelectElement, icons: Record<string, IconName>, fallback: IconName, showValue = false): HTMLElement {
  const root = document.createElement('div'); root.className = 'icon-select';
  const picker = document.createElement('details'); picker.className = 'mobile-picker';
  const summary = document.createElement('summary');
  const menu = document.createElement('div'); menu.className = 'picker-options';
  const label = select.getAttribute('aria-label') || '';
  const update = () => {
    const selected = [...select.options].find(option => option.value === select.value);
    summary.replaceChildren(icon(icons[select.value] || fallback));
    summary.setAttribute('aria-label', `${label}: ${selected?.textContent || ''}`);
    summary.title = summary.getAttribute('aria-label')!;
    if (showValue) { const value = document.createElement('span'); value.className = 'picker-value'; value.textContent = selected?.textContent || ''; summary.append(value); }
    for (const button of menu.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.value === select.value));
  };
  for (const option of select.options) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button ghost'; button.dataset.value = option.value;
    const text = document.createElement('span'); text.textContent = option.textContent;
    button.append(icon(icons[option.value] || fallback), text);
    button.addEventListener('click', () => {
      select.value = option.value; update(); picker.open = false; summary.focus();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }); menu.append(button);
  }
  picker.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); picker.open = false; summary.focus(); } });
  select.addEventListener('change', update);
  picker.append(summary, menu); root.append(select, picker); update(); return root;
}
