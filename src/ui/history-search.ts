import { t } from '../i18n';
import { el, input, select, field, button } from './dom';
import type { HistorySession } from '../storage/history-session';
import type { HistoryMessage, HistoryQuery } from '../storage/history';

export function openHistorySearch(history: HistorySession, owner: ()=>string, initial?: {keyword?:string; member?:string;hit?:HistoryMessage}): void {
  document.querySelector('.history-search-dialog')?.remove();
  const dialog=el('dialog','profile-dialog history-search-dialog') as HTMLDialogElement;
  dialog.setAttribute('aria-label',t('searchHistory.title'));
  const close=button(t('safety.cancel'),'ghost','button'); close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{request++; dialog.remove();});
  const form=el('form','history-search-form');
  const keyword=input('HistoryKeyword',t('searchHistory.keyword'),'search',initial?.keyword || ''); keyword.required=false;
  const member=input('HistoryMember',t('searchHistory.member'),'search',initial?.member || ''); member.required=false;
  const room=input('HistoryRoom',t('searchHistory.room'),'search',''); room.required=false;
  const from=input('HistoryFrom',t('searchHistory.from'),'date',''); from.required=false;
  const to=input('HistoryTo',t('searchHistory.to'),'date',''); to.required=false;
  const channel=select(t('searchHistory.channel'),[['room',t('history.chat')],['private',t('private.title')],['Whisper',t('m029')],['Beep',t('m028')],['all',t('m020')]],'room');
  if(initial?.member) channel.value='private';
  const submit=button(t('m098'),'primary','submit'), more=button(t('searchHistory.more'),'ghost','button');
  more.hidden=true;
  const status=el('p','muted'); status.setAttribute('role','status');
  const results=el('div','history-search-results'), context=el('div','history-search-context');
  context.setAttribute('aria-live','polite');
  form.append(field(t('searchHistory.keyword'),keyword),field(t('searchHistory.member'),member),field(t('searchHistory.room'),room),field(t('searchHistory.from'),from),field(t('searchHistory.to'),to),field(t('searchHistory.channel'),channel),submit);
  let request=0, contextRequest=0, before:HistoryMessage|undefined, query:HistoryQuery={};
  const show=(row:HistoryMessage)=> {
    const account=owner(), id=++contextRequest;
    context.replaceChildren(el('p','',t('history.loading')));
    void history.context(row).then(rows=>{
      if(!dialog.isConnected || owner()!==account || id!==contextRequest)return;
      context.replaceChildren(el('h3','',t('searchHistory.context')));
      if(!rows.some(entry=>entry.key===row.key)){context.append(el('p','',t('searchHistory.unavailable')));return;}
      for(const entry of rows) {
        const line=el('p',entry.key===row.key?'search-hit':'',`[${new Date(entry.timestamp).toLocaleString()}] ${entry.message.senderName} #${entry.message.sender ?? ''} → ${entry.message.targetName || entry.message.target || ''}: ${entry.message.text}`);
        context.append(line);
      }
      context.scrollIntoView?.({block:'nearest'});
    }).catch(()=>{if(dialog.isConnected && id===contextRequest)status.textContent=t('history.error');});
  };
  const search=async (append=false)=>{
    const account=owner(), id=++request;
    if(!append) {
      contextRequest++;
      query={keyword:keyword.value.trim(),member:member.value.trim(),room:room.value.trim(),from:from.value,to:to.value,channel:channel.value};
      before=undefined; more.hidden=true; results.replaceChildren(); context.replaceChildren();
    }
    if(query.from && query.to && query.from>query.to){status.textContent=t('searchHistory.dates');return;}
    submit.disabled=true; more.disabled=true; status.textContent=t('history.loading');
    try {
      const page=await history.search(query,before);
      if(!dialog.isConnected || owner()!==account || id!==request)return;
      results.replaceChildren();
      for(const row of page.rows) {
        const item=button(`[${new Date(row.timestamp).toLocaleString()}] ${row.room || row.message.type} · ${row.message.senderName} #${row.message.sender ?? ''}: ${row.message.text}`,'ghost history-search-result','button');
        item.addEventListener('click',()=>show(row)); results.append(item);
      }
      before=page.rows.at(-1); more.hidden=!page.more; status.textContent=page.rows.length?t('searchHistory.resultHelp'):t('history.empty');
    } catch {if(id===request)status.textContent=t('history.error');}
    finally {if(id===request){submit.disabled=false;more.disabled=false;}}
  };
  form.addEventListener('submit',event=>{event.preventDefault();void search();});
  more.addEventListener('click',()=>{void search(true);});
  dialog.append(close,el('h2','',t('searchHistory.title')),el('p','muted',t('searchHistory.help')),form,status,results,more,context);
  document.body.append(dialog); dialog.showModal(); keyword.focus();
  if(initial?.hit)show(initial.hit);
}
