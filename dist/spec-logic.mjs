import {TODAY,days,total,changeStage,seed} from './model.mjs';
import {unassigned,amount,currentCase,selectCase,createCase} from './cases.mjs';
import {billingLines,billingPeriod} from './billing.mjs';
import {audit,dateValid} from './operations.mjs';

const period=s=>{const m=String(s||'').match(/^(\d{2})\.(\d{2})\.(\d{4})\s*[—–-]\s*(\d{2})\.(\d{2})\.(\d{4})$/);if(!m)return null;const a=`${m[3]}-${m[2]}-${m[1]}`,b=`${m[6]}-${m[5]}-${m[4]}`;return dateValid(a)&&dateValid(b)&&a<=b?[a,b]:null;};
export function installSpecExamples(state){
  if(state.specExamplesVersion)return false;
  for(const [id,conflict] of [['ПОВТОР-001',false],['СВЕРКА-001',true]]){
    if(state.rows.some(r=>r.id===id))continue;
    const r={...seed().rows[0],id,account:id,company:'УК «Учебная»',building:'Учебная, 30',flat:conflict?2:1,source:'Учебный реестр',sourceId:'spec-examples',asOf:TODAY,period:'01.09.2026 — 30.09.2026',principal:800000,penalty:0,fee:0,cases:[],caseId:null,claim:null,unallocated:0,caseBalanceConflict:false,disputed:false,events:[],payments:[],owners:[{name:'Учебный собственник',share:100}],charges:[]};
    createCase(r,r.period,unassigned(r));r.principal=1000000;r.period='01.10.2026 — 31.10.2026';selectCase(r,null);r.caseBalanceConflict=conflict;state.rows.push(r);
  }
  state.specExamplesVersion=1;return true;
}
export function outsidePeriod(r){return r.billing?billingPeriod(billingLines(r)):r.period;}
export function repeatSignature(r){return JSON.stringify([outsidePeriod(r),unassigned(r),r.cases.map(c=>[c.id,c.period])]);}
export function noCaseAssessment(r){
  const free=unassigned(r),sum=amount(free),previous=r.cases||[];
  const distribution=detail=>({key:'caseBalance',label:'Запросить у расчётчика распределение',detail:detail+(r.reviewTask?.status==='open'?` Запрос уже отправлен: ${r.reviewTask.reason}; срок ${r.reviewTask.due}.`:''),action:r.reviewTask?.status==='open'?'reviewStatus':'review',tone:'amber'});
  if(r.caseBalanceConflict||Object.values(free).some(x=>x<0))return distribution('Не подтверждено, какая часть долга уже в делах, а какая остаётся вне дел.');
  if(sum<=0)return null;
  const current=period(outsidePeriod(r));
  if(previous.length&&(!current||previous.some(c=>{const p=period(c.period);return !p||current[0]<=p[1]&&p[0]<=current[1];})))return distribution('Период долга пересекается с существующим делом или не установлен. Нельзя предъявлять одну сумму повторно.');
  const blockers=[r.reviewTask?.status==='open'?`Ожидается ответ расчётчика: ${r.reviewTask.reason}`:'',r.unallocated>0?'Поступившая оплата ещё не учтена':'',days(r.asOf)>7?'Нет актуального остатка из биллинга':'',r.disputed?'Сумма оспаривается':'',!current?'Период долга не подтверждён':''].filter(Boolean);
  if(blockers.length)return {key:'blocked',label:'',detail:blockers.join('; '),action:'data',tone:'amber',blocked:true};
  if(previous.length&&r.repeatDebtReview!==repeatSignature(r))return {key:'repeatDebt',label:'Сверить. Повторный долг на ЛС',detail:`Новый период: ${outsidePeriod(r)}. Прежних дел: ${previous.length}. Сверьте периоды перед уведомлением.`,action:'repeatReview',tone:'amber'};
  return {key:'new',label:'Подготовить уведомление',detail:`Подтверждённый долг вне дел за ${outsidePeriod(r)}.`,action:'channels',tone:'pink'};
}
export function confirmRepeat(r){const a=noCaseAssessment(r);if(a?.key!=='repeatDebt')throw Error('Нет подтверждённого отдельного повторного долга');r.repeatDebtReview=repeatSignature(r);audit(r,'Повторный долг проверен',outsidePeriod(r));}
export function caseWork(c){
  if(c.stage==='Завершено')return {label:'Завершено',due:null};
  const open=(c.reminders||[]).filter(t=>t.status==='open').sort((a,b)=>a.due.localeCompare(b.due)),dates=[...open.map(t=>t.due),c.communicationNextDate,c.legal?.nextDate,c.stage==='Соглашение'?c.schedule?.filter(x=>!x.paid).sort((a,b)=>a.date.localeCompare(b.date))[0]?.date:null].filter(Boolean).sort();
  const due=dates[0];return {label:!due?'Следующий шаг не назначен':due<TODAY?'Просрочено':due===TODAY?'Сегодня':'Запланировано',due,reminder:open[0]};
}
export function saveReminder(r,cid,text,due){const c=r.cases.find(c=>c.id===cid);if(!c||c.stage==='Завершено')throw Error('Выберите действующее дело');if(!text?.trim()||!dateValid(due)||due<TODAY)throw Error('Укажите действие и дату не раньше даты кабинета');c.reminders||=[];c.reminders.push({id:crypto.randomUUID(),text:text.trim(),due,status:'open',owner:r.owner,created:TODAY});audit(r,'Напоминание по делу',`${c.id}: ${text.trim()} / ${due}`);}
export function closeReminder(r,cid,id){const t=r.cases.find(c=>c.id===cid)?.reminders?.find(t=>t.id===id);if(!t||t.status!=='open')throw Error('Напоминание не найдено');t.status='done';t.completed=TODAY;audit(r,'Напоминание выполнено',t.text);}
export const MANUAL_STAGES=['Уведомление','Соглашение','Приказ','Иск','Приставы','Завершено'];
export function moveCases(rows,targets,stage,reason){
  if(!MANUAL_STAGES.includes(stage)||!reason?.trim()||!targets.length)throw Error('Выберите дела, стадию и основание');
  const copy=structuredClone(rows),unique=[...new Set(targets.map(x=>JSON.stringify(x)))];
  for(const key of unique){const [rid,cid]=JSON.parse(key),r=copy.find(r=>r.id===rid),c=r?.cases.find(c=>c.id===cid);if(!c||c.stage==='Завершено'||c.stage===stage)throw Error('Выберите действующее дело на другой стадии');selectCase(r,cid);
    if(stage==='Приставы'&&(c.legal?.status==='Отменён приказ'||!c.documents?.some(d=>!d.archived&&['order','enforcement'].includes(d.kind))))throw Error('Для исполнения нужен действующий исполнительный документ');
    if(stage==='Завершено'&&!c.balanceConfirmed)throw Error('Для завершения нужен подтверждённый остаток дела');
    const old=c.stage;changeStage(r,stage,reason);c.stageHistory||=[];c.stageHistory.push({stage:old,at:TODAY,reason});c.legalHistory||=[];if(c.legal?.status)c.legalHistory.push({...c.legal,ended:TODAY});c.legal={};c.packageRevisionNeeded=false;c.manualStatus=null;
    audit(r,'Перенос дела',`${c.id}: ${old} → ${stage}. ${reason}`);
  }
  return copy;
}
