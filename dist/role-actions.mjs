import {recommendation,STAGES} from './model.mjs';
import {caseProgress} from './documents.mjs';

const requests={
  reconcile:'Запросить у расчётчика учёт поступившей оплаты',
  stale:'Запросить у расчётчика свежий остаток',
  caseBalance:'Запросить у расчётчика остатки по делам',
  dispute:'Запросить у расчётчика проверку спорной суммы'
};
function accountingAction(rec,role){
  if(rec.key==='waiting')return role==='lawyer'
    ?{label:'Посмотреть запрос расчётчику',action:'reviewStatus'}
    :{label:'Обработать запрос юриста',action:'resolve'};
  if(!requests[rec.key])return null;
  return role==='lawyer'?{label:requests[rec.key],action:'review'}
    :{label:rec.label,action:rec.key==='reconcile'?'payment':'resolve'};
}
export function roleRecommendation(r,role){
  const rec=recommendation(r),accounting=accountingAction(rec,role);
  if(accounting)return {...rec,...accounting};
  if(role==='accountant')return {...rec,label:'Открыть данные и расчёт',action:'data',detail:`Остаток на ${r.asOf}. Работа с начислениями и оплатами.`};
  return rec;
}
export function roleCaseProgress(c,r,role){
  const p=caseProgress(c,r);
  const rec=r&&recommendation({...r,caseId:c?.id||null,stage:c?.stage||'Без дела',_caseView:true});
  const accounting=rec&&accountingAction(rec,role);
  if(p.dataIssue&&accounting)return {...p,next:accounting.label,work:accounting.action};
  if(role==='accountant')return {...p,next:'Открыть данные и расчёт',work:'data'};
  return p;
}
export function visibleStages(rows){
  return STAGES.filter(stage=>stage!=='Суд: уточнить'||rows.some(r=>r.cases?.some(c=>c.stage===stage)));
}
