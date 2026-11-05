import {TODAY,days,total,cents} from './model.mjs';
import {currentCase,amount} from './cases.mjs';
export function dateValid(x){return /^\d{4}-\d{2}-\d{2}$/.test(x||'')&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;}
export function audit(r,label,note){r.events.unshift({id:crypto.randomUUID(),at:`${TODAY}T12:00:00`,action:'work',label,status:'Учтено в демо',note,caseId:r.caseId});}
export function requestReview(r,due,reason){
  if(!dateValid(due)||due<TODAY||!reason.trim())throw Error('Укажите причину и срок сверки');
  if(r.reviewTask?.status==='open')throw Error('Запрос уже передан бухгалтерии');
  r.reviewTask={due,reason:reason.trim(),status:'open',owner:'Бухгалтерия'};audit(r,'Передано бухгалтерии',reason);
}
export function resolveReview(r,note){
  if(!note.trim())throw Error('Опишите результат сверки');
  if(!r.reviewTask||r.reviewTask.status!=='open')throw Error('Нет открытого запроса');
  if(r.caseBalanceConflict||r.unallocated>0||days(r.asOf)>7||r.disputed)throw Error('Сначала устраните причину: оплата, остатки дел, спор или устаревший реестр');
  r.reviewTask.status='done';r.reviewTask.result=note; audit(r,'Сверка завершена',note);
}
export function saveLegal(r,input){
  const c=currentCase(r);if(!c)throw Error('Сначала создайте дело');
  if(!input.number.trim()||!dateValid(input.date)||input.date>TODAY||!dateValid(input.nextDate)||input.nextDate<TODAY||!input.next.trim())throw Error('Укажите номер, дату документа, следующее действие и срок');
  c.legal={...c.legal,...input};r.next=input.next;r.nextDate=input.nextDate;
  r.task={text:input.next,due:input.nextDate,owner:r.owner,status:'open'};
  audit(r,'Реквизиты дела обновлены',`${input.number} · ${input.status}`);
}
export function saveAgreement(r,number,date,schedule){
  const c=currentCase(r);if(!c)throw Error('Сначала создайте дело');
  if(!number.trim()||!dateValid(date)||date>TODAY)throw Error('Укажите номер и дату соглашения');
  if(!schedule.length||schedule.some(s=>!dateValid(s.date)||s.date<date||!Number.isSafeInteger(s.amount)||s.amount<=0))throw Error('Проверьте даты и суммы графика');
  if(schedule.reduce((a,s)=>a+s.amount,0)!==amount(c.remaining))throw Error('График должен покрывать остаток выбранного дела');
  if(!c.documents.some(d=>d.kind==='agreement'&&!d.archived))throw Error('Прикрепите файл подписанного соглашения');
  c.agreement={number:number.trim(),date};c.schedule=schedule.sort((a,b)=>a.date.localeCompare(b.date));
  if(c.stage!=='Соглашение')c.stageEnteredAt=TODAY;
  c.stage='Соглашение';r.stage=c.stage;r.promise=null;r.task=null;
  audit(r,'Соглашение и график сохранены',number);
}
export function markInstallment(r,index,paymentIndexes){
  const c=currentCase(r),s=c?.schedule[index];if(!s||s.paid)throw Error('Платёж уже отмечен или не найден');
  const chosen=[...new Set(paymentIndexes)];
  if(!chosen.length||chosen.some(i=>!r.payments[i]||r.payments[i].caseId!==c.id))throw Error('Выберите учтённые платежи именно этого дела');
  if(c.schedule.some(x=>x.paid&&x.paymentIds?.some(id=>chosen.some(i=>r.payments[i].id===id))))throw Error('Поступление уже связано с другим платежом графика');
  if(chosen.reduce((sum,i)=>sum+r.payments[i].amount,0)!==s.amount)throw Error('Сумма поступлений должна совпасть с платежом графика');
  for(const i of chosen)r.payments[i].id ||= crypto.randomUUID();
  s.paid=true;s.paymentIds=chosen.map(i=>r.payments[i].id);audit(r,'Платёж графика подтверждён',s.date);
}
export function saveOwners(r,list){
  if(!list.length||list.some(o=>!o.name.trim()||!Number.isFinite(o.share)||o.share<=0||o.share>100)||Math.abs(list.reduce((s,o)=>s+o.share,0)-100)>0.001)throw Error('Укажите собственников; сумма долей должна быть 100%');
  r.owners=list;audit(r,'Собственники уточнены','Доли проверены');
}
export function validateMonthly(rows){
  const seen=new Set();
  return rows.map(x=>{
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(x.month)||seen.has(x.month))throw Error('Периоды: ГГГГ-ММ, без дублей');seen.add(x.month);
    const v={month:x.month,area:Number(x.area),formula:String(x.formula||'').trim(),opening:cents(x.opening),charges:cents(x.charges),payments:cents(x.payments),closing:cents(x.closing)};
    if(!Number.isFinite(v.area)||v.area<=0||!v.formula||v.opening+v.charges-v.payments!==v.closing)throw Error(`Проверьте площадь, формулу и баланс за ${x.month}`);
    return v;
  }).sort((a,b)=>a.month.localeCompare(b.month));
}
export function saveMonthly(r,input){
  const rows=validateMonthly(input);
  if(!rows.length||rows.at(-1).closing!==r.principal)throw Error('Итог основного долга должен совпадать с текущим реестром');
  for(let i=1;i<rows.length;i++)if(rows[i].opening!==rows[i-1].closing)throw Error('Начальный остаток не совпадает с предыдущим месяцем');
  r.charges=rows;audit(r,'Расчёт задолженности загружен',`${rows.length} месяцев; основной долг сверён`);
}
export function packetFiles(state,r){return [...(state.houseDocuments?.[JSON.stringify([r.company,r.building])]||[]),...(currentCase(r)?.documents||[])];}
