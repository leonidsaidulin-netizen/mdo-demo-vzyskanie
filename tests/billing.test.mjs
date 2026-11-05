import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,execute,completeCommunication,changeStage,allocate,total} from '../dist/model.mjs';
import {installDemoBilling,demoEvent,DEMO_COMPANY} from '../dist/demo-billing.mjs';
import {currentCase,unassigned,createCase,selectCase} from '../dist/cases.mjs';
import {billingLines,billingPeriod,validateBilling} from '../dist/billing.mjs';
import {draftDocument,saveDraft} from '../dist/documents.mjs';
import {packetFiles} from '../dist/operations.mjs';
import {summary} from '../dist/workflow.mjs';
import {overviewRows} from '../dist/workspace-views.mjs';
const setup=()=>{const s=seed();installDemoBilling(s);return s;};
test('summary does not count a debt-free new owner as an unstarted case',()=>{const rows=setup().rows.filter(r=>r.company===DEMO_COMPANY),s=summary(rows);assert.equal(s.accounts,7);assert.equal(s.stages.find(x=>x.stage==='Без дела').count,2);});
test('failed demo event preserves the entire account',()=>{const s=setup(),r=s.rows.find(r=>r.id==='УЧ-002');r.billing.lines[0].charged++;const before=structuredClone(r);assert.throws(()=>demoEvent(s,r,'agreement'));assert.deepEqual(r,before);});
test('scenario migration is additive and idempotent',()=>{const s=seed(),old=structuredClone(s.rows);installDemoBilling(s);assert.deepEqual(s.rows.slice(0,16),old);assert.equal(installDemoBilling(s),false);assert.equal(s.rows.length,25);s.rows.slice(16).forEach(validateBilling);});
test('ready calculation -> notice -> receipt -> closure without manual billing input',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-001');execute(s,[r.id],'notice');const c=currentCase(r);
  assert.equal(c.period,'01.07.2026 — 30.09.2026');const d=draftDocument(r,'notice');assert.deepEqual(d.missing,[]);assert.match(d.text,/Содержание/);assert.match(d.text,/Учебный собственник 1/);assert.equal(packetFiles(s,r).length,1);saveDraft(r,d,d.text);
  completeCommunication(r,r.events[0].id,'Доставлено (демо)','2026-10-29');demoEvent(s,r,'fullPayment');assert.equal(total(r),0);validateBilling(r);changeStage(r,'Завершено');assert.equal(c.stage,'Завершено');assert.equal(c.drafts[0].data.amount,1650000);
});
test('agreement with two payments retains signed document and bill reconciliation',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-002');demoEvent(s,r,'agreement');const c=currentCase(r);assert.equal(c.schedule.length,2);
  demoEvent(s,r,'halfPayment');assert.equal(c.schedule[0].paid,true);assert.equal(total(r),490000);
  demoEvent(s,r,'fullPayment');assert.equal(c.schedule[1].paid,true);changeStage(r,'Завершено');validateBilling(r);assert.ok(c.documents.some(d=>d.kind==='agreement'));assert.equal(total(r),0);
});
test('court, bank and separate fee paid precisely, no receipt double counting',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-003'),c=currentCase(r),claim=structuredClone(c.claim);demoEvent(s,r,'execution');demoEvent(s,r,'fullPayment');
  assert.equal(r.payments[0].principal,339258);assert.equal(r.payments[0].fee,200000);assert.equal(r.payments[0].amount,539258);assert.deepEqual(c.claim,claim);assert.throws(()=>demoEvent(s,r,'fullPayment'));changeStage(r,'Завершено');validateBilling(r);
});
test('new month does not alter existing claim, new case uses October only',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-001');execute(s,[r.id],'case');changeStage(r,'Приказ');const old=currentCase(r),claim=structuredClone(old.claim);demoEvent(s,r,'newMonth');assert.deepEqual(old.claim,claim);assert.equal(unassigned(r).principal,200000);
  const period=billingPeriod(billingLines(r));assert.equal(period,'01.10.2026 — 31.10.2026');const next=createCase(r,period,unassigned(r));assert.equal(next.remaining.principal,200000);selectCase(r,old.id);const d=draftDocument(r,'orderApplication');assert.doesNotMatch(d.data.calculation,/2026-10/);assert.equal(d.data.amount,claim.amount);assert.throws(()=>demoEvent(s,r,'newMonth'));validateBilling(r);
});
test('departed house is filterable and debt never moves to new owner',()=>{
  const s=setup(),rows=overviewRows(s.rows,{company:DEMO_COMPANY,houseStatus:'departed'});assert.equal(rows.length,3);const old=rows.find(r=>r.id==='УЧ-004'),fresh=rows.find(r=>r.id==='УЧ-005');assert.equal(old.principal,210000);assert.equal(fresh.principal,0);assert.throws(()=>demoEvent(s,old,'newMonth'));assert.equal(fresh.ownerHistory[0].account,old.account);
});
test('invalid payment or manual period cannot corrupt calculated lines',()=>{
  const s=setup(),r=s.rows.find(r=>r.id==='УЧ-001'),before=structuredClone(r);assert.throws(()=>createCase(r,'wrong',unassigned(r)));assert.deepEqual(r,before);assert.throws(()=>allocate(r,1,{principal:2,penalty:0,fee:0}));assert.deepEqual(r,before);
});
test('new accrual after closure selects unassigned debt and preserves closed case',()=>{const s=setup(),r=s.rows.find(r=>r.id==='УЧ-002'),old=currentCase(r);demoEvent(s,r,'fullPayment');changeStage(r,'Завершено');demoEvent(s,r,'newMonth');assert.equal(currentCase(r),undefined);assert.equal(old.stage,'Завершено');assert.equal(unassigned(r).principal,200000);validateBilling(r);});
test('new owner has no copied charges or formulas from old owner',()=>{const s=setup(),r=s.rows.find(r=>r.id==='УЧ-005');assert.deepEqual(r.billing.lines,[]);assert.deepEqual(r.charges,[]);validateBilling(r);});
