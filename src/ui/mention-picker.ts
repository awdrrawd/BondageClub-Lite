import type { CharacterSummary } from '../shared/types';
/** Composer-local suggestions: no global listeners, timers or network lookups. */
export function createMentionPicker(input: HTMLTextAreaElement, getCharacters: () => CharacterSummary[]): HTMLElement {
  let composing=false;
    const mentionList=document.createElement('div');mentionList.className='mention-list';mentionList.hidden=true;mentionList.setAttribute('role','listbox');
    let mentionStart=-1, mentionIndex=0;
    const refreshMentions=()=>{
      if(composing)return;
      const prefix=input.value.slice(0,input.selectionStart),match=prefix.match(/[@＠]([^@＠\n]{0,100})$/u);
      mentionList.replaceChildren();mentionList.hidden=true;if(!match)return;
      mentionStart=match.index!;
      if(mentionStart>0 && /[a-z\d._%+-]/i.test(prefix[mentionStart-1]))return;mentionIndex=0;
      const query=match[1].trim().toLocaleLowerCase();
      for(const person of getCharacters().filter(person=>[person.Nickname,person.Name].some(name=>name?.toLocaleLowerCase().includes(query))||String(person.MemberNumber).includes(query))){
        const name=person.Nickname||person.Name||String(person.MemberNumber);
        const choice=document.createElement('button');choice.type='button';choice.className='button ghost';choice.textContent=`${name} #${person.MemberNumber}`;choice.setAttribute('role','option');
        choice.addEventListener('pointerdown',event=>{if(event.pointerType !== 'touch')event.preventDefault();});
        choice.addEventListener('click',()=>{const token=`@${name}#${person.MemberNumber} `;if(input.value.length-(input.selectionStart-mentionStart)+token.length>1000)return;input.setRangeText(token,mentionStart,input.selectionStart,'end');input.dispatchEvent(new window.Event('input',{bubbles:true}));mentionList.hidden=true;input.focus();});mentionList.append(choice);
      }
      mentionList.hidden=!mentionList.childElementCount;
      mentionList.firstElementChild?.setAttribute('aria-selected','true');
    };
    input.addEventListener('input',()=>{if(!composing)refreshMentions();});
    input.addEventListener('keydown',event=>{
      if(mentionList.hidden||event.isComposing||composing)return;
      const choices=Array.from(mentionList.querySelectorAll<HTMLButtonElement>('button'));
      if(event.key==='Escape'){mentionList.hidden=true;event.preventDefault();event.stopImmediatePropagation();}
      else if(['ArrowDown','ArrowUp','Enter'].includes(event.key)){
        event.preventDefault();event.stopImmediatePropagation();
        if(event.key==='Enter'){choices[mentionIndex]?.click();return;}
        mentionIndex=(mentionIndex+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;
        choices.forEach((choice,index)=>choice.setAttribute('aria-selected',String(index===mentionIndex)));choices[mentionIndex]?.scrollIntoView?.({block:'nearest'});
      }
    });
    input.addEventListener('compositionstart',()=>{composing=true;mentionList.hidden=true;});
    input.addEventListener('compositionend',()=>{composing=false;refreshMentions();});
    input.addEventListener('click',refreshMentions);
    input.addEventListener('focus',refreshMentions);
    input.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))refreshMentions();});
    input.addEventListener('blur',event=>{if(event.relatedTarget && !mentionList.contains(event.relatedTarget as Node))mentionList.hidden=true;});

 return mentionList;
}
