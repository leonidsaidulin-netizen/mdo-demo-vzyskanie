import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,allocate} from '../dist/model.mjs';
import {installDemoBilling} from '../dist/demo-billing.mjs';
import {currentCase} from '../dist/cases.mjs';
import {installInteractions} from '../dist/interaction-ui.mjs';
import {installWorkbench} from '../dist/workbench.mjs';

function harness(t){
  const state=seed();installDemoBilling(state);
  const listeners={},nodes={},previous=globalThis.document;
  let saves=0,html='',channels=['app'];
  globalThis.document={
    addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn),
    querySelector:s=>nodes[s]??=( {innerHTML:''} ),
    querySelectorAll:()=>channels.map(channel=>({dataset:{notificationChannel:channel}})),
  };
  t.after(()=>{globalThis.document=previous;});
  const api={getState:()=>state,getRole:()=> 'lawyer',save:()=>saves++,render:()=>{},
    modal:(...args)=>{html=args.join('\n');},close:()=>{},toast:()=>{},openDrawer:()=>{}};
  const interactions=installInteractions(api),workbench=installWorkbench({...api,
    notify:r=>interactions.notify([[r.id,r.caseId]]),enforcement:r=>interactions.enforcement(r.id)});
  const click=async (selector,dataset={})=>{
    const element={dataset};
    for(const fn of listeners.click||[])await fn({target:{closest:s=>s===selector?element:null}});
  };
  return {state,interactions,workbench,nodes,get saves(){return saves;},get html(){return html;},
    cancel:()=>click('[data-action="close"]'),confirm:()=>click('[data-flow-confirm],[data-flow-preview]'),
    channels(values){channels=values;for(const fn of listeners.change||[])fn({target:{dataset:{notificationChannel:values[0]||'app'}}});},
    preview:i=>click('[data-flow-confirm],[data-flow-preview]',{flowPreview:String(i)})};
}

test('opening, editing channels, browsing preview and cancelling never save a new case',async t=>{
  const h=harness(t),before=structuredClone(h.state);
  h.interactions.notify([['4001',null]]);
  h.channels(['app','email','notice','receipt']);await h.preview(3);
  assert.deepEqual(h.state,before);assert.equal(h.saves,0);
  await h.cancel();await h.confirm();
  assert.deepEqual(h.state,before);assert.equal(h.saves,0);
  h.interactions.notify([['4001',null]]);await h.confirm();await h.confirm();
  const r=h.state.rows.find(r=>r.id==='4001');
  assert.equal(h.saves,1);assert.equal(r.cases.length,1);assert.equal(r.stage,'Уведомление');
  assert.equal(r.events.length,1);assert.ok(currentCase(r).drafts.length);
});

test('confirmation with several channels creates one case; empty or unavailable selection changes nothing',async t=>{
  const h=harness(t),before=structuredClone(h.state);
  h.interactions.notify([['4001',null]]);h.channels([]);
  assert.match(h.html,/data-flow-confirm disabled/);await h.cancel();
  assert.deepEqual(h.state,before);
  h.interactions.notify([['4002',null]]);assert.match(h.html,/data-flow-confirm disabled/);await h.cancel();
  assert.deepEqual(h.state,before);assert.equal(h.saves,0);
  h.interactions.notify([['4001',null]]);h.channels(['app','email','notice','receipt']);await h.confirm();
  const r=h.state.rows.find(r=>r.id==='4001');
  assert.equal(r.cases.length,1);assert.equal(r.events.length,4);assert.equal(h.saves,1);
});

test('changes after preview block confirmation without overwriting payment or creating a case',async t=>{
  const h=harness(t),r=h.state.rows.find(r=>r.id==='4001');
  h.interactions.notify([[r.id,null]]);
  r.principal-=100;
  const before=structuredClone(h.state);await h.confirm();
  assert.deepEqual(h.state,before);assert.equal(h.saves,0);
  assert.match(h.nodes['#flowError'].innerHTML,/изменились/);
});

test('cancelling forms across notification, agreement, court, enforcement and closure preserves all data',async t=>{
  const h=harness(t);
  const scenarios=[['Уведомление','outcome'],['Уведомление','agreement'],
    ['Соглашение','outcome'],['Соглашение','transition'],['Приказ','legal'],
    ['Приказ','transition'],['Иск','legal'],['Иск','receiveExecution'],
    ['Приставы','legal']];
  for(const [stage,action] of scenarios){
    const r=h.state.rows.find(r=>r.id.startsWith('УЧ-')&&r.stage===stage);
    const before=structuredClone(h.state),saves=h.saves;
    h.workbench.open(action,r.id);await h.cancel();
    assert.deepEqual(h.state,before,`${stage}: ${action}`);assert.equal(h.saves,saves);
  }
  const r=h.state.rows.find(r=>r.id==='УЧ-003');
  let before=structuredClone(h.state);h.interactions.enforcement(r.id,'bank');await h.cancel();
  assert.deepEqual(h.state,before);
  const c=currentCase(r);allocate(r,c.remaining.principal+c.remaining.penalty+c.remaining.fee,{...c.remaining},c.id);
  before=structuredClone(h.state);h.workbench.open('closeCase',r.id);await h.cancel();
  assert.deepEqual(h.state,before);assert.equal(h.saves,0);
});
