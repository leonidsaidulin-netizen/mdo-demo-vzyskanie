import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../dist/model.mjs';
import {migrate,paymentReport,workRows} from '../dist/workflow.mjs';
import {overview,overviewRows} from '../dist/workspace-views.mjs';
import {installDemoBilling,DEMO_COMPANY} from '../dist/demo-billing.mjs';
import {caseProgress,reviewReasons} from '../dist/documents.mjs';
const setup=()=>{const s=migrate(seed());installDemoBilling(s);return s;};
test('overview shows current principal and all-time receipts without a date control',()=>{
 const s=setup(),rows=overviewRows(s.rows,{company:DEMO_COMPANY});
 const p=paymentReport(rows,'2026-10-01','2026-10-29');assert.equal(p.all.principal,300000);assert.equal(p.all.penalty,5000);assert.equal(p.all.fee,200000);assert.equal(p.all.amount,505000);
 const html=overview(s.rows,'2026-10-01','2026-10-29',{company:DEMO_COMPANY});
 assert.match(html,/Основной долг сейчас/);assert.match(html,/Поступило за всё время/);assert.equal((html.match(/id="reportFrom"/g)||[]).length,0);
 const before=structuredClone(rows);assert.equal(paymentReport(rows,'2026-09-01','2026-09-30').all.amount,0);assert.deepEqual(rows,before);
});
test('last day timestamps count as receipts but do not invent same-day attribution',()=>{
 const r={id:'x',payments:[{at:'2026-10-29T15:00:00',amount:100,principal:70,penalty:20,fee:10,scope:'a'}],events:[{action:'app',status:'Доставлено (демо)',at:'2026-10-29T16:00:00',scope:'a'}]};
 const p=paymentReport([r],'2026-10-29','2026-10-29');assert.equal(p.all.amount,100);assert.equal(p.cohort.amount,0);
});
test('global registry includes unstarted and court debts and can include paid accounts',()=>{
 const rows=overviewRows(setup().rows,{company:DEMO_COMPANY});const debtors=workRows(rows,{debtOnly:true});
 assert.equal(rows.length,9);assert.equal(debtors.length,7);assert.ok(debtors.some(r=>r.stage==='Без дела'));assert.ok(debtors.some(r=>r.stage==='Приказ'));assert.equal(workRows(rows,{}).length,9);
 assert.equal(caseProgress(null,{principal:0,penalty:0,fee:0}).work,'history');
});
test('Sun street source is not blocked; historical unconfirmed balances get explicit reason',()=>{
 const r=setup().rows.find(r=>r.id==='1003');assert.deepEqual(reviewReasons(r),[]);assert.equal(caseProgress(r.cases[0],r).work,'templates');
 r.caseBalanceConflict=true;assert.match(caseProgress(r.cases[0],r).dataIssue,/распределение долга/);
 assert.equal(caseProgress(r.cases[0],r).label,'Заявление готовится');
 r.unallocated=100000;assert.match(caseProgress(r.cases[0],r).dataIssue,/Не разнесена оплата/);
});
