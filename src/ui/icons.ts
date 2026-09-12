// Phosphor Icons and flag-icons (MIT). Vendored SVG sources and licenses ship with the site.
import search from './icons/magnifying-glass.svg?raw';
import female from './icons/gender-female.svg?raw';
import male from './icons/gender-male.svg?raw';
import mixed from './icons/gender-intersex.svg?raw';
import translate from './icons/translate.svg?raw';
import faders from './icons/faders.svg?raw';
import room from './icons/chat-circle-text.svg?raw';
import chats from './icons/chats.svg?raw';
import users from './icons/users.svg?raw';
import gear from './icons/gear.svg?raw';
import refresh from './icons/arrows-clockwise.svg?raw';
import zh from './icons/flag-hk.svg?no-inline';
import en from './icons/flag-gb.svg?no-inline';
import de from './icons/flag-de.svg?no-inline';
import fr from './icons/flag-fr.svg?no-inline';
import es from './icons/flag-es.svg?no-inline';
import ru from './icons/flag-ru.svg?no-inline';
import ua from './icons/flag-ua.svg?no-inline';
const grid = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';
const rows = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18M3 12h18M3 19h18"/></svg>';
const sources = { grid, rows, search, female, male, mixed, translate, faders, room, chats, users, gear, refresh, zh, en, de, fr, es, ru, ua };
export type IconName = keyof typeof sources;
const flagNames = new Set<IconName>(["zh", "en", "de", "fr", "es", "ru", "ua"]);
export function icon(name: IconName): SVGSVGElement {
  if (flagNames.has(name)) {
    // Image documents isolate SVG IDs and avoid hundreds of inline coat-of-arms nodes per room card.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 640 480'); svg.setAttribute('class', 'ui-icon language-flag');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const picture = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    // Vite emits hashed local files, shared by every occurrence and cached independently of JS.
    picture.setAttribute('href', sources[name]);
    picture.setAttribute('width', '640'); picture.setAttribute('height', '480'); svg.append(picture); return svg;
  }
  const template = document.createElement('template');
  template.innerHTML = sources[name]; // Only bundled static SVG; never server or player input.
  const svg = template.content.firstElementChild as SVGSVGElement;
  svg.classList.add('ui-icon'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  return svg;
}
