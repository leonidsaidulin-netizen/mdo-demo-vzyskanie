import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,TODAY,allocate,changeStage} from '../dist/model.mjs';
import {installDemoBilling} from '../dist/demo-billing.mjs';
import {currentCase,amount} from '../dist/cases.mjs';
import {caseProgress,draftDocument} from '../dist/documents.mjs';
import {overview} from '../dist/workspace-views.mjs';
import {legalPanel} from '../dist/workbench.mjs';
import {recordContactResult,saveAgreementProposal,prepareCasePackage,packageReady,signDemoAgreement,recordLegalResult,reworkCasePackage,transitionCase,demoReceivedDocument} from '../dist/lawyer-journey.mjs';
import {previewEnforcement,confirmEnforcement} from '../dist/interaction-flow.mjs';
const setup=()=>{const s=seed();installDemoBilling(s);return s;};
const result=(r,status,simulateDocument=false)=>recordLegalResult(r,{status,number:'ДЕМО-1',date:TODAY,nextDate:'2026-11-05',note:'Синтетический результат проверки'},{simulateDocument});
test('all-time summary includes older receipts; both totals agree; principal is a breakdown',()=>{
 const s=setup(),r=s.rows[0];r.payments.push({at:'2025-01-01',amount:10000,principal:10000,fee:0,penalty:0,stage:'Уведомление'});
 const html=overview(s.rows,'2026-10-01',TODAY);
 assert.equal((html.match(/22\s150,00/g)||[]).length,1);assert.match(html,/Поступило за всё время/);assert.doesNotMatch(html,/id="reportFrom"/);
});
test('agreement: terms -> documents -> explicit simulated signature -> receipt -> closure',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-002');recordContactResult(r,'agreement','Согласен на график','2026-11-05');
 saveAgreementProposal(r,'С-1',TODAY,[{date:'2026-11-05',amount:amount(currentCase(r).remaining)}]);
 assert.throws(()=>signDemoAgreement(r),/сформируйте/);prepareCasePackage(r);
 assert.ok(packageReady(r));assert.equal(r.payments.length,0);signDemoAgreement(r);
 assert.equal(caseProgress(currentCase(r),r).work,'installment');
 const c=currentCase(r);allocate(r,amount(c.remaining),{...c.remaining},c.id);
 assert.equal(caseProgress(c,r).work,'closeCase');changeStage(r,'Завершено','Оплата учтена');prepareCasePackage(r);
 assert.ok(currentCase(r).drafts.some(d=>d.kind==='closure'));assert.ok(currentCase(r).documents.some(d=>d.kind==='agreement'));
});
test('refusal -> order -> filing -> returned -> correction -> cancellation -> claim',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-002');recordContactResult(r,'order','Рассрочку не согласовали','2026-11-05');
 assert.throws(()=>result(r,'Подано'),/пакет/);prepareCasePackage(r);
 assert.equal(caseProgress(currentCase(r),r).work,'legal');result(r,'Подано');result(r,'Возвращено');
 assert.equal(caseProgress(currentCase(r),r).work,'reworkPackage');assert.throws(()=>result(r,'Подано'),/пакет/);
 const before=structuredClone(r);assert.throws(()=>reworkCasePackage(r,''));assert.deepEqual(r,before);
 reworkCasePackage(r,'Добавлен договор дома');result(r,'Подано');result(r,'Получен документ',true);
 assert.equal(caseProgress(currentCase(r),r).work,'enforcement');result(r,'Отменён приказ');
 assert.throws(()=>previewEnforcement(r),/Отменённый/);transitionCase(r,'Иск','После отмены основания иска проверены');
 prepareCasePackage(r);assert.ok(currentCase(r).drafts.some(d=>d.kind==='claim'));
 assert.ok(currentCase(r).drafts.some(d=>d.kind==='orderApplication'));assert.doesNotMatch(legalPanel(r),/<h3>График/);
});
test('claim -> hearing -> decision -> executive document -> bank -> return -> FSSP -> closure',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-007');prepareCasePackage(r);result(r,'Подано');result(r,'Принят к рассмотрению');result(r,'Назначено заседание');result(r,'Получено решение',true);
 assert.equal(caseProgress(currentCase(r),r).work,'receiveExecution');assert.throws(()=>previewEnforcement(r),/исполнительный/);
 demoReceivedDocument(r,'enforcement','Исполнительный документ');confirmEnforcement(r,previewEnforcement(r));
 assert.equal(currentCase(r).stage,'Приставы');assert.throws(()=>previewEnforcement(r),/уже предъявлен/);
 result(r,'Возвращён документ');confirmEnforcement(r,previewEnforcement(r,'fssp'));result(r,'Исполнение');
 assert.equal(currentCase(r).legal.recipient,'fssp');const c=currentCase(r),old=structuredClone(c.claim);
 allocate(r,amount(c.remaining),{...c.remaining},c.id);changeStage(r,'Завершено','Погашено по выписке');prepareCasePackage(r);
 assert.deepEqual(currentCase(r).claim,old);assert.equal(caseProgress(currentCase(r),r).work,'documents');
});
test('package preparation is atomic and preserves edited documents',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-007');r.owners=[];const before=structuredClone(r);
 assert.throws(()=>prepareCasePackage(r),/ФИО/);assert.deepEqual(r,before);
 r.owners=[{name:'Демо',share:100}];prepareCasePackage(r);currentCase(r).drafts[0].text+='\nТекст юриста';
 const n=currentCase(r).drafts.length;prepareCasePackage(r);assert.equal(currentCase(r).drafts.length,n);assert.match(currentCase(r).drafts[0].text,/Текст юриста/);
});
test('court rejection and old unknown court have explicit paths, never fake closure',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-007');result(r,'Отказано');assert.equal(caseProgress(currentCase(r),r).work,'legal');assert.notEqual(currentCase(r).stage,'Завершено');
 currentCase(r).stage='Суд: уточнить';assert.equal(caseProgress(currentCase(r),r).work,'transition');transitionCase(r,'Иск','В материалах иск');assert.equal(caseProgress(currentCase(r),r).work,'templates');
});
test('old agreement schedule is not inserted into a court document',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-002');
 recordContactResult(r,'agreement','Согласовали график','2026-11-05');
 saveAgreementProposal(r,'С-2',TODAY,[{date:'2026-11-05',amount:amount(currentCase(r).remaining)}]);
 assert.match(draftDocument(r,'agreement').text,/График:/);
 recordContactResult(r,'order','Отказ от соглашения','2026-11-05');
 assert.doesNotMatch(draftDocument(r,'orderApplication').text,/График:/);
});
