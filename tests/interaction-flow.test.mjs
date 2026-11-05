import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,allocate,completeCommunication,filterRows,changeStage} from '../dist/model.mjs';
import {installDemoBilling,DEMO_COMPANY,demoEvent} from '../dist/demo-billing.mjs';
import {currentCase,selectCase,createCase,unassigned} from '../dist/cases.mjs';
import {previewNotifications,confirmNotifications,previewEnforcement,confirmEnforcement} from '../dist/interaction-flow.mjs';
import {ensureStageDocuments,stageAge} from '../dist/documents.mjs';
import {notificationState} from '../dist/workflow.mjs';
const setup=()=>{const s=seed();installDemoBilling(s);return s;};
test('all demo stages have cases and automatic documents; repeated opening adds no duplicates',()=>{
  const s=setup(),rows=s.rows.filter(r=>r.company===DEMO_COMPANY);
  for(const stage of ['Уведомление','Соглашение','Приказ','Иск','Приставы','Завершено']){
    const r=rows.find(r=>r.stage===stage);assert.ok(r,stage);const first=ensureStageDocuments(r);assert.ok(first.length);assert.ok(first.every(d=>!d.missing.length));
    const n=currentCase(r).drafts.length;assert.deepEqual(ensureStageDocuments(r),first);assert.equal(currentCase(r).drafts.length,n);
  }
});
test('preview is read-only; sending persists document and case but not delivery',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-001'),old=structuredClone(s);
  const p=previewNotifications(s.rows,[[r.id,null]],'email');assert.deepEqual(s,old);assert.equal(p.items[0].reason,'');
  assert.match(p.items[0].doc.text,/Учебный собственник 1/);assert.equal(confirmNotifications(s.rows,p),1);
  assert.equal(notificationState(r),'sent');assert.equal(r.cases.length,1);assert.equal(currentCase(r).drafts.find(d=>d.kind==='notice').status,'sent');
  assert.throws(()=>confirmNotifications(s.rows,p),/изменились/);
  completeCommunication(r,r.events[0].id,'Доставлено (демо)','2026-10-29');assert.equal(notificationState(r),'delivered');
});
test('unavailable channel and stale preview never send; paid case excludes only itself',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-002');r.email=false;
  assert.match(previewNotifications(s.rows,[[r.id,r.caseId]],'email').items[0].reason,/email/);
  const p=previewNotifications(s.rows,[[r.id,r.caseId]],'app');allocate(r,100,{principal:100,penalty:0,fee:0},r.caseId);
  assert.throws(()=>confirmNotifications(s.rows,p),/изменились/);assert.ok(!r.events.some(e=>e.status==='Отправлено (демо)'));
});
test('separate cases on same account get independent amount and duplicate protection',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-002'),oldId=r.caseId;
  demoEvent(s,r,'newMonth');selectCase(r,null);const other=createCase(r,'01.10.2026 — 31.10.2026',unassigned(r));
  const p=previewNotifications(s.rows,[[r.id,oldId],[r.id,other.id]],'email');assert.deepEqual(p.items.map(x=>x.doc.data.remaining),[980000,200000]);
  assert.equal(confirmNotifications(s.rows,p),2);assert.deepEqual(r.events.filter(e=>e.action==='email').map(e=>e.amount).sort((a,b)=>a-b),[200000,980000]);
  assert.ok(previewNotifications(s.rows,[[r.id,oldId]],'email').items[0].reason);
});
test('print generation does not imply delivery',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-002');confirmNotifications(s.rows,previewNotifications(s.rows,[[r.id,r.caseId]],'receipt'));
  assert.equal(notificationState(r),'print');assert.equal(r.events[0].status,'Сформировано для печати (демо)');
});
test('another channel reuses the immutable document without duplicating the case',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-002');confirmNotifications(s.rows,previewNotifications(s.rows,[[r.id,r.caseId]],'app'));
  const doc=structuredClone(currentCase(r).drafts.find(d=>d.kind==='notice'));
  assert.equal(confirmNotifications(s.rows,previewNotifications(s.rows,[[r.id,r.caseId]],'email')),1);
  assert.deepEqual(currentCase(r).drafts.find(d=>d.id===doc.id),doc);assert.equal(r.cases.length,1);
});
test('version-one migration preserves prior user edits and adds stage examples once',()=>{
  const s=setup();s.rows=s.rows.filter(r=>!['УЧ-006','УЧ-007','УЧ-008','УЧ-009'].includes(r.id));s.demoBillingVersion=1;
  const r=s.rows.find(r=>r.id==='УЧ-002');r.owner='Учебный юрист';demoEvent(s,r,'halfPayment');const before=structuredClone(r);
  installDemoBilling(s);assert.deepEqual(r,before);assert.equal(installDemoBilling(s),false);
});
test('enforcement shows application, keeps original court document and changes stage only on confirm',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-003'),old=structuredClone(r),p=previewEnforcement(r,'fssp');
  assert.deepEqual(r,old);assert.match(p.draft.text,/Учебное отделение ФССП/);assert.match(p.draft.text,/5\s?392,58/);
  confirmEnforcement(r,p);assert.equal(r.stage,'Приставы');assert.equal(currentCase(r).drafts.at(-1).status,'sent');
  assert.ok(currentCase(r).documents.some(d=>d.kind==='order'));assert.match(currentCase(r).legal.status,/ФССП/);
  const shown=ensureStageDocuments(r).find(d=>d.kind==='enforcementApplication');assert.equal(shown.status,'sent');assert.match(shown.text,/Учебное отделение ФССП/);
  assert.throws(()=>confirmEnforcement(r,p),/изменились/);
});
test('stage age is independent of debt period, missing timestamps are not invented; max-age works',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-006');assert.match(stageAge(currentCase(r)),/9 дн/);
  assert.match(stageAge({period:'01.01.2026'}),/не загружена/);
  currentCase(r).stageEnteredAt='2026-10-01';changeStage(r,'Соглашение');assert.equal(currentCase(r).stageEnteredAt,'2026-10-01');
  assert.deepEqual(filterRows([{age:15},{age:31},{age:60}],{minAge:1,maxAge:30}).map(r=>r.age),[15]);
});
