import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,allocate} from '../dist/model.mjs';
import {installDemoBilling} from '../dist/demo-billing.mjs';
import {currentCase,amount} from '../dist/cases.mjs';
import {caseProgress,ensureStageDocuments} from '../dist/documents.mjs';
import {saveAgreement,markInstallment,saveLegal} from '../dist/operations.mjs';
import {legalPanel} from '../dist/workbench.mjs';
import {saveAgreementProposal,transitionCase,transitionOptions,caseNotices,LEGAL_RESULTS} from '../dist/lawyer-journey.mjs';
const setup=()=>{const s=seed();installDemoBilling(s);return s;};
test('proposal generates docs but does not fake signature or payment; signed result leads to payment control',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-002'),c=currentCase(r),debt=amount(c.remaining);
 saveAgreementProposal(r,'ПР-1','2026-10-29',[{date:'2026-11-15',amount:debt}]);
 assert.equal(c.stage,'Соглашение');assert.equal(c.agreement,undefined);assert.equal(r.payments.length,0);
 assert.match(caseProgress(c,r).label,/подписи ещё нет/);
 assert.doesNotMatch(legalPanel(r),/data-work="installment"/);
 const docs=ensureStageDocuments(r);assert.ok(docs.some(d=>d.kind==='agreement'));assert.match(docs.find(d=>d.kind==='schedule').text,/2026-11-15/);
 assert.throws(()=>saveAgreement(r,'С-1','2026-10-29',c.schedule),/подписанного/);
 c.documents.push({kind:'agreement',name:'Синтетический подписанный файл'});
 saveAgreement(r,'С-1','2026-10-29',c.schedule);
 assert.equal(caseProgress(c,r).work,'installment');
 assert.match(legalPanel(r),/data-work="installment"/);
 assert.throws(()=>markInstallment(r,0,[]),/платежи/);
 allocate(r,debt,{...c.remaining},c.id,{reference:'ТЕСТ-1',source:'Банк'});
 markInstallment(r,0,[0]);assert.equal(c.schedule[0].paid,true);
 assert.equal(caseProgress(c,r).work,'closeCase');transitionCase(r,'Завершено','Оплата учтена');
 assert.equal(c.stage,'Завершено');assert.deepEqual(transitionOptions(c),[]);
});
test('legal result update preserves recipient and document context',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-008'),c=currentCase(r);c.legal.recipient='bank';
 saveLegal(r,{number:'QA-1',date:'2026-10-29',status:'Исполнение',next:'Проверить поступления',nextDate:'2026-11-05'});
 assert.equal(c.legal.recipient,'bank');assert.equal(caseProgress(c,r).next,'Проверить поступления и результат исполнения');
});
test('draft completeness refreshes after an accounting review without deleting edited text',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-002');r.reviewTask={status:'open'};
 const docs=ensureStageDocuments(r),d=docs[0];d.text+='\nКомментарий юриста';
 assert.ok(d.missing.includes('результат проверки задолженности'));
 r.reviewTask.status='done';const updated=ensureStageDocuments(r)[0];
 assert.equal(updated.id,d.id);assert.match(updated.text,/Комментарий юриста/);assert.ok(!updated.missing.includes('результат проверки задолженности'));
});
test('invalid proposal is atomic, signed schedules cannot be replaced',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-002'),before=structuredClone(r);
 assert.throws(()=>saveAgreementProposal(r,'ПР-2','2026-10-29',[{date:'2026-11-15',amount:10}]),/остаток/);assert.deepEqual(r,before);
 const signed=setup().rows.find(r=>r.id==='УЧ-006');assert.throws(()=>saveAgreementProposal(signed,'ПР-3','2026-10-29',currentCase(signed).schedule),/Подписанный/);
});
test('moving cancelled order to claim preserves evidence but clears old stage result',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-003'),c=currentCase(r);c.legal.status='Отменён приказ';ensureStageDocuments(r);
 const files=structuredClone(c.documents),drafts=structuredClone(c.drafts);
 assert.throws(()=>transitionCase(r,'Иск',''),/основание/);
 transitionCase(r,'Иск','Приказ отменён, основания иска проверены');
 assert.equal(c.legalHistory[0].status,'Отменён приказ');assert.deepEqual(c.legal,{});assert.deepEqual(c.documents,files);assert.deepEqual(c.drafts,drafts);
 assert.equal(caseProgress(c,r).work,'templates');assert.equal(LEGAL_RESULTS['Иск']['Отменён приказ'],undefined);
});
test('notification channels are scoped to case and preserve status and cancellation',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-002'),c=currentCase(r);
 r.events=[{caseId:c.id,action:'email',at:'2026-10-29',status:'Отменено: остаток изменился'},{caseId:'other',action:'robot',at:'2026-10-29',status:'Доставлено (демо)'}];
 assert.equal(caseNotices(r,c).length,1);assert.equal(caseNotices(r,c)[0].action,'email');assert.match(caseNotices(r,c)[0].status,/Отменено/);
});
