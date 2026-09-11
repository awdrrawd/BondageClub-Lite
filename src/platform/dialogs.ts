import { t } from '../i18n';

/** Non-blocking Lite dialogs. Player text is always textContent, never HTML. */
function messageDialog(message: string, title: string, doc: Document): HTMLDialogElement {
  const dialog=doc.createElement('dialog'); dialog.className='profile-dialog lite-dialog';
  dialog.setAttribute('aria-label',title);
  const heading=doc.createElement('h2'); heading.textContent=title;
  const text=doc.createElement('p'); text.className='lite-dialog-message'; text.textContent=message;
  dialog.append(heading,text);
  dialog.addEventListener('close',()=>dialog.remove());
  return dialog;
}
function dialogButton(doc: Document, text: string, action: string): HTMLButtonElement {
  const button=doc.createElement('button'); button.type='button'; button.className='button ghost';
  button.textContent=text; button.dataset.dialogAction=action; return button;
}
export function showNotice(message: string, doc: Document = document): void {
  const existing=doc.querySelector<HTMLDialogElement>('.lite-notice');
  if (existing) { existing.querySelector('.lite-dialog-message')!.textContent=message; return; }
  const dialog=messageDialog(message,t('dialog.notice'),doc); dialog.classList.add('lite-notice');
  const close=dialogButton(doc,t('dialog.close'),'close'); close.addEventListener('click',()=>dialog.close());
  dialog.append(close); doc.body.append(dialog); dialog.showModal(); close.focus();
}
export function showConfirm(message: string, accept:()=>void, options: {valid?:()=>boolean; cancel?:()=>void; document?:Document} = {}): void {
  const doc=options.document || document, dialog=messageDialog(message,t('dialog.confirm'),doc);
  dialog.classList.add('lite-confirm');
  let settled=false;
  const cancel=()=>{ if (!settled) { settled=true; options.cancel?.(); } };
  const yes=dialogButton(doc,t('dialog.confirm'),'confirm'); yes.className='button primary';
  yes.addEventListener('click',()=>{
    if (settled || !dialog.isConnected) return;
    if (options.valid && !options.valid()) { cancel(); dialog.close(); return; }
    settled=true; dialog.close();
    try { accept(); } catch (error) { showNotice(error instanceof Error ? error.message : String(error),doc); }
  });
  const no=dialogButton(doc,t('safety.cancel'),'cancel'); no.addEventListener('click',()=>{cancel();dialog.close();});
  dialog.addEventListener('cancel',cancel); dialog.addEventListener('close',cancel);
  dialog.append(yes,no); doc.body.append(dialog); dialog.showModal(); no.focus();
}
