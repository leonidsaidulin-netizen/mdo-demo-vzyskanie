import {assignBillingCase} from './billing.mjs';
import {assignOwners,splitMoney} from './ownership.mjs';
export const COMPONENTS=['principal','penalty','fee'];
export const amount = x => COMPONENTS.reduce((s,k)=>s+(x?.[k]||0),0);
export const currentCase = r => r.cases?.find(c=>c.id===r.caseId);
export const noticeScope = r => `${r.noticeEpoch||1}:${r.period}`;
export function currentNotices(r){return r.events.filter(e=>e.scope===noticeScope(r)&&['app','email','max','receipt','robot','notice'].includes(e.action)&&!e.status.startsWith('Отменено:'));}
export function initializeCases(r, trusted=false){
  r.noticeEpoch ||= 1;
  if(!r.cases){
    r.cases=r.caseId?[{id:r.caseId,stage:r.stage,period:r.claim?.period||r.period,claim:r.claim?structuredClone(r.claim):null,
      remaining:Object.fromEntries(COMPONENTS.map(k=>[k,r[k]])),balanceConfirmed:trusted,documents:[],legal:{},schedule:[],closedReason:''}]:[];
    if(!trusted&&r.cases.length)r.caseBalanceConflict=true;
  }
  r.documents ||= [];
  r.owners ||= [];
  r.charges ||= [];
  r.ownerHistory ||= [];
  return r;
}
export function unassigned(r){return Object.fromEntries(COMPONENTS.map(k=>[k,r[k]-(r.cases||[]).filter(c=>c.stage!=='Завершено').reduce((s,c)=>s+(c.remaining[k]||0),0)]));}
export function selectCase(r,id){
  if(!id){r.caseId=null;r.claim=null;r.stage='Без дела';return;}
  const c=r.cases.find(c=>c.id===id);if(!c)throw Error('Дело не найдено');
  r.caseId=c.id;r.claim=c.claim;r.stage=c.stage;
}
export function createCase(r,period,parts){
  if(r.caseBalanceConflict)throw Error('Сначала уточните долг по делам');
  if(r.unallocated>0||r.disputed||r.reviewTask?.status==='open'||Date.parse('2026-10-29')-Date.parse(r.asOf)>7*86400000)throw Error('Сначала завершите сверку лицевого счёта');
  const available=unassigned(r);
  if(!period?.trim()||COMPONENTS.some(k=>!Number.isSafeInteger(parts[k])||parts[k]<0||parts[k]>available[k])||amount(parts)<=0)throw Error('Укажите период и сумму в пределах долга вне дел');
  const c={id:`ВЗ-${crypto.randomUUID().slice(0,8)}`,stage:'Уведомление',createdAt:'2026-10-29',stageEnteredAt:'2026-10-29',period:period.trim(),remaining:{...parts},balanceConfirmed:true,claim:null,documents:[],legal:{},schedule:[],closedReason:''};
  if(r.owners?.length>1)assignOwners(r,c);
  assignBillingCase(r,c);
  r.cases.push(c);selectCase(r,c.id);return c;
}
export function createOwnerCases(r){
  const copy=structuredClone(r),base=createCase(copy,copy.period,unassigned(copy));
  if(!base.ownerBalances&&copy.owners.length)assignOwners(copy,base);
  if(!base.ownerBalances?.length)throw Error('Сначала заполните собственников и доли');
  const cases=base.ownerBalances.map(o=>({...structuredClone(base),id:`ВЗ-${crypto.randomUUID().slice(0,8)}`,remaining:{...o.remaining},ownerBalances:[structuredClone(o)]}));
  if(copy.billing){
    copy.billing.lines=copy.billing.lines.flatMap(line=>{
      if(line.caseId!==base.id)return [line];
      const owners=base.ownerBalances,paid=splitMoney(line.paid,owners),due=splitMoney(line.charged-line.paid,owners),pp=splitMoney(line.penaltyPaid||0,owners),pd=splitMoney((line.penalty||0)-(line.penaltyPaid||0),owners);
      return cases.map((c,i)=>({...line,id:`${line.id}:${i}`,caseId:c.id,paid:paid[i],charged:paid[i]+due[i],penaltyPaid:pp[i],penalty:pp[i]+pd[i]}));
    });
    // Line-level rounding is authoritative for each owner's billing-backed case.
    for(const c of cases){c.calculation=structuredClone(copy.billing.lines.filter(l=>l.caseId===c.id));c.remaining.principal=c.calculation.reduce((s,l)=>s+l.charged-l.paid,0);c.remaining.penalty=c.calculation.reduce((s,l)=>s+l.penalty-l.penaltyPaid,0);c.ownerBalances[0].remaining={...c.remaining};c.ownerBalances[0].initial={...c.remaining};}
  }
  copy.cases=copy.cases.filter(c=>c.id!==base.id).concat(cases);selectCase(copy,cases[0].id);Object.assign(r,copy);return cases;
}
export function workRecord(r){
  const choices=(r.cases||[]).filter(c=>c.stage!=='Завершено').map(c=>({c,rank:amount(c.remaining)===0?0:c.schedule?.some(x=>!x.paid&&x.date<'2026-10-29')?1:c.legal?.nextDate<'2026-10-29'?1:c.stage==='Уведомление'?3:4}));
  if(amount(unassigned(r))>0)choices.push({c:null,rank:2});
  choices.sort((a,b)=>a.rank-b.rank);
  if(!choices.length)return {...r,_caseView:true};
  const c=choices[0].c;
  return {...r,caseId:c?.id||null,claim:c?.claim||null,stage:c?.stage||'Без дела',_caseView:true};
}
export function stagePortions(r){
  const parts=(r.cases||[]).map(c=>({stage:c.stage,amount:amount(c.remaining),id:c.id}));
  const rest=amount(unassigned(r));
  if(rest>0||!parts.length)parts.push({stage:'Без дела',amount:Math.max(rest,0),id:null});
  return parts;
}
export function reconcileCases(r,balances){
  if(balances.length!==r.cases.length||new Set(balances.map(b=>b.id)).size!==balances.length)throw Error('Нужны остатки каждого дела');
  for(const b of balances){const c=r.cases.find(c=>c.id===b.id);if(!c||COMPONENTS.some(k=>!Number.isSafeInteger(b[k])||b[k]<0)||(c.stage==='Завершено'&&amount(b)>0))throw Error('Проверьте остатки дел');}
  if(COMPONENTS.some(k=>balances.reduce((s,b)=>s+b[k],0)>r[k]))throw Error('Сумма дел превышает остаток ЛС');
  for(const b of balances){const c=r.cases.find(c=>c.id===b.id);c.remaining=Object.fromEntries(COMPONENTS.map(k=>[k,b[k]]));c.balanceConfirmed=true;}
  r.caseBalanceConflict=false;
}
