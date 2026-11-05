import {initializeCases,currentCase,createCase,unassigned,amount,COMPONENTS,noticeScope,currentNotices,workRecord,stagePortions} from './cases.mjs';
import {ownerPayment} from './ownership.mjs';
import {billingLines,billingPeriod,payBilling} from './billing.mjs';
export const TODAY = '2026-10-29';
export const STAGES = ['Без дела', 'Уведомление', 'Соглашение', 'Приказ', 'Иск', 'Приставы', 'Завершено', 'Суд: уточнить'];
export const canonicalStage = stage => ({'Досудебная работа':'Уведомление','Суд':'Приказ','Исполнение':'Приставы'}[stage] || stage);
export const CATEGORIES = ['Не назначена', 'Первичная просрочка', 'Повторная задолженность', 'Обещание оплаты', 'Оспаривает долг'];
export const ACTIONS = {app:'Уведомление в МП',email:'Письмо на email',max:'Сообщение в MAX',receipt:'Квитанция + претензия',robot:'Обзвон роботом',notice:'Печатное уведомление',court:'Судебный документ',case:'Создать дело',task:'Назначить задачу'};
export const OUTCOMES = ['Доставлено (демо)','Нет ответа (демо)','Обещана оплата (демо)'];
export const money = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(n / 100);
export const total = r => r.principal + r.penalty + r.fee;
export const days = (date, today=TODAY) => Math.floor((Date.parse(today) - Date.parse(date)) / 86400000);
export const copy = value => structuredClone(value);
export function seed(){
  const rows = [
    ['1001','Солнечная, 12',12,4520000,126500,0,126,'Без дела','РЦ МДО','Первичная просрочка'],
    ['1002','Солнечная, 12',28,1834000,45000,0,65,'Досудебная работа','РЦ МДО','Обещание оплаты'],
    ['1003','Солнечная, 12',41,339258,0,200000,148,'Суд','РЦ МДО','Повторная задолженность'],
    ['1004','Солнечная, 12',8,0,0,0,0,'Исполнение','РЦ МДО','Повторная задолженность'],
    ['2001','Парковая, 7',16,7620000,215000,200000,238,'Исполнение','Импорт 1С','Повторная задолженность'],
    ['2002','Парковая, 7',32,1240000,28000,0,44,'Без дела','Импорт 1С','Первичная просрочка'],
    ['2003','Парковая, 7',7,3185000,97000,0,98,'Соглашение','Импорт 1С','Обещание оплаты'],
    ['2004','Парковая, 7',21,5640000,163000,0,180,'Досудебная работа','Импорт 1С','Оспаривает долг'],
    ['3001','Мира, 24',5,2156000,64000,0,87,'Без дела','РЦ МДО','Первичная просрочка'],
    ['3002','Мира, 24',19,6810000,184000,200000,211,'Суд','РЦ МДО','Повторная задолженность'],
    ['3003','Мира, 24',33,890000,0,0,32,'Досудебная работа','РЦ МДО','Первичная просрочка'],
    ['3004','Мира, 24',54,4180000,115000,0,136,'Соглашение','РЦ МДО','Обещание оплаты'],
    ['4001','Речная, 3',9,940000,0,0,35,'Без дела','Импорт CSV','Первичная просрочка'],
    ['4002','Речная, 3',18,2675000,76500,0,103,'Без дела','Импорт CSV','Не назначена'],
    ['4003','Речная, 3',27,4890000,142000,200000,190,'Исполнение','Импорт CSV','Повторная задолженность'],
    ['4004','Речная, 3',36,0,0,0,0,'Завершено','Импорт CSV','Первичная просрочка']
  ].map((a,i)=>{
    const [account,building,flat,principal,penalty,fee,age,stage,source,category]=a;
    const r={id:account,account,company:i<8?'УК «Демо-квартал»':'УК «Демо-парк»',building,flat,principal,penalty,fee,age,stage,source,sourceId:source,category,owner:i%3===0?'А. Соколова':'М. Орлова',asOf:i===13?'2026-10-12':TODAY,phone:i!==5,app:i%3!==1,email:i%4!==2,disputed:i===7,unallocated:i===8?1000000:0,promise:i===1?'2026-10-25':i===6?'2026-11-02':null,nextDate: i===1?'2026-10-25':'2026-10-29',next:'Проверить оплату',period:'01.06.2026 — 30.09.2026',events:[],payments:[],caseId:stage==='Без дела'?null:`ВЗ-${230+i}`,claim:null};
    if(age>0){const from=new Date(Date.parse(TODAY)-age*86400000).toISOString().slice(0,10);r.period=`${from.slice(8,10)}.${from.slice(5,7)}.${from.slice(0,4)} — 30.09.2026`;}
    if(['Суд','Исполнение','Завершено'].includes(stage))r.claim={amount:principal+penalty+fee || 450000,period:r.period,registered:'2026-10-05'};
    if(i===9){r.claim.amount-=600000;r.claim.period='01.06.2026 — 31.08.2026';}
    if(i===1||i===2||i===6)r.events.push({id:`seed-${i}`,at:'2026-10-20T10:00:00',action:i===2?'court':'app',label:i===2?'Судебный документ':'Уведомление в МП',status:'Доставлено (демо)',note:i===2?'Копия судебного документа; отметка не подтверждает юридическое вручение.':'Напоминание об оплате',amount:total(r)});
    r.stage=canonicalStage(r.stage);r.entrance=String(Math.ceil(Number(flat)/20));r.max=i%3===0;
    if(i===9)r.stage='Иск';
    // Historical demo receipts are already included in the opening balances.
    if([1,2,9].includes(i)){
      const amount=i===1?500000:i===2?200000:1000000;
      const paidFee=i===9?200000:0;
      r.payments.push({at:'2026-10-23',amount,principal:amount-paidFee,penalty:0,fee:paidFee,stage:r.stage,afterNotice:i===1});
      if(r.claim)r.claim.amount+=amount;
    }
    initializeCases(r,true);
    if(['4001','1002'].includes(account)){
      r.owners=[{name:`Учебный собственник ЛС ${account}`,share:100}];
      r.charges=[{month:'2026-09',area:50,formula:'Учебный реестр: перенос долга за предыдущие месяцы',opening:principal,charges:0,payments:0,closing:principal}];
    }
    if(i===9)r.cases[0].remaining.principal-=600000;
    for(const e of r.events){e.scope=noticeScope(r);e.caseId=r.caseId;}
    for(const p of r.payments)p.scope=noticeScope(r);
    return r;
  });
  return {version:1,rows,imports:[],updated:TODAY};
}
export function recommendation(r){
  if(!r._caseView)r=workRecord(r);
  if(r.reviewTask?.status==='open')return {key:'waiting',label:'Ждём уточнения от бухгалтера',detail:`${r.reviewTask.reason} · срок ${r.reviewTask.due}`,action:'review',tone:'amber'};
  if(r.caseBalanceConflict)return {key:'caseBalance',label:'Уточнить долг по делу',detail:'Не подтверждено, сколько осталось погасить по каждому делу. Нужен ответ бухгалтера.',action:'review',tone:'amber'};
  if(r.unallocated>0)return {key:'reconcile',label:'Разнести поступление',detail:`Поступило ${money(r.unallocated)}. Остаток не подтверждён до сверки.`,action:'payment',tone:'amber'};
  if(days(r.asOf)>7)return {key:'stale',label:'Обновить остаток',detail:`Данные на ${r.asOf}. Массовые уведомления приостановлены.`,action:'source',tone:'amber'};
  if(total(r)===0)return {key:r.stage==='Завершено'||!r.caseId?'done':'close',label:r.stage==='Завершено'?'Дело завершено':r.caseId?'Проверить закрытие дела':'Нет задолженности',detail:'Задолженности нет. Уведомления не нужны.',action:'close',tone:'green'};
  if(r.disputed)return {key:'dispute',label:'Проверить возражения',detail:'Долг оспаривается. Сначала сверка с бухгалтерией.',action:'task',tone:'amber'};
  const c=currentCase(r);
  if(c&&c.stage!=='Завершено'&&amount(c.remaining)===0)return {key:'close',label:'Завершить оплаченное дело',detail:'Остаток этого дела погашен; новый долг остаётся отдельно.',action:'close',tone:'green'};
  if(r.task?.status==='open')return {key:r.task.due<TODAY?'overdueTask':'task',label:r.task.text,detail:`${r.task.due} · ${r.task.owner}`,action:'taskDone',tone:r.task.due<TODAY?'red':'neutral'};
  if(c?.stage==='Соглашение'){
    const due=c.schedule?.filter(x=>!x.paid).sort((a,b)=>a.date.localeCompare(b.date))[0];
    if(!c.agreement||!due)return {key:'agreement',label:'Заполнить соглашение и график',detail:'Нет подтверждённого графика платежей.',action:'legal',tone:'amber'};
    return {key:due.date<TODAY?'overdueAgreement':'agreementDue',label:due.date<TODAY?'Платёж по графику просрочен':'Проверить платёж по графику',detail:`${due.date} · ${money(due.amount)}`,action:'legal',tone:due.date<TODAY?'red':'neutral'};
  }
  if(r.promise && r.promise<TODAY)return {key:'overdue',label:'Обещание просрочено',detail:`Оплата ожидалась ${r.promise}. Проверить остаток и связаться.`,action:'robot',tone:'red'};
  if(r.promise && r.promise>=TODAY)return {key:'promise',label:'Контроль обещанной оплаты',detail:`Ожидаем оплату ${r.promise}. Следующий шаг: проверить поступление.`,action:'task',tone:'green'};
  const notices=currentNotices(r).filter(e=>c?e.caseId===c.id:!e.caseId);
  if(['Без дела','Уведомление','Завершено'].includes(r.stage)&&!notices.length)return {key:'new',label:'Подготовить уведомление',detail:`Просрочка ${r.age} дн. Выбрать доступный канал.`,action:'channels',tone:'pink'};
  if(notices.some(e=>e.status==='Подготовлено (демо)'))return {key:'delivery',label:'Зафиксировать результат уведомления',detail:'Подготовка не подтверждает доставку.',action:'history',tone:'neutral'};
  if(notices.some(e=>e.status==='Нет ответа (демо)')&&!notices.some(e=>e.status==='Доставлено (демо)'))return {key:'retryContact',label:'Связаться другим каналом',detail:'Ответ не получен по текущему периоду долга.',action:'channels',tone:'amber'};
  const next={'Уведомление':'Проверить доставку и оплату','Соглашение':'Проверить платёж по графику','Приказ':'Проверить результат по приказу','Иск':'Проверить движение иска','Приставы':'Сверить поступления по производству','Суд: уточнить':'Уточнить вид судебного дела'};
  return {key:'follow',label:next[r.stage]||r.next,detail:`Следующий контроль: ${c?.legal?.nextDate||r.nextDate}`,action:['Приказ','Иск','Приставы','Суд: уточнить'].includes(r.stage)?'legal':'task',tone:'neutral'};
}
export function upgradeUntouchedSampleDetails(state){
  if(state.imports?.length)return false;
  let changed=false;
  for(const original of seed().rows.filter(r=>['4001','1002'].includes(r.id))){
    const r=state.rows.find(x=>x.id===original.id);
    if(!r||['company','building','flat','source','principal','penalty','fee','asOf'].some(k=>r[k]!==original[k])||r.events.some(e=>!String(e.id).startsWith('seed-')))continue;
    for(const key of ['owners','charges'])if(!r[key]?.length){r[key]=structuredClone(original[key]);changed=true;}
  }
  return changed;
}
export function filterRows(rows,f={}){
  if(f.maxAge!==undefined&&f.maxAge!=='')rows=rows.filter(r=>r.age<=Number(f.maxAge));
  if(f.stage){rows=rows.filter(r=>stagePortions(r).some(x=>x.stage===f.stage));f={...f,stage:''};}
  return rows.filter(r=>(!f.search||[r.account,r.building,r.company,r.caseId].join(' ').toLowerCase().includes(f.search.toLowerCase()))&&(!f.building||r.building===f.building)&&(!f.entrance||r.entrance===f.entrance)&&(!f.minDebt||total(r)>=Number(f.minDebt)*100)&&(!f.maxDebt||total(r)<=Number(f.maxDebt)*100)&&(!f.company||r.company===f.company)&&(!f.owner||r.owner===f.owner)&&(!f.stage||r.stage===f.stage)&&(!f.category||r.category===f.category)&&(!f.minAge||r.age>=Number(f.minAge))&&(!f.segment|| (f.segment==='attention'?['reconcile','stale','overdue','dispute','close'].includes(recommendation(r).key):f.segment==='new'?r.stage==='Без дела':f.segment==='court'?['Приказ','Иск'].includes(r.stage):true)));
}
export function eligible(r,action){
  if(!ACTIONS[action])return 'Неизвестное действие';
  if(action==='task')return '';
  if(r.reviewTask?.status==='open')return 'Ждём уточнения от бухгалтера';
  if(r.caseBalanceConflict)return 'Нужно уточнить долг по делам';
  if(total(r)<=0)return 'Долг погашен';
  if(r.unallocated>0)return 'Есть неразнесённая оплата';
  if(days(r.asOf)>7)return 'Устаревший остаток';
  if(r.disputed)return 'Долг оспаривается';
  if(action==='case' && r.caseId)return 'Дело уже существует';
  if(action==='robot'&&!r.phone)return 'Нет телефона';
  if(action==='app'&&!r.app)return 'Нет МП';
  if(action==='email'&&!r.email)return 'Нет email';
  if(action==='max'&&!r.max)return 'Нет связи с MAX';
  if(action==='court'&&!['Приказ','Иск','Приставы'].includes(r.stage))return 'Нет судебного этапа';
  if(r.events.some(e=>e.action===action&&e.scope===noticeScope(r)&&e.at.startsWith(TODAY)&&!e.status.startsWith('Отменено:')))return 'Уже запланировано сегодня';
  return '';
}
export function plan(rows,ids,action){return rows.filter(r=>ids.includes(r.id)).map(r=>({id:r.id,reason:eligible(r,action),amount:total(r)}));}
export function execute(state,ids,action,details={}){
  const preview=plan(state.rows,ids,action);
  for(const p of preview.filter(p=>!p.reason)){
    const r=state.rows.find(x=>x.id===p.id);
    const period=r.billing?billingPeriod(billingLines(r)):r.period;
    if(['app','email','max','receipt','robot','notice'].includes(action)&&!r.cases.some(c=>c.stage==='Уведомление')&&amount(unassigned(r))>0){createCase(r,period,unassigned(r));}
    if(action==='case'){initializeCases(r);createCase(r,period,unassigned(r));r.next='Подготовить уведомление';}
    if(action==='task'){r.next=details.note||'Проверить данные';r.nextDate=details.date||TODAY;if(details.owner)r.owner=details.owner;r.task={text:r.next,due:r.nextDate,owner:r.owner,status:'open'};}
    const status=action==='case'||action==='task'?'Выполнено в демо':'Подготовлено (демо)';
    r.events.unshift({id:crypto.randomUUID(),action,label:ACTIONS[action],at:`${TODAY}T12:00:00`,status,scope:noticeScope(r),caseId:r.caseId,amount:total(r),note:details.note||'',date:details.date||TODAY});
  }
  return preview;
}
export function allocate(r,payment,allocation,caseId=r.caseId,meta={}){
  const paidAt=meta.date||TODAY,source=String(meta.source||'Учебное поступление').trim(),reference=String(meta.reference||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)||!Number.isFinite(Date.parse(paidAt))||new Date(paidAt).toISOString().slice(0,10)!==paidAt||paidAt>TODAY)throw Error('Укажите корректную дату оплаты не позже даты демо');
  if(!source)throw Error('Укажите источник оплаты');
  if(reference&&r.payments.some(p=>p.source===source&&p.reference===reference))throw Error('Это поступление уже учтено: источник и номер совпадают');
  if(!Number.isSafeInteger(payment)||payment<=0)throw Error('Введите положительную сумму поступления');
  const keys=['principal','penalty','fee'];
  if(keys.some(k=>!Number.isSafeInteger(allocation[k])||allocation[k]<0||allocation[k]>r[k]))throw Error('Разнесение не может превышать остаток компонента');
  if(keys.reduce((s,k)=>s+allocation[k],0)!==payment)throw Error('Сумма разнесения должна равняться поступлению');
  if(r.unallocated && payment!==r.unallocated)throw Error('Сверьте полную сумму неразнесённого поступления');
  if(r.caseBalanceConflict)throw Error('Сначала уточните долг по делам');
  const target=caseId?r.cases?.find(c=>c.id===caseId):null;
  if(caseId&&!target)throw Error('Дело платежа не найдено');
  const remaining=target?.remaining||unassigned(r);
  if(keys.some(k=>allocation[k]>remaining[k]))throw Error('Платёж превышает остаток выбранного дела или долга вне дел');
  const debtor=ownerPayment(target,allocation,meta.ownerId);
  if(!target&&r.owners?.length>1)throw Error('Сначала создайте дело и выберите собственника');
  payBilling(r,allocation,caseId);
  if(debtor)for(const k of keys)debtor.remaining[k]-=allocation[k];
  if(target)for(const k of keys)target.remaining[k]-=allocation[k];
  for(const k of keys)r[k]-=allocation[k];
  r.unallocated=0;r.lastPaymentAt=[r.lastPaymentAt||'',paidAt].sort().at(-1);
  const afterNotice=currentNotices(r).some(e=>e.caseId===(caseId||null)&&['Доставлено (демо)','Обещана оплата (демо)'].includes(e.status)&&(e.completedAt||e.at.slice(0,10))<paidAt);
  // A late-entered payment does not establish the historical stage or refresh the source snapshot.
  r.payments.unshift({id:crypto.randomUUID(),at:paidAt,recordedAt:TODAY,source,reference,ownerId:debtor?.id,ownerName:debtor?.name,amount:payment,...allocation,caseId:caseId||null,scope:noticeScope(r),stage:paidAt===TODAY?(target?.stage||'Без дела'):null,afterNotice});
  r.events.unshift({id:crypto.randomUUID(),at:`${TODAY}T12:00:00`,action:'payment',label:'Оплата разнесена',status:'Учтено в демо',amount:payment,note:`Долг ${money(allocation.principal)}, пени ${money(allocation.penalty)}, пошлина ${money(allocation.fee)}`});
  invalidatePending(r);
}
function invalidatePending(r){
  for(const e of r.events)if(e.status==='Подготовлено (демо)')e.status=total(r)===0?'Отменено: долг погашен':'Отменено: остаток изменился';
  if(total(r)===0){r.age=0;r.promise=null;r.next=r.caseId?'Проверить закрытие дела':'Оплата учтена';r.nextDate=TODAY;}
}
export function changeStage(r,stage,reason='Погашение подтверждено сотрудником'){
  stage=canonicalStage(stage);
  if(!STAGES.includes(stage)||stage==='Без дела')throw Error('Недопустимая стадия');
  if(!r.caseId)throw Error('Сначала создайте дело');
  const c=currentCase(r);
  if(stage==='Приставы'&&(c.legal?.status==='Отменён приказ'||!c.documents?.some(d=>!d.archived&&(c.stage==='Приставы'?['order','enforcement'].includes(d.kind):d.kind===(c.stage==='Иск'?'enforcement':'order')))))throw Error('Сначала приложите действующий исполнительный документ');
  if(stage==='Завершено' && (r.caseBalanceConflict||amount(c?.remaining||r)>0))throw Error('Есть непогашенный остаток дела: требуется сверка');
  if(stage==='Завершено'&&!reason.trim())throw Error('Укажите основание завершения');
  if(['Приказ','Иск'].includes(stage)&&!r.claim)r.claim={amount:amount(c?.remaining||r),period:c?.period||r.period,registered:TODAY,components:{...c.remaining},calculation:r.billing?structuredClone(billingLines(r,c.id)):undefined};
  r.stage=stage;
  if(c){if(c.stage!==stage)c.stageEnteredAt=TODAY;c.stage=stage;c.claim=r.claim;if(stage==='Завершено')c.closedReason=reason;}
  r.stageNeedsReview=false;
  r.events.unshift({id:crypto.randomUUID(),at:`${TODAY}T12:00:00`,action:'stage',label:`Стадия: ${stage}`,status:'Учтено в демо',note:['Приказ','Иск'].includes(stage)?'Сумма и период требования зафиксированы.':''});
}
export const CSV_FIELDS=['source_id','company','account','building','flat','as_of','period','principal','penalty','fee','age_days'];
export function cents(value){if(!/^\d+(?:[.,]\d{1,2})?$/.test(String(value).trim()))throw Error('Сумма должна быть неотрицательной, до 2 знаков');const result=Math.round(Number(String(value).replace(',','.'))*100);if(!Number.isSafeInteger(result))throw Error('Сумма слишком велика');return result;}
export function completeCommunication(r,eventId,outcome,nextDate){
  const event=r.events.find(e=>e.id===eventId);
  if(!event||!['Подготовлено (демо)','Отправлено (демо)','Сформировано для печати (демо)'].includes(event.status))throw Error('Действие уже завершено или отменено');
  if(event.scope!==noticeScope(r))throw Error('Уведомление относится к предыдущему периоду долга');
  if(event.date>TODAY)throw Error('Дата запланированного действия ещё не наступила');
  if(!OUTCOMES.includes(outcome))throw Error('Выберите результат');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(nextDate||'')||!Number.isFinite(Date.parse(nextDate))||nextDate<TODAY)throw Error('Укажите дату следующего действия');
  if(total(r)<=0||r.unallocated>0||r.disputed||days(r.asOf)>7)throw Error('Сначала проверьте актуальный остаток');
  event.status=outcome;event.completedAt=TODAY;
  r.next=outcome.startsWith('Нет ответа')?'Связаться другим каналом':outcome.startsWith('Обещана')?'Проверить обещанную оплату':'Проверить оплату после уведомления';r.nextDate=nextDate;
  if(outcome.startsWith('Обещана')){r.promise=nextDate;r.category='Обещание оплаты';}
}
export function previewImport(state,input){
  const seen=new Set();
  return input.map((x,i)=>{
    const errors=[];let amounts={};
    for(const k of CSV_FIELDS)if(x[k]===undefined||String(x[k]).trim()==='')errors.push(`Не заполнено ${k}`);
    for(const k of ['principal','penalty','fee']){try{amounts[k]=cents(x[k]);}catch(e){errors.push(`${k}: ${e.message}`);}}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(x.as_of||'')||!Number.isFinite(Date.parse(x.as_of))||new Date(x.as_of).toISOString().slice(0,10)!==x.as_of||x.as_of>TODAY)errors.push('Некорректная или будущая дата');
    if(!/^\d+$/.test(x.age_days||''))errors.push('age_days: нужны целые дни');
    const key=[x.source_id,x.company,x.account].join('|');
    if(seen.has(key))errors.push('Дубль лицевого счёта в файле');seen.add(key);
    const existing=state.rows.find(r=>r.sourceId===x.source_id&&r.company===x.company&&r.account===x.account);
    if(!existing&&state.rows.some(r=>r.company===x.company&&r.account===x.account))errors.push('ЛС уже существует с другим источником: требуется сопоставление');
    if(existing&&x.as_of<existing.asOf)errors.push('Срез старее текущего');
    if(existing&&existing.lastPaymentAt && x.as_of<=existing.lastPaymentAt)errors.push('После этого среза разнесена оплата: нужна сверка');
    if(existing&&existing.unallocated>0)errors.push('Есть неразнесённая оплата: сначала сверка');
    const same=existing&&x.as_of===existing.asOf&&['principal','penalty','fee'].every(k=>existing[k]===amounts[k])&&x.period===existing.period&&Number(x.age_days)===existing.age&&x.building===existing.building&&String(x.flat)===String(existing.flat);
    if(existing&&x.as_of===existing.asOf&&!same)errors.push('На эту дату уже есть другой остаток');
    return {row:i+2,input:x,amounts,existingId:existing?.id,errors,status:errors.length?'error':same?'skip':existing?'update':'new'};
  });
}
export function applyImport(state,preview){
  if(preview.some(p=>p.errors.length))throw Error('Исправьте ошибки всего файла перед импортом');
  let changed=0;
  for(const p of preview.filter(p=>p.status!=='skip')){
    const x=p.input;let r=state.rows.find(r=>r.id===p.existingId);
    if(!r){r={id:crypto.randomUUID(),account:x.account,company:x.company,sourceId:x.source_id,source:x.source_id,stage:'Без дела',caseId:null,claim:null,category:'Не назначена',owner:'Не назначен',phone:false,email:false,app:false,unallocated:0,disputed:false,events:[],payments:[],next:'Проверить данные',nextDate:TODAY};state.rows.push(r);}
    initializeCases(r);
    const newScope=r.period!==x.period||amount(p.amounts)>total(r);
    if(newScope){r.noticeEpoch++;r.promise=null;}
    if(r.charges.length&&r.principal!==p.amounts.principal){r.chargesArchive||=[];r.chargesArchive.push({asOf:r.asOf,rows:r.charges});r.charges=[];}
    if(r.cases.some(c=>c.stage!=='Завершено')&&COMPONENTS.some(k=>p.amounts[k]!==r[k]))r.caseBalanceConflict=true;
    Object.assign(r,p.amounts,{building:x.building,flat:x.flat,asOf:x.as_of,period:x.period,age:Number(x.age_days),entrance:x.entrance||r.entrance||''});
    invalidatePending(r);
    r.events.unshift({id:crypto.randomUUID(),at:`${TODAY}T12:00:00`,action:'import',label:'Остаток обновлён',status:'Учтено в демо',amount:total(r),note:`Источник: ${x.source_id}`});changed++;
  }
  state.imports.unshift({at:TODAY,changed,skipped:preview.length-changed});return changed;
}
