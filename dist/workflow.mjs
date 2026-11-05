import {STAGES,canonicalStage,total,recommendation,TODAY,days} from './model.mjs';
import {currentNotices,initializeCases,currentCase,workRecord,stagePortions} from './cases.mjs';

export const CHANNELS=['app','email','max','receipt','robot','notice'];
export const STAGE_INFO={
  'Суд: уточнить':{title:'Суд: уточнить вид дела',meaning:'В старой версии приказ и иск были объединены. По сохранённым данным вид производства неизвестен.',next:'Проверить документы и выбрать приказ или иск.'},
  'Без дела':{title:'Ещё без дела',meaning:'Долг есть, работа по взысканию ещё не оформлена.',next:'Проверить остаток и подготовить первое уведомление.'},
  'Уведомление':{title:'Уведомление о долге',meaning:'Досудебная связь с жителем. Подготовка, отправка и доставка учитываются отдельно.',next:'Выбрать должников и канал связи; затем проверить доставку и оплату.'},
  'Соглашение':{title:'Соглашение об оплате',meaning:'Условия рассрочки, подписание и контроль графика. Предложение и подписанное соглашение учитываются отдельно.',next:'Проверить подписанный документ, дату ближайшего платежа и выполнение графика.'},
  'Приказ':{title:'Судебный приказ',meaning:'Работа по заявлению о выдаче судебного приказа: подготовка, подача и результат суда.',next:'Проверить расчёт и документы; зафиксировать подачу, выдачу или отмену приказа.'},
  'Иск':{title:'Исковое производство',meaning:'Рассмотрение требования в исковом порядке, например после отмены приказа.',next:'Подготовить иск и доказательства, контролировать заседание и решение.'},
  'Приставы':{title:'Исполнение: приставы или банк',meaning:'Учёт предъявленного исполнительного документа. Получатель (банк или ФССП), реквизиты и результат указаны в карточке дела.',next:'Проверить получателя документа, поступившие суммы и остаток.'},
  'Завершено':{title:'Завершённые дела',meaning:'Работа по конкретному делу закрыта с зафиксированным основанием.',next:'Сохранить историю и документы. Новый долг не добавлять к старому требованию.'}
};
export const NOTICE_LABELS={none:'Уведомлений нет',prepared:'Подготовлено, не отправлено',sent:'Отправлено, ждём результат',print:'Ожидает печати / вручения',delivered:'Есть отметка доставки',noanswer:'Нет ответа'};
export function notificationState(r){
  const events=currentNotices(r);
  if(events.some(e=>['Доставлено (демо)','Обещана оплата (демо)'].includes(e.status)))return 'delivered';
  if(events.some(e=>e.status==='Отправлено (демо)'))return 'sent';
  if(events.some(e=>e.status==='Сформировано для печати (демо)'))return 'print';
  if(events.some(e=>e.status==='Подготовлено (демо)'))return 'prepared';
  if(events.some(e=>e.status==='Нет ответа (демо)'))return 'noanswer';
  return 'none';
}
export const QUEUES={notify:'Уведомить',follow:'Проверить оплату / доставку',overdue:'Просроченные действия',check:'Уточнить долг',waiting:'Ждём уточнения от бухгалтера',legal:'Работа по делу',paid:'Завершить дело'};
export function queueFor(r){
  r=workRecord(r);
  if(r.reviewTask?.status==='open')return 'waiting';
  if(r.caseBalanceConflict||r.unallocated>0||days(r.asOf)>7||r.disputed)return 'check';
  const rec=recommendation(r);
  if(rec.key==='done')return '';
  if(rec.key==='close')return 'paid';
  if(['overdue','overdueTask','overdueAgreement'].includes(rec.key)||(r.task?.status==='open'&&r.task.due<TODAY))return 'overdue';
  if(['Без дела','Уведомление','Завершено'].includes(r.stage)&&total(r)>0&&['none','noanswer'].includes(notificationState(r))&&!r.promise)return 'notify';
  if(['Соглашение','Приказ','Иск','Приставы','Суд: уточнить'].includes(r.stage))return 'legal';
  return 'follow';
}
export function workRows(rows,{notice='',queue='',debtOnly=false}={}){
  // Stage and notification are independent dimensions, never inferred from a click.
  return rows.filter(r=>(!debtOnly||total(r)>0)&&(!notice||notificationState(r)===notice)&&(!queue||queueFor(r)===queue)).sort((a,b)=>{
    const date=r=>r.reviewTask?.due||r.task?.due||r.promise||currentCase(r)?.legal?.nextDate||r.nextDate;
    return (date(a)||'9999').localeCompare(date(b)||'9999')||total(b)-total(a);
  });
}
export function migrate(state){
  for(const r of state.rows){
    if(r.stage==='Суд'){r.stageNeedsReview=true;r.stage='Суд: уточнить';}
    r.stage=canonicalStage(r.stage);
    initializeCases(r);
    for(const c of r.cases)c.stage=canonicalStage(c.stage);
    // Unknown historical payment stages remain unknown, not the current case stage.
    for(const p of r.payments)if(p.stage)p.stage=p.stage==='Суд'?'Суд: уточнить':canonicalStage(p.stage);
  }
  return state;
}
export function summary(rows){
  const debtors=rows.filter(r=>total(r)>0);
  const portions=r=>stagePortions(r).filter(x=>x.id||x.amount>0);
  return {amount:debtors.reduce((s,r)=>s+total(r),0),accounts:debtors.length,
    premises:new Set(debtors.map(r=>[r.company,r.building,r.flat].join('|'))).size,
    stages:STAGES.map(stage=>({stage,count:rows.filter(r=>portions(r).some(x=>x.stage===stage)).length,caseCount:rows.reduce((s,r)=>s+portions(r).filter(x=>x.stage===stage).length,0),amount:rows.reduce((s,r)=>s+portions(r).filter(x=>x.stage===stage).reduce((a,x)=>a+x.amount,0),0)})),
    notices:Object.fromEntries(Object.keys(NOTICE_LABELS).map(k=>[k,debtors.filter(r=>notificationState(r)===k).length]))};
}
export function paymentReport(rows,from,to){
  const records=rows.flatMap(r=>r.payments.filter(p=>p.at.slice(0,10)>=from&&p.at.slice(0,10)<=to).map(p=>({r,p})));
  const group=list=>({accounts:new Set(list.map(x=>x.r.id)).size,amount:list.reduce((s,x)=>s+x.p.amount,0),principal:list.reduce((s,x)=>s+(x.p.principal||0),0),penalty:list.reduce((s,x)=>s+(x.p.penalty||0),0),fee:list.reduce((s,x)=>s+x.p.fee,0),records:list});
  const notified=rows.map(r=>({r,dates:r.events.filter(e=>CHANNELS.includes(e.action)&&['Доставлено (демо)','Обещана оплата (демо)'].includes(e.status)).map(e=>e.completedAt||e.at.slice(0,10)).filter(d=>d>=from&&d<=to).sort()})).filter(x=>x.dates.length);
  const cohortPayments=records.filter(({r,p})=>{const matching=r.events.filter(e=>CHANNELS.includes(e.action)&&['Доставлено (демо)','Обещана оплата (демо)'].includes(e.status)&&e.scope===p.scope).map(e=>e.completedAt||e.at.slice(0,10)).filter(d=>d>=from&&d<=to);const day=p.at.slice(0,10);return matching.some(d=>day>d||(day===d&&p.afterNotice===true));});
  const cohort={notified:new Set(notified.map(x=>x.r.id)).size,...group(cohortPayments)};
  return {all:group(records),afterNotice:group(records.filter(x=>x.p.afterNotice===true)),cohort,
    stages:[...STAGES,'Не зафиксирован'].map(stage=>({stage,...group(records.filter(x=>(x.p.stage||'Не зафиксирован')===stage))}))};
}
