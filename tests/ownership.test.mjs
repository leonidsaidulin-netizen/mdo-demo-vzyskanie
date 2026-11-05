import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,allocate} from '../dist/model.mjs';
import {installOwnerExample} from '../dist/demo-billing.mjs';
import {createCase,createOwnerCases,unassigned,amount} from '../dist/cases.mjs';
import {splitMoney,ownersSummary,ownerLabel} from '../dist/ownership.mjs';
import {validateBilling} from '../dist/billing.mjs';
const setup=()=>{const s=seed();installOwnerExample(s);return s.rows.find(r=>r.id==='ДОЛИ-001');};
test('list distinguishes all account owners from the owner of an individual case',()=>{
 const r=setup(),[a,b]=createOwnerCases(r);
 assert.match(ownersSummary(r),/Собственников по ЛС: 2/);
 assert.match(ownersSummary(r),/Собственник А \(50%\); Собственник Б \(50%\)/);
 assert.match(ownerLabel(a),/Собственник А/);assert.match(ownerLabel(b),/Собственник Б/);
 assert.equal(ownersSummary({}), 'Собственники по ЛС не загружены');
});
test('shared case: half paid does not reduce the other owner',()=>{
 const r=setup(),c=createCase(r,r.period,unassigned(r)),a=c.ownerBalances[0],b=structuredClone(c.ownerBalances[1]);
 assert.throws(()=>allocate(r,510000,{principal:500000,penalty:10000,fee:0},c.id),/Выберите собственника/);
 allocate(r,510000,{principal:500000,penalty:10000,fee:0},c.id,{ownerId:a.id,reference:'1'});
 assert.equal(amount(a.remaining),0);assert.deepEqual(c.ownerBalances[1],b);assert.equal(amount(c.remaining),510000);validateBilling(r);
 const before=structuredClone(r);assert.throws(()=>allocate(r,1,{principal:1,penalty:0,fee:0},c.id,{ownerId:a.id}));assert.deepEqual(r,before);
 assert.equal(r.payments[0].ownerId,a.id);
});
test('separate owner cases preserve billing and prevent double creation',()=>{
 const r=setup(),[a,b]=createOwnerCases(r);assert.equal(amount(unassigned(r)),0);validateBilling(r);
 allocate(r,amount(a.remaining),{...a.remaining},a.id,{reference:'1'});assert.equal(amount(a.remaining),0);assert.equal(amount(b.remaining),510000);validateBilling(r);
 assert.throws(()=>createOwnerCases(r));assert.equal(r.cases.length,2);
 const restored=JSON.parse(JSON.stringify(r));assert.equal(restored.cases[1].ownerBalances[0].name,'Собственник Б');
});
test('rounding preserves every kopeck and invalid shares are rejected atomically',()=>{
 assert.deepEqual(splitMoney(101,[{share:50},{share:50}]),[51,50]);
 const r=setup();r.owners[0].share=40;const before=structuredClone(r);assert.throws(()=>createOwnerCases(r));assert.deepEqual(r,before);
});
