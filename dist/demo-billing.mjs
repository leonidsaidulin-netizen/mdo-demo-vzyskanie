import {TODAY,allocate,changeStage,total} from './model.mjs';
import {initializeCases,currentCase,createCase,selectCase,amount,unassigned} from './cases.mjs';
import {billingPeriod,billingParts,billingLines,refreshMonthly,validateBilling} from './billing.mjs';
import {saveAgreement,saveLegal,markInstallment,audit} from './operations.mjs';
export const DEMO_COMPANY='УК «Учебная»';
export function installOwnerExample(state){
  if(state.rows.some(r=>r.id==='ДОЛИ-001'))return false;
  const r=fixture('ДОЛИ-001','Учебная, 10',12,[['2026-09',1000000,20000]],'Без дела');
  r.owners=[{id:'share-a',name:'Собственник А',share:50},{id:'share-b',name:'Собственник Б',share:50}];
  state.rows.push(r);return true;
}
const file=(id,name,text,kind)=>({id,name,kind,size:new TextEncoder().encode(text).length,data:`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`});
const contract=(house)=>file(`contract-${house}`,`Демо-договор ${house}.txt`,`УЧЕБНЫЙ ДОКУМЕНТ. Договор управления: ${DEMO_COMPANY}, ${house}. Не является договором с реальными лицами.`,'contract');
function fixture(id,house,flat,months,stage,departed=false){
  const lines=months.flatMap(([month,value,penalty=0])=>[
    {id:`${id}-${month}-1`,month,service:'Содержание',formula:'50 м² × 40 ₽ (учебный тариф)',charged:200000,paid:0,penalty,penaltyPaid:0},
    {id:`${id}-${month}-2`,month,service:'Водоснабжение (учебное)',formula:`${(value-200000)/10000} м³ × 100 ₽ (учебный тариф)`,charged:value-200000,paid:0,penalty:0,penaltyPaid:0}
  ]);
  const parts=billingParts(lines),r={id,account:id,company:DEMO_COMPANY,building:house,flat,entrance:'1',...parts,age:90,stage:'Без дела',caseId:null,claim:null,source:'Учебный биллинг',sourceId:'demo-billing-v1',category:'Первичная просрочка',owner:'Юрист',asOf:TODAY,phone:true,email:true,app:true,max:true,disputed:false,unallocated:0,promise:null,nextDate:TODAY,next:'Подготовить уведомление',period:billingPeriod(lines),events:[],payments:[],houseStatus:departed?'departed':'active',contractEnd:departed?'2026-09-30':null,billing:{area:50,lines,source:'Учебный биллинг',asOf:TODAY,applied:[]}};
  initializeCases(r,true);r.owners=[{name:`Учебный собственник ${flat}`,share:100}];refreshMonthly(r);
  if(stage!=='Без дела'){createCase(r,r.period,unassigned(r));if(stage==='Приказ'){r.fee=200000;currentCase(r).remaining.fee=200000;changeStage(r,'Приказ');currentCase(r).documents.push(file(`${id}-order`,'Демо-судебный приказ.txt','УЧЕБНЫЙ ПРИКАЗ. Реквизиты и суммы предназначены только для демонстрации.','order'));saveLegal(r,{number:`ДЕМО-${id}`,date:TODAY,status:'Получен документ',next:'Предъявить документ в ФССП или банк',nextDate:TODAY});}}
  return r;
}
export function installDemoBilling(state){
  if(state.demoBillingVersion)return installStageExamples(state);
  const rows=[fixture('УЧ-001','Учебная, 10',1,[['2026-07',540000,10000],['2026-08',540000,10000],['2026-09',540000,10000]],'Без дела'),fixture('УЧ-002','Учебная, 10',2,[['2026-08',480000,10000],['2026-09',480000,10000]],'Уведомление'),fixture('УЧ-003','Учебная, 20',3,[['2026-09',339258]],'Приказ',true),fixture('УЧ-004','Учебная, 20',4,[['2026-09',210000]],'Без дела',true)];
  const old=rows.at(-1),fresh=structuredClone(old);fresh.id=fresh.account='УЧ-005';fresh.principal=0;fresh.age=0;fresh.period='Задолженности нет';fresh.billing.lines=[];fresh.owners=[{name:'Новый учебный собственник 4',share:100}];fresh.ownerHistory=[{name:old.owners[0].name,account:old.account,reason:'Смена собственника. Долг остался на прежнем ЛС.'}];refreshMonthly(fresh);rows.push(fresh);
  if(rows.some(x=>state.rows.some(r=>r.id===x.id)))throw Error('Учебные ЛС уже существуют без версии набора');
  state.rows.push(...rows);state.houseDocuments||={};
  for(const house of ['Учебная, 10','Учебная, 20']){const key=JSON.stringify([DEMO_COMPANY,house]);state.houseDocuments[key]||=[{...contract(house),house:true}];}
  state.demoBillingVersion=1;rows.forEach(validateBilling);installStageExamples(state);return true;
}
function installStageExamples(state){
  if(state.demoBillingVersion>=2)return false;
  const agreement=fixture('УЧ-006','Учебная, 10',6,[['2026-09',500000,10000]],'Уведомление');
  demoEvent(state,agreement,'agreement');
  currentCase(agreement).agreement.date='2026-10-20';
  for(const event of agreement.events)event.at='2026-10-20T12:00:00';
  const claim=fixture('УЧ-007','Учебная, 10',7,[['2026-08',600000,20000]],'Уведомление');
  changeStage(claim,'Иск');saveLegal(claim,{number:'ДЕМО-ИСК-007',date:'2026-10-20',status:'Иск подготовлен',next:'Проверить заявление и приложения',nextDate:'2026-10-30'});
  const execution=fixture('УЧ-008','Учебная, 10',8,[['2026-09',700000,15000]],'Приказ');
  demoEvent(state,execution,'execution');
  const closed=fixture('УЧ-009','Учебная, 10',9,[['2026-09',300000,5000]],'Приказ');
  demoEvent(state,closed,'fullPayment');changeStage(closed,'Завершено','Полностью погашено по учебной выписке');
  const extra=[agreement,claim,execution,closed];
  if(extra.some(x=>state.rows.some(r=>r.id===x.id)))throw Error('Учебные ЛС новой версии уже существуют');
  for(const r of extra){currentCase(r).createdAt='2026-10-10';currentCase(r).stageEnteredAt=['УЧ-008','УЧ-009'].includes(r.id)?TODAY:'2026-10-20';validateBilling(r);}
  // Additive migration: do not reset user actions in the original five examples.
  state.rows.push(...extra);state.demoBillingVersion=2;return true;
}
export function demoEvent(state,r,kind){
  const before=structuredClone(r);
  try{return applyDemoEvent(state,r,kind);}
  catch(error){for(const key of Object.keys(r))if(!(key in before))delete r[key];Object.assign(r,before);throw error;}
}
function applyDemoEvent(state,r,kind){
  if(!r.billing||r.company!==DEMO_COMPANY)throw Error('Действие доступно только учебным ЛС');
  const c=currentCase(r);const id=`${kind}:${c?.id||'free'}`;
  if(r.billing.applied.includes(id))throw Error('Это учебное событие уже учтено');
  if(kind==='newMonth'){
    if(r.houseStatus==='departed')throw Error('После окончания договора новые начисления не создаются');
    if(r.billing.lines.some(x=>x.month==='2026-10'))throw Error('Октябрь уже начислен');
    r.billing.lines.push({id:`${r.id}-2026-10`,month:'2026-10',service:'Содержание',formula:'50 м² × 40 ₽ (учебный тариф)',charged:200000,paid:0,penalty:0,penaltyPaid:0});
    r.principal+=200000;r.period=billingPeriod(r.billing.lines);r.age=Math.max(r.age,1);r.noticeEpoch++;refreshMonthly(r);if(c?.stage==='Завершено')selectCase(r,null);audit(r,'Получены новые начисления','Октябрь: 2 000 ₽. Старое требование не изменено.');
  }else if(kind==='agreement'){
    if(!c||!['Уведомление','Соглашение'].includes(c.stage)||amount(c.remaining)<=0)throw Error('Выберите непогашенное досудебное дело');
    const sum=amount(c.remaining);c.documents.push(file(`${c.id}-signed`,'Учебное подписанное соглашение.txt','УЧЕБНЫЙ ПРИМЕР: соглашение и две части платежа. Не является реальной подписью.','agreement'));
    const half=Math.floor(sum/2);saveAgreement(r,`ДЕМО-${r.account}`,TODAY,[{date:'2026-10-29',amount:half},{date:'2026-11-15',amount:sum-half}]);
  }else if(kind==='execution'){
    if(!c||c.stage!=='Приказ')throw Error('Выберите дело с судебным приказом');
    c.documents.push(file(`${c.id}-exec`,'Учебное предъявление в банк.txt','УЧЕБНЫЙ ДОКУМЕНТ. Передача в банк только имитируется.','enforcement'));
    changeStage(r,'Приставы');saveLegal(r,{number:`БАНК-${r.account}`,date:TODAY,status:'Передано в банк (демо)',next:'Проверить поступления из банка',nextDate:'2026-11-05'});
  }else if(kind==='fullPayment'||kind==='halfPayment'){
    const balance=c?.remaining||unassigned(r);if(amount(balance)<=0)throw Error('Выбранный долг уже погашен');
    const parts=kind==='fullPayment'?{...balance}:{principal:Math.floor(balance.principal/2),penalty:Math.floor(balance.penalty/2),fee:balance.fee};
    allocate(r,amount(parts),parts,c?.id||null);r.payments[0].source='Учебная выписка';r.payments[0].externalId=id;
    const installment=c?.schedule?.findIndex(s=>!s.paid&&s.amount===amount(parts));
    if(installment>=0)markInstallment(r,installment,[0]);
  }else throw Error('Неизвестное учебное событие');
  r.billing.applied.push(id);validateBilling(r);return total(r);
}
