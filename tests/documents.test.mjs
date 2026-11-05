import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,execute} from '../dist/model.mjs';
import {currentCase,createCase} from '../dist/cases.mjs';
import {draftDocument,saveDraft,caseProgress,availableTemplates,prepareDraftBatch,saveDraftBatch,documentStatus} from '../dist/documents.mjs';
import {overview} from '../dist/workspace-views.mjs';
import {requestReview} from '../dist/operations.mjs';

test('stage does not prove agreement or court outcome',()=>{
  assert.match(caseProgress({stage:'Соглашение'}).label,/не зафиксированы/);
  assert.equal(caseProgress({stage:'Приказ',documents:[{kind:'agreement'}]}).work,'templates');
  assert.equal(caseProgress({stage:'Приказ',documents:[{kind:'order'}]}).work,'enforcement');
  assert.equal(caseProgress({stage:'Приставы',documents:[{kind:'order'}]}).work,'legal');
  assert.ok(!availableTemplates({stage:'Приказ'}).some(([k])=>k==='agreement'));
});
test('draft contains case-specific amounts, source data and honest missing fields',()=>{
  const s=seed(),r=s.rows[0];execute(s,[r.id],'case');
  const d=draftDocument(r,'notice');assert.equal(d.data.account,r.account);assert.equal(d.data.caseId,r.caseId);
  assert.ok(d.text.includes(r.building));assert.ok(d.missing.includes('ФИО и доли собственников'));
  const stored=saveDraft(r,d,d.text+'\nКомментарий юриста');
  r.principal+=100;assert.equal(stored.data.principal,d.data.principal);
  assert.throws(()=>documentStatus(r,stored.id,'prepared'));assert.throws(()=>documentStatus(r,stored.id,'sent'));
  assert.throws(()=>draftDocument(r,'claim'));
});
test('mass documents preserve each selected case and are idempotent',()=>{
  const s=seed(),r=s.rows[0];createCase(r,'январь',{principal:10000,penalty:0,fee:0});const first=r.caseId;
  createCase(r,'февраль',{principal:20000,penalty:0,fee:0});const second=r.caseId;
  const keys=[first,second].map(id=>JSON.stringify([r.id,id]));
  const batch=prepareDraftBatch(s.rows,keys,'notice');assert.deepEqual(batch.map(x=>x.draft.data.principal),[10000,20000]);
  assert.equal(saveDraftBatch(s.rows,batch),2);assert.equal(saveDraftBatch(s.rows,batch),0);
  assert.equal(r.caseId,second);assert.equal(r.cases.find(c=>c.id===first).drafts[0].data.period,'январь');
  assert.equal(currentCase(r).drafts[0].data.period,'февраль');
});
test('batch rejects stale data atomically',()=>{
  const s=seed();execute(s,['1001','2002'],'case');
  const rows=s.rows.filter(r=>['1001','2002'].includes(r.id)),keys=rows.map(r=>JSON.stringify([r.id,r.caseId]));
  const batch=prepareDraftBatch(s.rows,keys,'notice');currentCase(rows[1]).remaining.principal++;
  assert.throws(()=>saveDraftBatch(s.rows,batch),/Данные изменились/);assert.ok(rows.every(r=>!currentCase(r).drafts?.length));
});
test('court draft preserves original claim after payment changes remaining debt',()=>{
  const r=seed().rows.find(r=>r.id==='1003'),c=currentCase(r),original=c.claim.amount;
  c.remaining.principal-=100;const d=draftDocument(r,'orderApplication');
  assert.equal(d.data.amount,original);assert.notEqual(d.data.remaining,d.data.amount);
  assert.ok(d.missing.some(x=>x.includes('юридический текст')));
});
test('review request appears in scoped overview',()=>{
  const s=seed(),r=s.rows[0];requestReview(r,'2026-10-29','Проверить сумму');
  assert.match(overview(s.rows,'2026-10-01','2026-10-29',{company:r.company}),/На уточнении у бухгалтера/);
  assert.doesNotMatch(overview(s.rows,'2026-10-01','2026-10-29',{company:'нет'}),/На уточнении у бухгалтера/);
});
