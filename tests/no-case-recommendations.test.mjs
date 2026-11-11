import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,TODAY} from '../dist/model.mjs';
import {roleRecommendation} from '../dist/role-actions.mjs';
import {nextAction} from '../dist/workbench.mjs';
import {createCase,unassigned} from '../dist/cases.mjs';
import {previewNotificationBatch} from '../dist/interaction-flow.mjs';

const fresh=()=>({...structuredClone(seed().rows[0]),asOf:TODAY,unallocated:0,caseBalanceConflict:false,disputed:false,reviewTask:null,_caseView:true});
const names=['Сверить. Повторный долг на ЛС','Запросить у расчётчика распределение','Подготовить уведомление'];
test('no-case recommendations match the three owner-approved names',()=>{
  const scenarios=[
    [{reviewTask:{status:'open',reason:'Проверить период',due:TODAY}},names[0],'reviewStatus'],
    [{caseBalanceConflict:true},names[1],'review'],
    [{unallocated:10000},names[1],'review'],
    [{asOf:'2026-10-01'},names[1],'review'],
    [{disputed:true},names[1],'review'],
    [{},names[2],'channels'],
    [{promise:'2026-10-01'},names[2],'channels'],
    [{task:{status:'open',text:'Задача старого дела',due:TODAY}},names[2],'channels'],
  ];
  for(const [fields,label,action] of scenarios){
    const r={...fresh(),...fields},before=JSON.stringify(r),rec=roleRecommendation(r,'lawyer');
    assert.equal(rec.label,label);assert.equal(rec.action,action);
    assert.match(nextAction(r,'lawyer'),new RegExp(label));
    assert.equal(JSON.stringify(r),before,'view must not create cases or change history');
  }
});
test('open request wins over other data issues; old delivery does not change no-case recommendation',()=>{
  const r=fresh();r.caseBalanceConflict=true;r.reviewTask={status:'open',reason:'Сумма',due:TODAY};
  assert.equal(roleRecommendation(r,'lawyer').label,names[0]);
  r.reviewTask=null;r.caseBalanceConflict=false;
  r.events.push({scope:`1:${r.period}`,caseId:'old-case',action:'app',status:'Нет ответа (демо)'});
  assert.equal(roleRecommendation(r,'lawyer').label,names[2]);
});
test('existing case and accountant recommendations do not change',()=>{
  const r=fresh();createCase(r,r.period,unassigned(r));r.unallocated=100;
  assert.equal(roleRecommendation(r,'lawyer').label,'Запросить у расчётчика учёт поступившей оплаты');
  assert.equal(roleRecommendation(r,'accountant').action,'payment');
});
test('removed labels do not disable payment, stale or dispute guards',()=>{
  for(const fields of [{asOf:'2026-10-01'},{unallocated:100},{disputed:true},{caseBalanceConflict:true}]){
    const r={...fresh(),...fields};
    assert.throws(()=>createCase(r,r.period,unassigned(r)));
    const preview=previewNotificationBatch([r],[[r.id,null]],['app']);
    assert.ok(preview.items.every(x=>x.reason),'blocked debt cannot prepare notifications');
    assert.equal(preview.copies[0].cases.length,r.cases.length);
  }
});
