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
import zh from './icons/flag-tw.svg?raw';
import en from './icons/flag-gb.svg?raw';
const sources = { search, female, male, mixed, translate, faders, room, chats, users, gear, refresh, zh, en };
export type IconName = keyof typeof sources;
export function icon(name: IconName): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = sources[name]; // Only bundled static SVG; never server or player input.
  const svg = template.content.firstElementChild as SVGSVGElement;
  svg.classList.add('ui-icon'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  return svg;
}
