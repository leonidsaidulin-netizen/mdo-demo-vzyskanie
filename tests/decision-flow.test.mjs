import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,allocate,upgradeUntouchedSampleDetails} from '../dist/model.mjs';
import {installDemoBilling} from '../dist/demo-billing.mjs';
import {currentCase} from '../dist/cases.mjs';
import {stageDocumentEntries,caseProgress} from '../dist/documents.mjs';
import {templateList} from '../dist/workbench.mjs';
import {recordContactResult} from '../dist/lawyer-journey.mjs';
import {prepareNotificationCases,previewNotificationBatch,confirmNotificationBatch,NOTIFICATION_CHANNELS} from '../dist/interaction-flow.mjs';
const setup=()=>{const s=seed();installDemoBilling(s);return s;};
test('River: preparation creates one case, all channels send independently without duplicates',()=>{
 const s=setup(),r=s.rows.find(r=>r.id==='4001'),targets=prepareNotificationCases(s.rows,[[r.id,null]]);
 assert.equal(r.cases.length,1);assert.equal(r.stage,'Уведомление');assert.equal(r.events.length,0);
 const before=structuredClone(s),p=previewNotificationBatch(s.rows,targets,Object.keys(NOTIFICATION_CHANNELS));assert.deepEqual(s,before);
 assert.equal(p.items.length,6);assert.ok(p.items.every(x=>!x.reason),JSON.stringify(p.items.map(x=>x.reason)));
 assert.equal(confirmNotificationBatch(s.rows,p),6);assert.equal(r.cases.length,1);assert.equal(r.events.length,6);
 assert.equal(r.events.filter(e=>e.status==='Отправлено (демо)').length,4);
 assert.equal(r.events.filter(e=>e.status==='Сформировано для печати (демо)').length,2);
 assert.ok(!r.events.some(e=>e.status==='Доставлено (демо)'));
 assert.equal(previewNotificationBatch(s.rows,targets,Object.keys(NOTIFICATION_CHANNELS)).items.filter(x=>!x.reason).length,0);
 assert.equal(currentCase(r).drafts.filter(d=>d.kind==='demand').length,1);
});
test('missing one contact does not block other channels; stale preview is atomic',()=>{
 const s=setup(),r=s.rows.find(r=>r.id==='УЧ-002');r.email=false;
 const targets=[[r.id,r.caseId]],p=previewNotificationBatch(s.rows,targets,['email','app']);
 assert.match(p.items[0].reason,/email/);assert.equal(confirmNotificationBatch(s.rows,p),1);
 const next=previewNotificationBatch(s.rows,targets,['notice']);allocate(r,100,{principal:100,penalty:0,fee:0},r.caseId);
 const old=structuredClone(r);assert.throws(()=>confirmNotificationBatch(s.rows,next),/изменились/);assert.deepEqual(r,old);
});
test('opening documents does not create them; decision determines the package',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-002'),old=structuredClone(r);
 const entries=stageDocumentEntries(r);assert.ok(entries.every(x=>x.status==='not_created'));templateList(r);assert.deepEqual(r,old);
 recordContactResult(r,'agreement','Хочет погасить в два приёма','2026-11-05');
 assert.equal(currentCase(r).stage,'Соглашение');assert.match(templateList(r),/Сначала зафиксируйте условия/);
 assert.equal(caseProgress(currentCase(r),r).work,'agreement');
 recordContactResult(r,'order','Отказался от графика, основания проверены','2026-11-05');
 assert.equal(currentCase(r).stage,'Приказ');assert.equal(caseProgress(currentCase(r),r).work,'templates');
 assert.ok(stageDocumentEntries(r).some(d=>d.kind==='orderApplication'));
 assert.ok(!stageDocumentEntries(r).some(d=>d.kind==='agreement'));
});
test('promise never records a receipt; disputed amount preserves stage and asks for exact review',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-002');recordContactResult(r,'promise','Оплатит в пятницу','2026-11-05');
 assert.equal(r.payments.length,0);assert.equal(r.stage,'Уведомление');assert.equal(caseProgress(currentCase(r),r).label,'Обещает оплатить');
 recordContactResult(r,'dispute','Не учли платёж за август','2026-11-05');
 assert.equal(caseProgress(currentCase(r),r).label,'Оспаривает сумму долга');assert.match(caseProgress(currentCase(r),r).dataIssue,/оспаривает/);
 assert.equal(caseProgress(currentCase(r),r).work,'review');
});
test('adapted claim includes receipt stub, components and delivery proof, no real PDF identifiers',()=>{
 const r=setup().rows.find(r=>r.id==='УЧ-002'),d=stageDocumentEntries(r).find(d=>d.kind==='demand');
 for(const text of ['ИЗВЕЩЕНИЕ ОБ ОПЛАТЕ','ОТМЕТКА О ВРУЧЕНИИ','Госпошлина','Пени'])assert.ok(d.text.includes(text));
 assert.match(d.text,/Учебный собственник/);assert.match(d.text,/Реквизиты и QR-код отключены/);assert.doesNotMatch(d.text,/real_balans|fio|adres/);
});
test('sample enrichment never overwrites edited data, imports or unconfirmed balances',()=>{
 const s=setup(),r=s.rows.find(r=>r.id==='4001');r.owners=[];r.charges=[];r.caseBalanceConflict=true;
 assert.equal(upgradeUntouchedSampleDetails(s),true);assert.ok(r.owners.length);assert.equal(r.caseBalanceConflict,true);
 assert.equal(upgradeUntouchedSampleDetails(s),false);r.owners=[];r.principal+=1;
 assert.equal(upgradeUntouchedSampleDetails(s),false);assert.deepEqual(r.owners,[]);
 r.principal-=1;s.imports=[{}];assert.equal(upgradeUntouchedSampleDetails(s),false);
});
test('bulk preparation excludes stale account without blocking a valid account',()=>{
 const s=setup(),p=prepareNotificationCases(s.rows,[['4001',null],['4002',null]]);
 const preview=previewNotificationBatch(s.rows,p,['app','notice']);
 assert.equal(preview.items.filter(x=>!x.reason).length,2);
 assert.ok(preview.items.filter(x=>x.id==='4002').every(x=>/Устаревший/.test(x.reason)));
 assert.equal(s.rows.find(r=>r.id==='4002').cases.length,0);
});
