const keys=['principal','penalty','fee'];
export function ownersSummary(r){
  const owners=r.owners||[];
  return owners.length?`Собственников по ЛС: ${owners.length} · ${owners.map(o=>`${o.name} (${o.share}%)`).join('; ')}`:'Собственники по ЛС не загружены';
}
export function splitMoney(value,owners){
  const weights=owners.map(o=>Math.round(o.share*100));
  if(!owners.length||weights.some(x=>x<=0)||weights.reduce((a,b)=>a+b,0)!==10000)throw Error('Доли собственников должны составлять 100%');
  const parts=weights.map(w=>Math.floor(value*w/10000));
  const order=weights.map((w,i)=>({i,r:value*w%10000})).sort((a,b)=>b.r-a.r||a.i-b.i);
  for(let n=value-parts.reduce((a,b)=>a+b,0),i=0;i<n;i++)parts[order[i].i]++;
  return parts;
}
export function assignOwners(r,c){
  if(c.ownerBalances)throw Error('Распределение уже сохранено');
  if(r.caseBalanceConflict)throw Error('Сначала подтвердите остатки дела');
  const owners=r.owners.map((o,i)=>({...o,id:o.id||`${r.id}:owner:${i}`}));
  const parts=Object.fromEntries(keys.map(k=>[k,splitMoney(c.remaining[k],owners)]));
  c.ownerBalances=owners.map((o,i)=>({...o,initial:Object.fromEntries(keys.map(k=>[k,parts[k][i]])),remaining:Object.fromEntries(keys.map(k=>[k,parts[k][i]]))}));
  c.ownershipBasis='Распределение остатка по подтверждённым долям';
}
export function ownerPayment(c,allocation,ownerId){
  if(!c?.ownerBalances)return null;
  const o=c.ownerBalances.find(x=>x.id===ownerId)||(!ownerId&&c.ownerBalances.length===1?c.ownerBalances[0]:null);
  if(!o)throw Error('Выберите собственника, чей долг погашается');
  if(keys.some(k=>allocation[k]>o.remaining[k]))throw Error('Платёж превышает долг выбранного собственника');
  if(keys.some(k=>c.ownerBalances.reduce((s,x)=>s+x.remaining[k],0)!==c.remaining[k]))throw Error('Распределение по собственникам требует сверки');
  return o;
}
export function ownerLabel(c){return c?.ownerBalances?.length===1?`${c.ownerBalances[0].name} · доля ${c.ownerBalances[0].share}%`:'Общий долг лицевого счёта';}
