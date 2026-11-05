import {prepareNotificationCases,previewNotificationBatch,confirmNotificationBatch,previewEnforcement,confirmEnforcement,notificationMessage,NOTIFICATION_CHANNELS} from './interaction-flow.mjs';
import {esc} from './workspace-views.mjs';
import {receiptPages} from './workspace-views.mjs';
export function installInteractions({getState,getRole,modal,save,render,close,toast,openDrawer}){
  let pending=null,targets=[],index=0;
  const $=s=>document.querySelector(s);
  function notify(nextTargets,channels=['app'],selectedIndex=0,prepared=false){
    if(getRole()!=='lawyer')throw Error('Уведомления отправляет юрист');
    if(!prepared){
      const copy=structuredClone(getState().rows);
      nextTargets=prepareNotificationCases(copy,nextTargets);
      for(const [id] of nextTargets)Object.assign(getState().rows.find(r=>r.id===id),copy.find(r=>r.id===id));
      save();render();
    }
    targets=nextTargets;index=selectedIndex;
    const p=previewNotificationBatch(getState().rows,targets,channels);pending={kind:'notification',p};
    const allowed=p.items.filter(x=>!x.reason),item=p.items[index]||p.items[0];
    const selectedRow=item&&p.copies.find(r=>r.id===item.id),selectedCase=selectedRow?.cases.find(c=>c.id===item.caseId);
    modal('Уведомить о задолженности',`К отправке / печати: ${allowed.length} · недоступно: ${p.items.length-allowed.length}`,
      `<fieldset class="channel-choices"><legend>Каналы уведомления</legend><label><input type="checkbox" id="allNotificationChannels" ${channels.length===Object.keys(NOTIFICATION_CHANNELS).length?'checked':''}> Все каналы</label>${Object.entries(NOTIFICATION_CHANNELS).map(([k,l])=>`<label><input type="checkbox" data-notification-channel="${k}" ${channels.includes(k)?'checked':''}> ${l}</label>`).join('')}</fieldset>
      <div class="delivery-list">${p.items.map((x,i)=>`<button class="delivery-item ${i===index?'active':''}" data-flow-preview="${i}"><strong>${esc(NOTIFICATION_CHANNELS[x.channel])} · ЛС ${esc(x.account)}</strong><small>${esc(x.address)} · ${esc(x.reason||'Готово к отправке / печати')}</small></button>`).join('')}</div>
      ${item?.doc?`<h3>${item.channel==='robot'?'Сценарий обзвона':item.channel==='notice'||item.channel==='receipt'?'Печатный документ':'Текст уведомления'} · ЛС ${esc(item.account)}</h3><pre class="document-preview">${esc(notificationMessage(item,item.channel))}</pre>`:'<p>Выберите каналы. Недоступные отправки будут пропущены с указанной причиной.</p>'}
      ${item?.channel==='receipt'&&selectedCase?receiptPages({...selectedRow,...selectedCase.remaining,period:selectedCase.period}):''}
      <p class="form-note">Уведомление о долге, не весь пакет дела. Отправка, печать и доставка учитываются отдельно. Только тестовые получатели.</p><div id="flowError"></div>`,
      `<button class="button" data-flow-confirm ${!allowed.length?'disabled':''}>Выполнить в демо: ${allowed.length}</button>`);
  }
  function enforcement(id,recipient='bank'){
    if(getRole()!=='lawyer')throw Error('Документы отправляет юрист');
    const r=getState().rows.find(r=>r.id===id),p=previewEnforcement(r,recipient);pending={kind:'enforcement',p};
    modal('Предъявить исполнительный документ',`ЛС ${r.account} · ${p.caseId}`,
      `<label>Куда предъявить<select id="enforcementRecipient"><option value="bank" ${recipient==='bank'?'selected':''}>Банк (демо)</option><option value="fssp" ${recipient==='fssp'?'selected':''}>ФССП (демо)</option></select></label><h3>Готовое заявление</h3><pre class="document-preview">${esc(p.draft.text)}</pre><p>Полученный исполнительный документ уже приложен к делу. Его не создаёт система. Принятие адресатом пока не подтверждено.</p><div id="flowError"></div>`,
      '<button class="button" data-flow-confirm>Предъявить в демо</button>');
  }
  document.addEventListener('change',e=>{try{if(e.target.dataset.notificationChannel||e.target.id==='allNotificationChannels'){
    const channels=e.target.id==='allNotificationChannels'?(e.target.checked?Object.keys(NOTIFICATION_CHANNELS):[]):[...document.querySelectorAll('[data-notification-channel]:checked')].map(el=>el.dataset.notificationChannel);
    notify(targets,channels,0,true);
  }if(e.target.id==='enforcementRecipient')enforcement(pending.p.id,e.target.value);}catch(err){toast(err.message);}});
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-flow-confirm],[data-flow-preview]');if(!b)return;
    try{
      if(b.dataset.flowPreview!==undefined)return notify(targets,pending.p.channels,Number(b.dataset.flowPreview),true);
      if(getRole()!=='lawyer')throw Error('Нужна роль юриста');
      if(pending.kind==='notification'){const first=pending.p.items.find(x=>!x.reason),n=confirmNotificationBatch(getState().rows,pending.p);save();close();render();if(first)openDrawer(first.id);toast(`Выполнено в демо: ${n}. Доставка не подтверждена.`);}
      else {const r=getState().rows.find(r=>r.id===pending.p.id);confirmEnforcement(r,pending.p);save();close();render();openDrawer(r.id);toast('Заявление сохранено. Дело передано на этап исполнения (демо).');}
      pending=null;
    }catch(err){$('#flowError').innerHTML=`<div class="error" role="alert">${esc(err.message)}</div>`;}
  });
  return {notify,enforcement};
}
