import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,TODAY} from '../dist/model.mjs';
import {createCase,unassigned,selectCase} from '../dist/cases.mjs';
import {noCaseAssessment,confirmRepeat,caseWork,saveReminder,closeReminder,moveCases,installSpecExamples} from '../dist/spec-logic.mjs';
import {dataPanel} from '../dist/workbench.mjs';
import {previewNotificationBatch} from '../dist/interaction-flow.mjs';
const fresh=()=>({...seed().rows[0],asOf:TODAY,period:'01.07.2026 — 31.07.2026',principal:800000,penalty:0,fee:0,caseId:null,cases:[],unallocated:0,caseBalanceConflict:false,disputed:false});
const existing=()=>{const r=fresh();createCase(r,r.period,unassigned(r));return r;};
test('illustrative examples are additive and idempotent',()=>{const state={rows:[fresh()]},before=JSON.stringify(state.rows[0]);assert.equal(installSpecExamples(state),true);assert.equal(state.rows.length,3);assert.equal(installSpecExamples(state),false);assert.equal(state.rows.length,3);assert.equal(JSON.stringify(state.rows[0]),before);assert.equal(noCaseAssessment(state.rows[1]).key,'repeatDebt');assert.equal(noCaseAssessment(state.rows[2]).key,'caseBalance');});
test('first debt, repeat debt, repeated snapshot and unknown allocation are distinct',()=>{
  const first=fresh();assert.equal(noCaseAssessment(first).key,'new');
  first.reviewTask={status:'open',reason:'Документы',due:TODAY};assert.equal(noCaseAssessment(first).key,'blocked');
  const r=existing();selectCase(r,null);assert.equal(noCaseAssessment(r),null,'same debt already fully in case');
  r.principal+=200000;r.period='01.08.2026 — 31.08.2026';assert.equal(noCaseAssessment(r).key,'repeatDebt');
  assert.ok(previewNotificationBatch([r],[[r.id,null]],['app']).items.every(i=>i.reason),'bulk cannot bypass repeat review');
  const old=JSON.stringify(r.cases);confirmRepeat(r);assert.equal(noCaseAssessment(r).key,'new');assert.equal(JSON.stringify(r.cases),old);
  r.principal+=100;assert.equal(noCaseAssessment(r).key,'repeatDebt','balance change requires new confirmation');
  r.caseBalanceConflict=true;assert.equal(noCaseAssessment(r).key,'caseBalance');
});
test('overlapping or missing periods cannot be labelled new debt',()=>{
  const r=existing();r.principal+=100;assert.equal(noCaseAssessment(r).key,'caseBalance');r.period='';assert.equal(noCaseAssessment(r).key,'caseBalance');
  const z=fresh();z.principal=0;assert.equal(noCaseAssessment(z),null);
  for(const fields of [{unallocated:1},{asOf:'2026-10-01'},{disputed:true}])assert.equal(noCaseAssessment({...fresh(),...fields}).key,'blocked');
});
test('reminders belong to the selected case, not another period of the same account',()=>{
  const r=existing(),one=r.caseId;r.principal+=200000;r.period='01.08.2026 — 31.08.2026';createCase(r,r.period,unassigned(r));const two=r.caseId;
  saveReminder(r,one,'Позвонить по июльскому долгу',TODAY);assert.equal(r.cases[1].reminders,undefined);assert.equal(caseWork(r.cases[0]).label,'Сегодня');
  assert.throws(()=>closeReminder(r,two,r.cases[0].reminders[0].id));closeReminder(r,one,r.cases[0].reminders[0].id);assert.equal(caseWork(r.cases[0]).label,'Следующий шаг не назначен');
  r.cases[0].reminders[0].status='open';r.cases[0].reminders[0].due='2026-10-28';assert.equal(caseWork(r.cases[0]).label,'Просрочено');
});
test('bulk moves are atomic and preserve debt, ownership and documents',()=>{
  const a=existing(),b=existing();b.id='second';a.cases[0].documents=[{id:'keep',kind:'notice'}];a.cases[0].ownerBalances=[{name:'Собственник',share:50}];
  const rows=[a,b],before=JSON.stringify(rows);assert.throws(()=>moveCases(rows,[[a.id,a.caseId],[b.id,'missing']],'Иск','Отказались'));assert.equal(JSON.stringify(rows),before);
  const next=moveCases(rows,[[a.id,a.caseId],[b.id,b.caseId]],'Иск','Решение юриста');assert.equal(JSON.stringify(rows),before);assert.equal(next[0].cases[0].stage,'Иск');assert.equal(next[0].cases[0].documents[0].id,'keep');assert.equal(next[0].cases[0].ownerBalances[0].share,50);assert.equal(next[0].principal,a.principal);
  assert.throws(()=>moveCases(rows,[[a.id,a.caseId]],'Приставы','Передать'));assert.throws(()=>moveCases(rows,[[a.id,a.caseId]],'Завершено','Закрыть'));
});
test('balance history is read-only and contains no formulas or penalty calculator',()=>{
  const r=fresh();r.charges=[{month:'2026-09',formula:'SECRET_FORMULA',charges:100,payments:0,closing:100}];const html=dataPanel(r);assert.match(html,/Начисления и оплаты из источника/);assert.doesNotMatch(html,/SECRET_FORMULA|data-work="monthly"|Загрузить расчёт|Площадь \/ формула/);
});
