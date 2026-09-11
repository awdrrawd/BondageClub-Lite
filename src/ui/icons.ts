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
import zh from './icons/flag-hk.svg?raw';
import en from './icons/flag-gb.svg?raw';
import de from './icons/flag-de.svg?raw';
import fr from './icons/flag-fr.svg?raw';
import es from './icons/flag-es.svg?raw';
import ru from './icons/flag-ru.svg?raw';
import ua from './icons/flag-ua.svg?raw';
const sources = { search, female, male, mixed, translate, faders, room, chats, users, gear, refresh, zh, en, de, fr, es, ru, ua };
export type IconName = keyof typeof sources;
const flagUrls = new Map<IconName,string>();
export function icon(name: IconName): SVGSVGElement {
  if (['zh','en','de','fr','es','ru','ua'].includes(name)) {
    // Image documents isolate SVG IDs and avoid hundreds of inline coat-of-arms nodes per room card.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 640 480'); svg.setAttribute('class', 'ui-icon language-flag');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const picture = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    if (!flagUrls.has(name)) flagUrls.set(name,'data:image/svg+xml,' + encodeURIComponent(sources[name]));
    picture.setAttribute('href', flagUrls.get(name)!);
    picture.setAttribute('width', '640'); picture.setAttribute('height', '480'); svg.append(picture); return svg;
  }
  const template = document.createElement('template');
  template.innerHTML = sources[name]; // Only bundled static SVG; never server or player input.
  const svg = template.content.firstElementChild as SVGSVGElement;
  svg.classList.add('ui-icon'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  return svg;
}
