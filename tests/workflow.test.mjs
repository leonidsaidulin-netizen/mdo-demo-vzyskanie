import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,total,execute,allocate,completeCommunication,filterRows,plan,TODAY,changeStage} from '../dist/model.mjs';
import {notificationState,summary,paymentReport,workRows,migrate} from '../dist/workflow.mjs';
import {overview,overviewRows,overviewFilters,receiptPages} from '../dist/workspace-views.mjs';
import {createCase,unassigned} from '../dist/cases.mjs';

test('overview scopes all reports to company and building',()=>{
  const rows=seed().rows,scope={company:'УК «Демо-парк»',building:'Мира, 24'};
  const scoped=overviewRows(rows,scope);
  assert.equal(scoped.length,4);
  assert.ok(scoped.every(r=>r.company===scope.company&&r.building===scope.building));
  assert.equal(overviewRows(rows,{company:scope.company}).length,8);
  assert.equal(overviewRows(rows,{}).length,16);
  assert.equal(overviewRows(rows,{company:'УК «Демо-квартал»',building:scope.building}).length,0);
  const html=overview(rows,'2026-10-01',TODAY,scope);
  const body=html.slice(html.indexOf('<section'));
  assert.equal(body,overview(scoped,'2026-10-01',TODAY).slice(overview(scoped,'2026-10-01',TODAY).indexOf('<section')));
  assert.equal(paymentReport(scoped,'2026-10-01',TODAY).all.amount,1000000);
  assert.equal(paymentReport(overviewRows(rows,{company:'УК «Демо-квартал»'}),'2026-10-01',TODAY).all.amount,700000);
  const filters=overviewFilters(rows,{company:scope.company});
  assert.ok(filters.includes('Мира, 24'));assert.ok(!filters.includes('Солнечная, 12'));
});
test('overview uses requested titles and removes global reconciliation banner',()=>{
  const html=overview(seed().rows,'2026-10-01',TODAY);
  for(const title of ['Текущие дела','Уведомления'])assert.ok(html.includes(`<h2>${title}</h2>`));
  assert.ok(!html.includes('Поступления за всё время по этапам'));
  for(const removed of ['Дата демо:','Открыть сверку','До сверки общий долг предварительный','Распределение лицевых счетов','Уведомления по должникам'])assert.ok(!html.includes(removed));
});
test('current cases count two separate cases at same stage on one account',()=>{
  const r=seed().rows.find(r=>r.id==='3002');
  const c=createCase(r,'Сентябрь 2026',unassigned(r));c.stage='Иск';
  const stage=summary([r]).stages.find(x=>x.stage==='Иск');
  assert.equal(stage.count,1);assert.equal(stage.caseCount,2);assert.equal(stage.amount,total(r));
});
test('overview stages split amounts without duplication; one LS can span stages',()=>{
  const s=seed(),m=summary(s.rows);assert.equal(m.accounts,14);assert.equal(m.premises,14);assert.equal(m.amount,48975258);assert.equal(m.stages.reduce((n,x)=>n+x.count,0),17);assert.equal(m.stages.reduce((n,x)=>n+x.amount,0),m.amount);assert.equal(Object.values(m.notices).reduce((a,b)=>a+b),14);
});
test('multiple accounts of one premise count once, different companies separately',()=>{
  const r=seed().rows[0],other={...r,id:'other',account:'other'};assert.equal(summary([r,other]).premises,1);other.company='Other';assert.equal(summary([r,other]).premises,2);
});
test('prepared receipt opens notification work but never implies delivery',()=>{
  const s=seed(),r=s.rows[0];execute(s,[r.id],'receipt');assert.equal(notificationState(r),'prepared');assert.equal(r.stage,'Уведомление');assert.equal(workRows(s.rows,{queue:'notify'}).some(x=>x.id===r.id),false);assert.equal(summary([r]).notices.delivered,0);
});
test('notification card and drill-down always count same population',()=>{
  const s=seed();for(const [notice,count] of Object.entries(summary(s.rows).notices))assert.equal(workRows(s.rows,{notice,debtOnly:true}).length,count);
});
test('delivered outcome does not imply an agreement or a judicial stage',()=>{
  const s=seed(),r=s.rows[0];execute(s,[r.id],'app');completeCommunication(r,r.events[0].id,'Доставлено (демо)',TODAY);assert.equal(notificationState(r),'delivered');assert.equal(r.stage,'Уведомление');
});
test('filters combine building, entrance, amount and age',()=>{
  const s=seed();assert.deepEqual(filterRows(s.rows,{building:'Солнечная, 12',entrance:'1',minDebt:'40000',maxDebt:'50000',minAge:'100'}).map(r=>r.id),['1001']);
});
test('payment reporting uses payment-date stage, never latest case stage',()=>{
  const s=seed(),r=s.rows.find(r=>r.id==='1003');r.stage='Приставы';const p=paymentReport(s.rows,'2026-10-01',TODAY);assert.equal(p.stages.find(x=>x.stage==='Приказ').amount,200000);assert.equal(p.stages.find(x=>x.stage==='Приставы').amount,0);assert.equal(p.all.amount,1700000);assert.equal(p.all.fee,200000);assert.equal(p.afterNotice.amount,500000);assert.equal(p.stages.reduce((n,x)=>n+x.amount,0),p.all.amount);
});
test('payment-date filtering and legacy unknown stage are explicit',()=>{
  const s=seed(),r=s.rows[0];r.payments.push({at:'2026-09-01',amount:100,principal:100,penalty:0,fee:0});assert.equal(paymentReport(s.rows,'2026-09-01','2026-09-30').stages.find(x=>x.stage==='Не зафиксирован').amount,100);assert.equal(paymentReport(s.rows,'2026-10-24',TODAY).all.amount,0);
});
test('prepared notice and old payment never produce post-delivery attribution',()=>{
  const s=seed(),r=s.rows[0];execute(s,[r.id],'receipt');allocate(r,100,{principal:100,penalty:0,fee:0});assert.equal(r.payments[0].afterNotice,false);assert.equal(r.payments[0].stage,'Уведомление');
});
test('multiple payments and stages do not double-count distinct total accounts',()=>{
  const r=seed().rows[0];r.payments=[{at:TODAY,amount:10,fee:0,stage:'Приказ'},{at:TODAY,amount:20,fee:0,stage:'Иск'}];const p=paymentReport([r],TODAY,TODAY);assert.equal(p.all.accounts,1);assert.equal(p.all.amount,30);
});
test('MAX is checked by contact availability',()=>{const s=seed();assert.equal(plan(s.rows,['1001'],'max')[0].reason,'');assert.equal(plan(s.rows,['1002'],'max')[0].reason,'Нет связи с MAX');});
test('migration preserves data and does not invent order versus lawsuit',()=>{
  const s=seed(),r=s.rows[2];r.stage='Суд';r.payments[0].stage='Суд';const before=total(r),events=structuredClone(r.events);migrate(s);assert.equal(r.stage,'Суд: уточнить');assert.equal(r.payments[0].stage,'Суд: уточнить');assert.equal(r.stageNeedsReview,true);assert.equal(total(r),before);assert.deepEqual(r.events,events);migrate(s);assert.equal(r.stage,'Суд: уточнить');changeStage(r,'Иск');assert.equal(r.stageNeedsReview,false);
});
test('receipt preview escapes imported input and separates fee',()=>{
  const r=seed().rows[2];r.company='<script>alert(1)</script>';const html=receiptPages(r);assert.ok(!html.includes('<script>'));assert.ok(html.includes('ЛИСТ 1'));assert.ok(html.includes('ЛИСТ 2'));assert.ok(html.includes('Госпошлина'));
});
test('overview retains the single all-time receipts metric',()=>assert.ok(overview([],'2026-09-01','2026-09-30').includes('Поступило за всё время')));
test('notification cohort counts delivery-window LS, excludes older payments and planned delivery',()=>{
  const s=seed(),p=paymentReport(s.rows,'2026-10-01',TODAY);assert.equal(p.cohort.notified,2);assert.equal(p.cohort.accounts,1);assert.equal(p.cohort.amount,500000);
  const r=s.rows[0];execute(s,[r.id],'receipt');allocate(r,100,{principal:100,penalty:0,fee:0});assert.equal(paymentReport(s.rows,'2026-10-01',TODAY).cohort.accounts,1);
  r.events.push({action:'app',status:'Доставлено (демо)',at:TODAY+'T12:00:00',completedAt:TODAY});r.payments[0].at='2026-10-28';const next=paymentReport(s.rows,'2026-10-01',TODAY);assert.equal(next.cohort.notified,3);assert.equal(next.cohort.accounts,1);
  r.payments[0].at=TODAY;assert.equal(paymentReport(s.rows,'2026-10-01',TODAY).cohort.accounts,1);
});
