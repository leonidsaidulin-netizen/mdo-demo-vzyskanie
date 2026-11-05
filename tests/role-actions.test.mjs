import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,TODAY} from '../dist/model.mjs';
import {migrate} from '../dist/workflow.mjs';
import {currentCase,createCase,unassigned} from '../dist/cases.mjs';
import {roleRecommendation,roleCaseProgress,visibleStages} from '../dist/role-actions.mjs';
import {nextAction,legalPanel} from '../dist/workbench.mjs';
const setup=()=>{const r=migrate(seed()).rows[0];r.asOf=TODAY;r.unallocated=0;r.caseBalanceConflict=false;r.disputed=false;r.reviewTask=null;createCase(r,r.period,unassigned(r));return r;};
test('unallocated receipt becomes a request for the lawyer and payment action for accountant',()=>{
 const r=setup();r.unallocated=500000;
 const a=roleRecommendation(r,'lawyer'),b=roleRecommendation(r,'accountant');
 assert.equal(a.action,'review');assert.equal(a.label,'Запросить у расчётчика учёт поступившей оплаты');
 assert.equal(b.action,'payment');assert.equal(b.label,'Разнести поступление');
 assert.match(nextAction(r,'lawyer'),/data-work="review"/);
 assert.doesNotMatch(nextAction(r,'lawyer'),/Разнести поступление/);
 assert.match(nextAction(r,'accountant'),/data-work="payment"/);
 const c=currentCase(r);assert.ok(c);
 assert.equal(roleCaseProgress(c,r,'lawyer').next,a.label);
 assert.equal(roleCaseProgress(c,r,'accountant').work,'payment');
 assert.match(legalPanel(r),/Запросить у расчётчика учёт поступившей оплаты/);
});
test('stale data, disputed balances and existing requests stay role-specific',()=>{
 for(const [field,value] of [['asOf','2026-01-01'],['caseBalanceConflict',true],['disputed',true],['reviewTask',{status:'open',reason:'Оплата',due:TODAY}]]){
   const r=setup();r[field]=value;
   assert.ok(['review','reviewStatus'].includes(roleRecommendation(r,'lawyer').action));
   assert.equal(roleRecommendation(r,'accountant').action,'resolve');
 }
});
test('accountant never receives legal next actions across stages',()=>{
 for(const stage of ['Уведомление','Соглашение','Приказ','Иск','Приставы','Завершено','Суд: уточнить']){
   const r=setup(),c=currentCase(r);c.stage=stage;r.stage=stage;c.balanceConfirmed=true;
   assert.equal(roleCaseProgress(c,r,'accountant').work,'data',stage);
   assert.match(nextAction(r,'accountant'),/data-work="data"/,stage);
   assert.notEqual(roleCaseProgress(c,r,'lawyer').work,'data',stage);
 }
});
test('legacy court stage is absent without matching cases and retained with one',()=>{
 const rows=[{cases:[]}];assert.ok(!visibleStages(rows).includes('Суд: уточнить'));
 rows[0].cases.push({stage:'Суд: уточнить'});assert.ok(visibleStages(rows).includes('Суд: уточнить'));
 rows[0].cases[0].stage='Приказ';assert.ok(!visibleStages(rows).includes('Суд: уточнить'));
 assert.ok(visibleStages(rows).includes('Приказ'));
});
