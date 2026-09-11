import { t } from '../i18n';
import { el } from './dom';

export function contactCard(data: {id:number; name:string; online:boolean; selected:boolean; relation:string; room?:string; activate:()=>void}): {row:HTMLElement; info:HTMLElement} {
  const row=el('article','contact-card'), info=el('div'), title=el('div','contact-title'), identity=el('span','contact-identity');
  row.dataset.member=String(data.id); row.tabIndex=0; row.setAttribute('role','button'); row.setAttribute('aria-label',`${data.name} #${data.id} · ${t('m028')}`);
  row.classList.toggle('contact-offline',!data.online); row.classList.toggle('selected-contact',data.selected);
  row.addEventListener('click',event=>{ if (!(event.target as HTMLElement).closest('button')) data.activate(); });
  row.addEventListener('keydown',event=>{ if (event.target===row && ['Enter',' '].includes(event.key)) { event.preventDefault(); data.activate(); } });
  identity.append(el('strong','',data.name),el('span','contact-id',`#${data.id}`));
  title.append(identity,el('span','contact-relation',data.relation)); info.append(title);
  if (data.room) info.append(el('p','contact-room',data.room));
  row.append(info); return {row,info};
}
