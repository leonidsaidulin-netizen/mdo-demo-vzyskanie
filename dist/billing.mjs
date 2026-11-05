const sum=(rows,key)=>rows.reduce((n,x)=>n+(x[key]||0),0);
export const principalDue=x=>x.charged-x.paid;
export const penaltyDue=x=>(x.penalty||0)-(x.penaltyPaid||0);
export function billingLines(r,caseId=null){return (r.billing?.lines||[]).filter(x=>(x.caseId||null)===caseId);}
export function billingParts(lines){return {principal:lines.reduce((n,x)=>n+principalDue(x),0),penalty:lines.reduce((n,x)=>n+penaltyDue(x),0),fee:0};}
export function billingPeriod(lines){
  const months=[...new Set(lines.filter(x=>principalDue(x)+penaltyDue(x)>0).map(x=>x.month))].sort();
  if(!months.length)return '';
  const start=months[0],last=months.at(-1),[y,m]=last.split('-').map(Number),end=new Date(Date.UTC(y,m,0)).getUTCDate();
  return `01.${start.slice(5)}.${start.slice(0,4)} — ${end}.${last.slice(5)}.${last.slice(0,4)}`;
}
export function refreshMonthly(r){
  if(!r.billing)return;
  let balance=0;
  r.charges=[...new Set(r.billing.lines.map(x=>x.month))].sort().map(month=>{
    const lines=r.billing.lines.filter(x=>x.month===month),opening=balance,charges=sum(lines,'charged'),payments=sum(lines,'paid');
    balance+=charges-payments;
    return {month,area:r.billing.area,formula:lines.map(x=>`${x.service}: ${x.formula}`).join('; '),opening,charges,payments,closing:balance};
  });
}
export function validateBilling(r){
  if(!r.billing)return;
  const lines=r.billing.lines;
  if(new Set(lines.map(x=>x.id)).size!==lines.length)throw Error('В расчёте повторились начисления');
  for(const x of lines){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(x.month)||[x.charged,x.paid,x.penalty||0,x.penaltyPaid||0].some(v=>!Number.isSafeInteger(v)||v<0)||principalDue(x)<0||penaltyDue(x)<0)throw Error('Некорректная строка расчёта');
    if(x.caseId&&!r.cases.some(c=>c.id===x.caseId))throw Error('Начисление связано с отсутствующим делом');
  }
  const all=billingParts(lines);
  if(all.principal!==r.principal||all.penalty!==r.penalty)throw Error('Расчёт по услугам не совпадает с задолженностью ЛС');
  for(const c of r.cases){const p=billingParts(billingLines(r,c.id));if(p.principal!==c.remaining.principal||p.penalty!==c.remaining.penalty)throw Error('Расчёт не совпадает с долгом дела');}
}
export function assignBillingCase(r,c){
  if(!r.billing)return;
  const lines=billingLines(r).filter(x=>principalDue(x)+penaltyDue(x)>0),p=billingParts(lines);
  if(p.principal!==c.remaining.principal||p.penalty!==c.remaining.penalty||c.period!==billingPeriod(lines))throw Error('Для учебного расчёта используйте предложенный период и полный долг вне дел');
  lines.forEach(x=>x.caseId=c.id);
  c.calculation=structuredClone(lines);
}
export function payBilling(r,allocation,caseId){
  if(!r.billing)return;
  validateBilling(r);
  const lines=billingLines(r,caseId),parts=billingParts(lines);
  if(allocation.principal>parts.principal||allocation.penalty>parts.penalty)throw Error('Платёж превышает начисления выбранного периода');
  // The exercise's payment basis allocates oldest charges first, not a legal default.
  for(const [component,paid,due] of [['principal','paid',principalDue],['penalty','penaltyPaid',penaltyDue]]){
    let left=allocation[component];for(const x of [...lines].sort((a,b)=>a.month.localeCompare(b.month))){const n=Math.min(left,due(x));x[paid]=(x[paid]||0)+n;left-=n;}
  }
  refreshMonthly(r);
}
