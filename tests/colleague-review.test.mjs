import test from 'node:test';
import assert from 'node:assert/strict';
import Zip from 'pizzip';
import Templater from 'docxtemplater';
import {seed,allocate,changeStage,total} from '../dist/model.mjs';
import {installDemoBilling,demoEvent,DEMO_COMPANY} from '../dist/demo-billing.mjs';
import {currentCase,amount,unassigned,createCase,selectCase} from '../dist/cases.mjs';
import {ensureStageDocuments,caseProgress,draftDocument,availableTemplates} from '../dist/documents.mjs';
import {renderDocx} from '../dist/docx.mjs';
import {paymentReport} from '../dist/workflow.mjs';
import {validateBilling} from '../dist/billing.mjs';
import {previewNotifications,confirmNotifications,previewEnforcement,confirmEnforcement} from '../dist/interaction-flow.mjs';
const setup=()=>{const s=seed();installDemoBilling(s);return s;};
test('every stage generates populated DOCX files, retaining source and original documents',()=>{
  const s=setup();
  for(const r of s.rows.filter(r=>r.company===DEMO_COMPANY&&r.caseId)){
    const c=currentCase(r),before=structuredClone(c.documents),docs=ensureStageDocuments(r);
    for(const d of docs){
      assert.deepEqual(d.missing,[],`${c.stage}: ${d.title}`);assert.ok(!d.text.includes('undefined'));
      const xml=new Zip(renderDocx(d,{Zip,Templater})).file('word/document.xml').asText();
      assert.ok(xml.includes(r.account));assert.ok(xml.includes(d.title));assert.ok(xml.includes('УЧЕБНЫЙ'));
    }
    assert.deepEqual(c.documents,before);const count=c.drafts.length;ensureStageDocuments(r);assert.equal(c.drafts.length,count);
  }
});
test('late payment uses actual date, cannot duplicate or refresh stale source',()=>{
  const r=setup().rows.find(r=>r.id==='УЧ-002');r.asOf='2026-10-01';const initial=total(r);
  const meta={date:'2026-10-25',source:'Банк',reference:'ПЛ-1042'};
  allocate(r,100000,{principal:100000,penalty:0,fee:0},r.caseId,meta);
  assert.equal(total(r),initial-100000);assert.equal(r.asOf,'2026-10-01');assert.equal(r.payments[0].stage,null);
  const snapshot=structuredClone(r);assert.throws(()=>allocate(r,100000,{principal:100000,penalty:0,fee:0},r.caseId,meta),/уже учтено/);assert.deepEqual(r,snapshot);
  assert.equal(paymentReport([r],'2026-10-25','2026-10-25').all.amount,100000);
  assert.equal(paymentReport([r],'2026-10-29','2026-10-29').all.amount,0);
  assert.equal(caseProgress(currentCase(r),r).work,'review');validateBilling(r);
});
test('partial and full settlement of old claim never erases new debt or recreates old debt',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-003'),claim=structuredClone(currentCase(r).claim);
  const p=previewEnforcement(r,'fssp');confirmEnforcement(r,p);
  const c=currentCase(r);
  allocate(r,200000,{principal:0,penalty:0,fee:200000},c.id,{date:'2026-10-28',source:'Банк',reference:'ПОШЛИНА-1'});
  assert.equal(c.remaining.fee,0);assert.equal(c.remaining.principal,339258);assert.deepEqual(c.claim,claim);
  allocate(r,amount(c.remaining),{...c.remaining},c.id,{source:'Касса',reference:'ОПЛАТА-2'});
  assert.equal(caseProgress(c,r).work,'closeCase');assert.throws(()=>previewEnforcement(r));
  changeStage(r,'Завершено','Погашено по двум поступлениям');
  const report=draftDocument(r,'closure');assert.match(report.text,/ПОШЛИНА-1/);assert.match(report.text,/ОПЛАТА-2/);
  assert.equal(total(r),0);validateBilling(r);
});
test('notification -> agreement -> payment -> closure and new debt is a separate case',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-001');
  confirmNotifications(s.rows,previewNotifications(s.rows,[[r.id,null]],'email'));const c=currentCase(r),notice=structuredClone(c.drafts.find(d=>d.kind==='notice'));
  demoEvent(s,r,'agreement');assert.ok(ensureStageDocuments(r).some(d=>d.kind==='schedule'));
  demoEvent(s,r,'halfPayment');assert.ok(amount(c.remaining)>0);assert.throws(()=>changeStage(r,'Завершено'));
  demoEvent(s,r,'fullPayment');changeStage(r,'Завершено');assert.equal(caseProgress(c,r).work,'documents');
  assert.deepEqual(c.drafts.find(d=>d.id===notice.id),notice);
  demoEvent(s,r,'newMonth');assert.equal(total(r),200000);assert.equal(amount(c.remaining),0);
  const next=createCase(r,'01.10.2026 — 31.10.2026',unassigned(r));assert.notEqual(next.id,c.id);validateBilling(r);
});
test('cancelled order is not offered for execution; claim retains history and generated docs',()=>{
  const r=setup().rows.find(r=>r.id==='УЧ-003'),c=currentCase(r);ensureStageDocuments(r);
  c.legal.status='Отменён приказ';assert.equal(caseProgress(c,r).work,'transition');assert.throws(()=>previewEnforcement(r),/Отменённый/);
  changeStage(r,'Иск');c.legal={status:'Подготовка иска',next:'Проверить иск и приложения'};
  assert.notEqual(caseProgress(c,r).work,'enforcement');assert.throws(()=>previewEnforcement(r),/исполнительный документ/);assert.ok(!availableTemplates(c).some(([k])=>k==='enforcementApplication'));
  const docs=ensureStageDocuments(r);assert.ok(docs.some(d=>d.kind==='claim'));assert.ok(c.drafts.some(d=>d.kind==='orderApplication'));
});
