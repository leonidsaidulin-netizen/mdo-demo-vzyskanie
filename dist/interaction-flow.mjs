import {TODAY,ACTIONS,eligible,changeStage,money} from './model.mjs';
import {currentCase,createCase,selectCase,unassigned,amount,noticeScope} from './cases.mjs';
import {billingLines,billingPeriod} from './billing.mjs';
import {ensureDocument,documentStatus,draftDocument,saveDraft} from './documents.mjs';
import {noCaseAssessment} from './spec-logic.mjs';

export const NOTIFICATION_CHANNELS={app:'Мобильное приложение',email:'Email',max:'MAX',robot:'Голосовой робот',notice:'Печать',receipt:'В квитанции'};
export function notificationMessage(item,channel){
  if(!item.doc)return '';
  if(['notice','receipt'].includes(channel))return item.doc.text;
  const d=item.doc.data;
  const text=`${d.company}. Лицевой счёт ${d.account}. По данным на ${d.date} задолженность за ${d.period}: ${money(d.remaining)}. За услуги ${money(d.principal)}, пени ${money(d.penalty)}, госпошлина ${money(d.fee)}. Если уже оплатили или не согласны с расчётом, сообщите в управляющую компанию.`;
  return channel==='robot'?`Учебный сценарий: сначала убедиться, что отвечает владелец лицевого счёта.\nПосле подтверждения: ${text}\nУточнить, когда планируется оплата или нужна ли связь с сотрудником.`:text;
}
// Preview operates on copies. Confirmation rejects stale data before any write.
export function previewNotifications(rows,targets,channel='app'){
  if(!NOTIFICATION_CHANNELS[channel])throw Error('Выберите канал уведомления');
  const originals={},copies={},items=[];
  for(const key of [...new Set(targets.map(t=>JSON.stringify(t)))]){
    const [id,caseId]=JSON.parse(key),source=rows.find(r=>r.id===id);
    if(!source)throw Error('Лицевой счёт не найден');
    originals[id]??=JSON.stringify(source);copies[id]??=structuredClone(source);
    const r=structuredClone(copies[id]);let reason='',doc;
    try{
      selectCase(r,caseId||null);
      if(caseId&&currentCase(r).stage!=='Уведомление')throw Error('Уведомление о долге доступно на досудебном этапе');
      const matching=r.events.filter(e=>e.caseId===caseId&&e.status!=='Подготовлено (демо)');
      reason=eligible({...r,events:matching},channel);if(reason)throw Error(reason);
      if(!caseId){const a=noCaseAssessment(r);if(!a||a.key!=='new')throw Error(a?.detail||'Долга вне дел нет');}
      if(!caseId)createCase(r,r.billing?billingPeriod(billingLines(r)):r.period,unassigned(r));
      if(amount(currentCase(r).remaining)<=0)throw Error('По делу нет задолженности');
      doc=ensureDocument(r,channel==='receipt'?'demand':'notice');
      if(doc.missing.length)throw Error('Нужно дополнить: '+doc.missing.join('; '));
    }catch(error){reason=error.message;}
    if(!reason)copies[id]=r;
    items.push({id,caseId:currentCase(r)?.id||null,account:r.account,address:`${r.building}, кв. ${r.flat}`,reason,doc});
  }
  return {channel,items,originals,copies};
}
export function previewNotificationBatch(rows,targets,channels){
  const selected=[...new Set(channels)];
  if(selected.some(c=>!NOTIFICATION_CHANNELS[c]))throw Error('Неизвестный канал');
  const copies=structuredClone(rows),originals={},items=[],resolved=new Map();
  for(const [id] of targets){const r=rows.find(r=>r.id===id);if(!r)throw Error('Лицевой счёт не найден');originals[id]=JSON.stringify(r);}
  for(const channel of selected){
    const actual=targets.map(([id,cid])=>[id,cid||resolved.get(id)||null]);
    const p=previewNotifications(copies,actual,channel);
    confirmNotifications(copies,p);
    for(const item of p.items){items.push({...item,channel});if(!item.reason)resolved.set(item.id,item.caseId);}
  }
  return {channels:selected,items,originals,copies};
}
export function confirmNotificationBatch(rows,p){
  for(const [id,snapshot] of Object.entries(p.originals))if(JSON.stringify(rows.find(r=>r.id===id))!==snapshot)throw Error('Данные изменились. Откройте предпросмотр заново.');
  const allowed=p.items.filter(x=>!x.reason);
  for(const id of new Set(allowed.map(x=>x.id)))Object.assign(rows.find(r=>r.id===id),p.copies.find(r=>r.id===id));
  return allowed.length;
}
export function confirmNotifications(rows,preview){
  for(const [id,snapshot] of Object.entries(preview.originals))if(JSON.stringify(rows.find(r=>r.id===id))!==snapshot)throw Error('Данные изменились. Откройте предпросмотр заново.');
  const changed=new Set();let n=0;
  for(const item of preview.items.filter(x=>!x.reason)){
    const r=preview.copies[item.id];selectCase(r,item.caseId);
    const d=currentCase(r).drafts.find(d=>d.id===item.doc.id);
    if(d.status!=='sent'){documentStatus(r,d.id,'prepared');documentStatus(r,d.id,'sent');}
    for(const e of r.events)if(e.caseId===item.caseId&&e.action===preview.channel&&e.status==='Подготовлено (демо)')e.status='Заменено отправкой (демо)';
    const print=['notice','receipt'].includes(preview.channel);
    r.events.unshift({id:crypto.randomUUID(),caseId:item.caseId,documentId:d.id,action:preview.channel,label:ACTIONS[preview.channel],scope:noticeScope(r),at:`${TODAY}T12:00:00`,date:TODAY,status:print?'Сформировано для печати (демо)':'Отправлено (демо)',amount:amount(currentCase(r).remaining),message:notificationMessage(item,preview.channel),note:'Учебное действие. Доставка и вручение не подтверждены.'});
    r.next=print?'Распечатать и зафиксировать вручение':'Проверить доставку и оплату';r.nextDate=TODAY;
    currentCase(r).communicationNextDate=TODAY;
    changed.add(item.id);n++;
  }
  for(const id of changed)Object.assign(rows.find(r=>r.id===id),preview.copies[id]);
  return n;
}
export function previewEnforcement(r,recipient='bank'){
  if(!['bank','fssp'].includes(recipient))throw Error('Выберите банк или ФССП');
  const c=currentCase(r);
  if(c?.legal?.status==='Отменён приказ')throw Error('Отменённый приказ нельзя предъявить к исполнению');
  if(!['Приказ','Иск','Приставы'].includes(c?.stage)||!c.documents.some(d=>!d.archived&&(c.stage==='Приставы'?['order','enforcement'].includes(d.kind):d.kind===(c.stage==='Приказ'?'order':'enforcement'))))throw Error('Сначала приложите полученный исполнительный документ');
  if(c.stage==='Приставы'&&c.legal?.status!=='Возвращён документ')throw Error('Документ уже предъявлен; сначала зафиксируйте его возврат');
  const blocked=eligible({...r,events:[]},'court');if(blocked)throw Error(blocked);
  if(amount(c.remaining)<=0)throw Error('Долг по делу погашен');
  const draft=draftDocument(r,'enforcementApplication');
  draft.data.recipient=recipient;
  draft.text=draft.text.replace('Адресат: Учебный банк.',`Адресат: ${recipient==='bank'?'Учебный банк':'Учебное отделение ФССП'}.`);
  if(draft.missing.length)throw Error('Нужно дополнить: '+draft.missing.join('; '));
  return {id:r.id,caseId:c.id,recipient,snapshot:JSON.stringify(r),draft};
}
export function confirmEnforcement(r,p){
  if(JSON.stringify(r)!==p.snapshot)throw Error('Данные изменились. Повторите предпросмотр.');
  const copy=structuredClone(r),c=currentCase(copy),doc=saveDraft(copy,p.draft,p.draft.text);
  documentStatus(copy,doc.id,'prepared');documentStatus(copy,doc.id,'sent');
  if(c.legal?.status)(c.legalHistory??=[]).push({...c.legal,stage:c.stage});
  changeStage(copy,'Приставы');
  c.legal={...c.legal,note:'Принятие адресатом пока не подтверждено.',recipient:p.recipient,status:`Предъявлено ${p.recipient==='bank'?'в банк':'в ФССП'} (демо)`,next:'Проверить принятие исполнительного документа',nextDate:TODAY};
  copy.task=null;copy.next=c.legal.next;copy.nextDate=TODAY;
  copy.events.unshift({id:crypto.randomUUID(),at:`${TODAY}T12:00:00`,action:'court',caseId:c.id,documentId:doc.id,label:c.legal.status,status:'Отправлено (демо)',note:'Заявление сформировано из данных дела. Внешняя отправка отключена.'});
  Object.assign(r,copy);return doc;
}
