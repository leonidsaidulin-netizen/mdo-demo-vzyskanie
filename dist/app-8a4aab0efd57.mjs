// dist/billing.mjs
var sum = (rows, key) => rows.reduce((n, x) => n + (x[key] || 0), 0);
var principalDue = (x) => x.charged - x.paid;
var penaltyDue = (x) => (x.penalty || 0) - (x.penaltyPaid || 0);
function billingLines(r, caseId = null) {
  return (r.billing?.lines || []).filter((x) => (x.caseId || null) === caseId);
}
function billingParts(lines) {
  return { principal: lines.reduce((n, x) => n + principalDue(x), 0), penalty: lines.reduce((n, x) => n + penaltyDue(x), 0), fee: 0 };
}
function billingPeriod(lines) {
  const months = [...new Set(lines.filter((x) => principalDue(x) + penaltyDue(x) > 0).map((x) => x.month))].sort();
  if (!months.length) return "";
  const start = months[0], last = months.at(-1), [y, m] = last.split("-").map(Number), end = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `01.${start.slice(5)}.${start.slice(0, 4)} \u2014 ${end}.${last.slice(5)}.${last.slice(0, 4)}`;
}
function refreshMonthly(r) {
  if (!r.billing) return;
  let balance = 0;
  r.charges = [...new Set(r.billing.lines.map((x) => x.month))].sort().map((month) => {
    const lines = r.billing.lines.filter((x) => x.month === month), opening = balance, charges = sum(lines, "charged"), payments = sum(lines, "paid");
    balance += charges - payments;
    return { month, area: r.billing.area, formula: lines.map((x) => `${x.service}: ${x.formula}`).join("; "), opening, charges, payments, closing: balance };
  });
}
function validateBilling(r) {
  if (!r.billing) return;
  const lines = r.billing.lines;
  if (new Set(lines.map((x) => x.id)).size !== lines.length) throw Error("\u0412 \u0440\u0430\u0441\u0447\u0451\u0442\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u043B\u0438\u0441\u044C \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F");
  for (const x of lines) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(x.month) || [x.charged, x.paid, x.penalty || 0, x.penaltyPaid || 0].some((v) => !Number.isSafeInteger(v) || v < 0) || principalDue(x) < 0 || penaltyDue(x) < 0) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0441\u0442\u0440\u043E\u043A\u0430 \u0440\u0430\u0441\u0447\u0451\u0442\u0430");
    if (x.caseId && !r.cases.some((c) => c.id === x.caseId)) throw Error("\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0435 \u0441\u0432\u044F\u0437\u0430\u043D\u043E \u0441 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u043C \u0434\u0435\u043B\u043E\u043C");
  }
  const all = billingParts(lines);
  if (all.principal !== r.principal || all.penalty !== r.penalty) throw Error("\u0420\u0430\u0441\u0447\u0451\u0442 \u043F\u043E \u0443\u0441\u043B\u0443\u0433\u0430\u043C \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C\u044E \u041B\u0421");
  for (const c of r.cases) {
    const p = billingParts(billingLines(r, c.id));
    if (p.principal !== c.remaining.principal || p.penalty !== c.remaining.penalty) throw Error("\u0420\u0430\u0441\u0447\u0451\u0442 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441 \u0434\u043E\u043B\u0433\u043E\u043C \u0434\u0435\u043B\u0430");
  }
}
function assignBillingCase(r, c) {
  if (!r.billing) return;
  const lines = billingLines(r).filter((x) => principalDue(x) + penaltyDue(x) > 0), p = billingParts(lines);
  if (p.principal !== c.remaining.principal || p.penalty !== c.remaining.penalty || c.period !== billingPeriod(lines)) throw Error("\u0414\u043B\u044F \u0443\u0447\u0435\u0431\u043D\u043E\u0433\u043E \u0440\u0430\u0441\u0447\u0451\u0442\u0430 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434 \u0438 \u043F\u043E\u043B\u043D\u044B\u0439 \u0434\u043E\u043B\u0433 \u0432\u043D\u0435 \u0434\u0435\u043B");
  lines.forEach((x) => x.caseId = c.id);
  c.calculation = structuredClone(lines);
}
function payBilling(r, allocation, caseId) {
  if (!r.billing) return;
  validateBilling(r);
  const lines = billingLines(r, caseId), parts = billingParts(lines);
  if (allocation.principal > parts.principal || allocation.penalty > parts.penalty) throw Error("\u041F\u043B\u0430\u0442\u0451\u0436 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u043F\u0435\u0440\u0438\u043E\u0434\u0430");
  for (const [component, paid, due] of [["principal", "paid", principalDue], ["penalty", "penaltyPaid", penaltyDue]]) {
    let left = allocation[component];
    for (const x of [...lines].sort((a, b) => a.month.localeCompare(b.month))) {
      const n = Math.min(left, due(x));
      x[paid] = (x[paid] || 0) + n;
      left -= n;
    }
  }
  refreshMonthly(r);
}

// dist/ownership.mjs
var keys = ["principal", "penalty", "fee"];
function ownersSummary(r) {
  const owners = r.owners || [];
  return owners.length ? `\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u043E\u0432 \u043F\u043E \u041B\u0421: ${owners.length} \xB7 ${owners.map((o) => `${o.name} (${o.share}%)`).join("; ")}` : "\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0438 \u043F\u043E \u041B\u0421 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u044B";
}
function splitMoney(value, owners) {
  const weights = owners.map((o) => Math.round(o.share * 100));
  if (!owners.length || weights.some((x) => x <= 0) || weights.reduce((a, b) => a + b, 0) !== 1e4) throw Error("\u0414\u043E\u043B\u0438 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u043E\u0432 \u0434\u043E\u043B\u0436\u043D\u044B \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0442\u044C 100%");
  const parts = weights.map((w) => Math.floor(value * w / 1e4));
  const order = weights.map((w, i) => ({ i, r: value * w % 1e4 })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let n = value - parts.reduce((a, b) => a + b, 0), i = 0; i < n; i++) parts[order[i].i]++;
  return parts;
}
function assignOwners(r, c) {
  if (c.ownerBalances) throw Error("\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0443\u0436\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E");
  if (r.caseBalanceConflict) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043E\u0441\u0442\u0430\u0442\u043A\u0438 \u0434\u0435\u043B\u0430");
  const owners = r.owners.map((o, i) => ({ ...o, id: o.id || `${r.id}:owner:${i}` }));
  const parts = Object.fromEntries(keys.map((k) => [k, splitMoney(c.remaining[k], owners)]));
  c.ownerBalances = owners.map((o, i) => ({ ...o, initial: Object.fromEntries(keys.map((k) => [k, parts[k][i]])), remaining: Object.fromEntries(keys.map((k) => [k, parts[k][i]])) }));
  c.ownershipBasis = "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u0442\u043A\u0430 \u043F\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u043C \u0434\u043E\u043B\u044F\u043C";
}
function ownerPayment(c, allocation, ownerId) {
  if (!c?.ownerBalances) return null;
  const o = c.ownerBalances.find((x) => x.id === ownerId) || (!ownerId && c.ownerBalances.length === 1 ? c.ownerBalances[0] : null);
  if (!o) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430, \u0447\u0435\u0439 \u0434\u043E\u043B\u0433 \u043F\u043E\u0433\u0430\u0448\u0430\u0435\u0442\u0441\u044F");
  if (keys.some((k) => allocation[k] > o.remaining[k])) throw Error("\u041F\u043B\u0430\u0442\u0451\u0436 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u0434\u043E\u043B\u0433 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430");
  if (keys.some((k) => c.ownerBalances.reduce((s, x) => s + x.remaining[k], 0) !== c.remaining[k])) throw Error("\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043F\u043E \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430\u043C \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0441\u0432\u0435\u0440\u043A\u0438");
  return o;
}
function ownerLabel(c) {
  return c?.ownerBalances?.length === 1 ? `${c.ownerBalances[0].name} \xB7 \u0434\u043E\u043B\u044F ${c.ownerBalances[0].share}%` : "\u041E\u0431\u0449\u0438\u0439 \u0434\u043E\u043B\u0433 \u043B\u0438\u0446\u0435\u0432\u043E\u0433\u043E \u0441\u0447\u0451\u0442\u0430";
}

// dist/cases.mjs
var COMPONENTS = ["principal", "penalty", "fee"];
var amount = (x) => COMPONENTS.reduce((s, k) => s + (x?.[k] || 0), 0);
var currentCase = (r) => r.cases?.find((c) => c.id === r.caseId);
var noticeScope = (r) => `${r.noticeEpoch || 1}:${r.period}`;
function currentNotices(r) {
  return r.events.filter((e) => e.scope === noticeScope(r) && ["app", "email", "max", "receipt", "robot", "notice"].includes(e.action) && !e.status.startsWith("\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E:"));
}
function initializeCases(r, trusted = false) {
  r.noticeEpoch ||= 1;
  if (!r.cases) {
    r.cases = r.caseId ? [{
      id: r.caseId,
      stage: r.stage,
      period: r.claim?.period || r.period,
      claim: r.claim ? structuredClone(r.claim) : null,
      remaining: Object.fromEntries(COMPONENTS.map((k) => [k, r[k]])),
      balanceConfirmed: trusted,
      documents: [],
      legal: {},
      schedule: [],
      closedReason: ""
    }] : [];
    if (!trusted && r.cases.length) r.caseBalanceConflict = true;
  }
  r.documents ||= [];
  r.owners ||= [];
  r.charges ||= [];
  r.ownerHistory ||= [];
  return r;
}
function unassigned(r) {
  return Object.fromEntries(COMPONENTS.map((k) => [k, r[k] - (r.cases || []).filter((c) => c.stage !== "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E").reduce((s, c) => s + (c.remaining[k] || 0), 0)]));
}
function selectCase(r, id) {
  if (!id) {
    r.caseId = null;
    r.claim = null;
    r.stage = "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430";
    return;
  }
  const c = r.cases.find((c2) => c2.id === id);
  if (!c) throw Error("\u0414\u0435\u043B\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E");
  r.caseId = c.id;
  r.claim = c.claim;
  r.stage = c.stage;
}
function createCase(r, period, parts) {
  if (r.caseBalanceConflict) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u0434\u043E\u043B\u0433 \u043F\u043E \u0434\u0435\u043B\u0430\u043C");
  if (r.unallocated > 0 || r.disputed || r.reviewTask?.status === "open" || Date.parse("2026-10-29") - Date.parse(r.asOf) > 7 * 864e5) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0435 \u0441\u0432\u0435\u0440\u043A\u0443 \u043B\u0438\u0446\u0435\u0432\u043E\u0433\u043E \u0441\u0447\u0451\u0442\u0430");
  const available = unassigned(r);
  if (!period?.trim() || COMPONENTS.some((k) => !Number.isSafeInteger(parts[k]) || parts[k] < 0 || parts[k] > available[k]) || amount(parts) <= 0) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0435\u0440\u0438\u043E\u0434 \u0438 \u0441\u0443\u043C\u043C\u0443 \u0432 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u0445 \u0434\u043E\u043B\u0433\u0430 \u0432\u043D\u0435 \u0434\u0435\u043B");
  const c = { id: `\u0412\u0417-${crypto.randomUUID().slice(0, 8)}`, stage: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", createdAt: "2026-10-29", stageEnteredAt: "2026-10-29", period: period.trim(), remaining: { ...parts }, balanceConfirmed: true, claim: null, documents: [], legal: {}, schedule: [], closedReason: "" };
  if (r.owners?.length > 1) assignOwners(r, c);
  assignBillingCase(r, c);
  r.cases.push(c);
  selectCase(r, c.id);
  return c;
}
function createOwnerCases(r) {
  const copy = structuredClone(r), base = createCase(copy, copy.period, unassigned(copy));
  if (!base.ownerBalances && copy.owners.length) assignOwners(copy, base);
  if (!base.ownerBalances?.length) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u043E\u0432 \u0438 \u0434\u043E\u043B\u0438");
  const cases = base.ownerBalances.map((o) => ({ ...structuredClone(base), id: `\u0412\u0417-${crypto.randomUUID().slice(0, 8)}`, remaining: { ...o.remaining }, ownerBalances: [structuredClone(o)] }));
  if (copy.billing) {
    copy.billing.lines = copy.billing.lines.flatMap((line) => {
      if (line.caseId !== base.id) return [line];
      const owners = base.ownerBalances, paid = splitMoney(line.paid, owners), due = splitMoney(line.charged - line.paid, owners), pp = splitMoney(line.penaltyPaid || 0, owners), pd = splitMoney((line.penalty || 0) - (line.penaltyPaid || 0), owners);
      return cases.map((c, i) => ({ ...line, id: `${line.id}:${i}`, caseId: c.id, paid: paid[i], charged: paid[i] + due[i], penaltyPaid: pp[i], penalty: pp[i] + pd[i] }));
    });
    for (const c of cases) {
      c.calculation = structuredClone(copy.billing.lines.filter((l) => l.caseId === c.id));
      c.remaining.principal = c.calculation.reduce((s, l) => s + l.charged - l.paid, 0);
      c.remaining.penalty = c.calculation.reduce((s, l) => s + l.penalty - l.penaltyPaid, 0);
      c.ownerBalances[0].remaining = { ...c.remaining };
      c.ownerBalances[0].initial = { ...c.remaining };
    }
  }
  copy.cases = copy.cases.filter((c) => c.id !== base.id).concat(cases);
  selectCase(copy, cases[0].id);
  Object.assign(r, copy);
  return cases;
}
function workRecord(r) {
  const choices = (r.cases || []).filter((c2) => c2.stage !== "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E").map((c2) => ({ c: c2, rank: amount(c2.remaining) === 0 ? 0 : c2.schedule?.some((x) => !x.paid && x.date < "2026-10-29") ? 1 : c2.legal?.nextDate < "2026-10-29" ? 1 : c2.stage === "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435" ? 3 : 4 }));
  if (amount(unassigned(r)) > 0) choices.push({ c: null, rank: 2 });
  choices.sort((a, b) => a.rank - b.rank);
  if (!choices.length) return { ...r, _caseView: true };
  const c = choices[0].c;
  return { ...r, caseId: c?.id || null, claim: c?.claim || null, stage: c?.stage || "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", _caseView: true };
}
function stagePortions(r) {
  const parts = (r.cases || []).map((c) => ({ stage: c.stage, amount: amount(c.remaining), id: c.id }));
  const rest = amount(unassigned(r));
  if (rest > 0 || !parts.length) parts.push({ stage: "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", amount: Math.max(rest, 0), id: null });
  return parts;
}
function reconcileCases(r, balances) {
  if (balances.length !== r.cases.length || new Set(balances.map((b) => b.id)).size !== balances.length) throw Error("\u041D\u0443\u0436\u043D\u044B \u043E\u0441\u0442\u0430\u0442\u043A\u0438 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0434\u0435\u043B\u0430");
  for (const b of balances) {
    const c = r.cases.find((c2) => c2.id === b.id);
    if (!c || COMPONENTS.some((k) => !Number.isSafeInteger(b[k]) || b[k] < 0) || c.stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" && amount(b) > 0) throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043E\u0441\u0442\u0430\u0442\u043A\u0438 \u0434\u0435\u043B");
  }
  if (COMPONENTS.some((k) => balances.reduce((s, b) => s + b[k], 0) > r[k])) throw Error("\u0421\u0443\u043C\u043C\u0430 \u0434\u0435\u043B \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u041B\u0421");
  for (const b of balances) {
    const c = r.cases.find((c2) => c2.id === b.id);
    c.remaining = Object.fromEntries(COMPONENTS.map((k) => [k, b[k]]));
    c.balanceConfirmed = true;
  }
  r.caseBalanceConflict = false;
}

// dist/model.mjs
var TODAY = "2026-10-29";
var STAGES = ["\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435", "\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B", "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E", "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C"];
var canonicalStage = (stage) => ({ "\u0414\u043E\u0441\u0443\u0434\u0435\u0431\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430": "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0421\u0443\u0434": "\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435": "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B" })[stage] || stage;
var CATEGORIES = ["\u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0430", "\u041F\u0435\u0440\u0432\u0438\u0447\u043D\u0430\u044F \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430", "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C", "\u041E\u0431\u0435\u0449\u0430\u043D\u0438\u0435 \u043E\u043F\u043B\u0430\u0442\u044B", "\u041E\u0441\u043F\u0430\u0440\u0438\u0432\u0430\u0435\u0442 \u0434\u043E\u043B\u0433"];
var ACTIONS = { app: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u0432 \u041C\u041F", email: "\u041F\u0438\u0441\u044C\u043C\u043E \u043D\u0430 email", max: "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0432 MAX", receipt: "\u041A\u0432\u0438\u0442\u0430\u043D\u0446\u0438\u044F + \u043F\u0440\u0435\u0442\u0435\u043D\u0437\u0438\u044F", robot: "\u041E\u0431\u0437\u0432\u043E\u043D \u0440\u043E\u0431\u043E\u0442\u043E\u043C", notice: "\u041F\u0435\u0447\u0430\u0442\u043D\u043E\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", court: "\u0421\u0443\u0434\u0435\u0431\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442", case: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0434\u0435\u043B\u043E", task: "\u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443" };
var OUTCOMES = ["\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u041D\u0435\u0442 \u043E\u0442\u0432\u0435\u0442\u0430 (\u0434\u0435\u043C\u043E)", "\u041E\u0431\u0435\u0449\u0430\u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0430 (\u0434\u0435\u043C\u043E)"];
var money = (n) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(n / 100);
var total = (r) => r.principal + r.penalty + r.fee;
var days = (date2, today = TODAY) => Math.floor((Date.parse(today) - Date.parse(date2)) / 864e5);
function seed() {
  const rows = [
    ["1001", "\u0421\u043E\u043B\u043D\u0435\u0447\u043D\u0430\u044F, 12", 12, 452e4, 126500, 0, 126, "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", "\u0420\u0426 \u041C\u0414\u041E", "\u041F\u0435\u0440\u0432\u0438\u0447\u043D\u0430\u044F \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430"],
    ["1002", "\u0421\u043E\u043B\u043D\u0435\u0447\u043D\u0430\u044F, 12", 28, 1834e3, 45e3, 0, 65, "\u0414\u043E\u0441\u0443\u0434\u0435\u0431\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430", "\u0420\u0426 \u041C\u0414\u041E", "\u041E\u0431\u0435\u0449\u0430\u043D\u0438\u0435 \u043E\u043F\u043B\u0430\u0442\u044B"],
    ["1003", "\u0421\u043E\u043B\u043D\u0435\u0447\u043D\u0430\u044F, 12", 41, 339258, 0, 2e5, 148, "\u0421\u0443\u0434", "\u0420\u0426 \u041C\u0414\u041E", "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C"],
    ["1004", "\u0421\u043E\u043B\u043D\u0435\u0447\u043D\u0430\u044F, 12", 8, 0, 0, 0, 0, "\u0418\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435", "\u0420\u0426 \u041C\u0414\u041E", "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C"],
    ["2001", "\u041F\u0430\u0440\u043A\u043E\u0432\u0430\u044F, 7", 16, 762e4, 215e3, 2e5, 238, "\u0418\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435", "\u0418\u043C\u043F\u043E\u0440\u0442 1\u0421", "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C"],
    ["2002", "\u041F\u0430\u0440\u043A\u043E\u0432\u0430\u044F, 7", 32, 124e4, 28e3, 0, 44, "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", "\u0418\u043C\u043F\u043E\u0440\u0442 1\u0421", "\u041F\u0435\u0440\u0432\u0438\u0447\u043D\u0430\u044F \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430"],
    ["2003", "\u041F\u0430\u0440\u043A\u043E\u0432\u0430\u044F, 7", 7, 3185e3, 97e3, 0, 98, "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435", "\u0418\u043C\u043F\u043E\u0440\u0442 1\u0421", "\u041E\u0431\u0435\u0449\u0430\u043D\u0438\u0435 \u043E\u043F\u043B\u0430\u0442\u044B"],
    ["2004", "\u041F\u0430\u0440\u043A\u043E\u0432\u0430\u044F, 7", 21, 564e4, 163e3, 0, 180, "\u0414\u043E\u0441\u0443\u0434\u0435\u0431\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430", "\u0418\u043C\u043F\u043E\u0440\u0442 1\u0421", "\u041E\u0441\u043F\u0430\u0440\u0438\u0432\u0430\u0435\u0442 \u0434\u043E\u043B\u0433"],
    ["3001", "\u041C\u0438\u0440\u0430, 24", 5, 2156e3, 64e3, 0, 87, "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", "\u0420\u0426 \u041C\u0414\u041E", "\u041F\u0435\u0440\u0432\u0438\u0447\u043D\u0430\u044F \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430"],
    ["3002", "\u041C\u0438\u0440\u0430, 24", 19, 681e4, 184e3, 2e5, 211, "\u0421\u0443\u0434", "\u0420\u0426 \u041C\u0414\u041E", "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C"],
    ["3003", "\u041C\u0438\u0440\u0430, 24", 33, 89e4, 0, 0, 32, "\u0414\u043E\u0441\u0443\u0434\u0435\u0431\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430", "\u0420\u0426 \u041C\u0414\u041E", "\u041F\u0435\u0440\u0432\u0438\u0447\u043D\u0430\u044F \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430"],
    ["3004", "\u041C\u0438\u0440\u0430, 24", 54, 418e4, 115e3, 0, 136, "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435", "\u0420\u0426 \u041C\u0414\u041E", "\u041E\u0431\u0435\u0449\u0430\u043D\u0438\u0435 \u043E\u043F\u043B\u0430\u0442\u044B"],
    ["4001", "\u0420\u0435\u0447\u043D\u0430\u044F, 3", 9, 94e4, 0, 0, 35, "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", "\u0418\u043C\u043F\u043E\u0440\u0442 CSV", "\u041F\u0435\u0440\u0432\u0438\u0447\u043D\u0430\u044F \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430"],
    ["4002", "\u0420\u0435\u0447\u043D\u0430\u044F, 3", 18, 2675e3, 76500, 0, 103, "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", "\u0418\u043C\u043F\u043E\u0440\u0442 CSV", "\u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0430"],
    ["4003", "\u0420\u0435\u0447\u043D\u0430\u044F, 3", 27, 489e4, 142e3, 2e5, 190, "\u0418\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435", "\u0418\u043C\u043F\u043E\u0440\u0442 CSV", "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C"],
    ["4004", "\u0420\u0435\u0447\u043D\u0430\u044F, 3", 36, 0, 0, 0, 0, "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E", "\u0418\u043C\u043F\u043E\u0440\u0442 CSV", "\u041F\u0435\u0440\u0432\u0438\u0447\u043D\u0430\u044F \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430"]
  ].map((a, i) => {
    const [account, building, flat, principal, penalty, fee, age, stage, source, category] = a;
    const r = { id: account, account, company: i < 8 ? "\u0423\u041A \xAB\u0414\u0435\u043C\u043E-\u043A\u0432\u0430\u0440\u0442\u0430\u043B\xBB" : "\u0423\u041A \xAB\u0414\u0435\u043C\u043E-\u043F\u0430\u0440\u043A\xBB", building, flat, principal, penalty, fee, age, stage, source, sourceId: source, category, owner: i % 3 === 0 ? "\u0410. \u0421\u043E\u043A\u043E\u043B\u043E\u0432\u0430" : "\u041C. \u041E\u0440\u043B\u043E\u0432\u0430", asOf: i === 13 ? "2026-10-12" : TODAY, phone: i !== 5, app: i % 3 !== 1, email: i % 4 !== 2, disputed: i === 7, unallocated: i === 8 ? 1e6 : 0, promise: i === 1 ? "2026-10-25" : i === 6 ? "2026-11-02" : null, nextDate: i === 1 ? "2026-10-25" : "2026-10-29", next: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u043F\u043B\u0430\u0442\u0443", period: "01.06.2026 \u2014 30.09.2026", events: [], payments: [], caseId: stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" ? null : `\u0412\u0417-${230 + i}`, claim: null };
    if (age > 0) {
      const from = new Date(Date.parse(TODAY) - age * 864e5).toISOString().slice(0, 10);
      r.period = `${from.slice(8, 10)}.${from.slice(5, 7)}.${from.slice(0, 4)} \u2014 30.09.2026`;
    }
    if (["\u0421\u0443\u0434", "\u0418\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435", "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"].includes(stage)) r.claim = { amount: principal + penalty + fee || 45e4, period: r.period, registered: "2026-10-05" };
    if (i === 9) {
      r.claim.amount -= 6e5;
      r.claim.period = "01.06.2026 \u2014 31.08.2026";
    }
    if (i === 1 || i === 2 || i === 6) r.events.push({ id: `seed-${i}`, at: "2026-10-20T10:00:00", action: i === 2 ? "court" : "app", label: i === 2 ? "\u0421\u0443\u0434\u0435\u0431\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442" : "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u0432 \u041C\u041F", status: "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", note: i === 2 ? "\u041A\u043E\u043F\u0438\u044F \u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0433\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430; \u043E\u0442\u043C\u0435\u0442\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u044E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u0435." : "\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435 \u043E\u0431 \u043E\u043F\u043B\u0430\u0442\u0435", amount: total(r) });
    r.stage = canonicalStage(r.stage);
    r.entrance = String(Math.ceil(Number(flat) / 20));
    r.max = i % 3 === 0;
    if (i === 9) r.stage = "\u0418\u0441\u043A";
    if ([1, 2, 9].includes(i)) {
      const amount2 = i === 1 ? 5e5 : i === 2 ? 2e5 : 1e6;
      const paidFee = i === 9 ? 2e5 : 0;
      r.payments.push({ at: "2026-10-23", amount: amount2, principal: amount2 - paidFee, penalty: 0, fee: paidFee, stage: r.stage, afterNotice: i === 1 });
      if (r.claim) r.claim.amount += amount2;
    }
    initializeCases(r, true);
    if (["4001", "1002"].includes(account)) {
      r.owners = [{ name: `\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A \u041B\u0421 ${account}`, share: 100 }];
      r.charges = [{ month: "2026-09", area: 50, formula: "\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0440\u0435\u0435\u0441\u0442\u0440: \u043F\u0435\u0440\u0435\u043D\u043E\u0441 \u0434\u043E\u043B\u0433\u0430 \u0437\u0430 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u0435 \u043C\u0435\u0441\u044F\u0446\u044B", opening: principal, charges: 0, payments: 0, closing: principal }];
    }
    if (i === 9) r.cases[0].remaining.principal -= 6e5;
    for (const e of r.events) {
      e.scope = noticeScope(r);
      e.caseId = r.caseId;
    }
    for (const p of r.payments) p.scope = noticeScope(r);
    return r;
  });
  return { version: 1, rows, imports: [], updated: TODAY };
}
function recommendation(r) {
  if (!r._caseView) r = workRecord(r);
  if (r.reviewTask?.status === "open") return { key: "waiting", label: "\u0416\u0434\u0451\u043C \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u044F \u043E\u0442 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0430", detail: `${r.reviewTask.reason} \xB7 \u0441\u0440\u043E\u043A ${r.reviewTask.due}`, action: "review", tone: "amber" };
  if (r.caseBalanceConflict) return { key: "caseBalance", label: "\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0434\u043E\u043B\u0433 \u043F\u043E \u0434\u0435\u043B\u0443", detail: "\u041D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E, \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0433\u0430\u0441\u0438\u0442\u044C \u043F\u043E \u043A\u0430\u0436\u0434\u043E\u043C\u0443 \u0434\u0435\u043B\u0443. \u041D\u0443\u0436\u0435\u043D \u043E\u0442\u0432\u0435\u0442 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0430.", action: "review", tone: "amber" };
  if (r.unallocated > 0) return { key: "reconcile", label: "\u0420\u0430\u0437\u043D\u0435\u0441\u0442\u0438 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435", detail: `\u041F\u043E\u0441\u0442\u0443\u043F\u0438\u043B\u043E ${money(r.unallocated)}. \u041E\u0441\u0442\u0430\u0442\u043E\u043A \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D \u0434\u043E \u0441\u0432\u0435\u0440\u043A\u0438.`, action: "payment", tone: "amber" };
  if (days(r.asOf) > 7) return { key: "stale", label: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043E\u043A", detail: `\u0414\u0430\u043D\u043D\u044B\u0435 \u043D\u0430 ${r.asOf}. \u041C\u0430\u0441\u0441\u043E\u0432\u044B\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B.`, action: "source", tone: "amber" };
  if (total(r) === 0) return { key: r.stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" || !r.caseId ? "done" : "close", label: r.stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" ? "\u0414\u0435\u043B\u043E \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" : r.caseId ? "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u0435 \u0434\u0435\u043B\u0430" : "\u041D\u0435\u0442 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438", detail: "\u0417\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438 \u043D\u0435\u0442. \u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043D\u0435 \u043D\u0443\u0436\u043D\u044B.", action: "close", tone: "green" };
  if (r.disputed) return { key: "dispute", label: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F", detail: "\u0414\u043E\u043B\u0433 \u043E\u0441\u043F\u0430\u0440\u0438\u0432\u0430\u0435\u0442\u0441\u044F. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u0432\u0435\u0440\u043A\u0430 \u0441 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0438\u0435\u0439.", action: "task", tone: "amber" };
  const c = currentCase(r);
  if (c && c.stage !== "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" && amount(c.remaining) === 0) return { key: "close", label: "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u043E\u043F\u043B\u0430\u0447\u0435\u043D\u043D\u043E\u0435 \u0434\u0435\u043B\u043E", detail: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u044D\u0442\u043E\u0433\u043E \u0434\u0435\u043B\u0430 \u043F\u043E\u0433\u0430\u0448\u0435\u043D; \u043D\u043E\u0432\u044B\u0439 \u0434\u043E\u043B\u0433 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E.", action: "close", tone: "green" };
  if (r.task?.status === "open") return { key: r.task.due < TODAY ? "overdueTask" : "task", label: r.task.text, detail: `${r.task.due} \xB7 ${r.task.owner}`, action: "taskDone", tone: r.task.due < TODAY ? "red" : "neutral" };
  if (c?.stage === "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435") {
    const due = c.schedule?.filter((x) => !x.paid).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!c.agreement || !due) return { key: "agreement", label: "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u0438 \u0433\u0440\u0430\u0444\u0438\u043A", detail: "\u041D\u0435\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u0433\u043E \u0433\u0440\u0430\u0444\u0438\u043A\u0430 \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439.", action: "legal", tone: "amber" };
    return { key: due.date < TODAY ? "overdueAgreement" : "agreementDue", label: due.date < TODAY ? "\u041F\u043B\u0430\u0442\u0451\u0436 \u043F\u043E \u0433\u0440\u0430\u0444\u0438\u043A\u0443 \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D" : "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043B\u0430\u0442\u0451\u0436 \u043F\u043E \u0433\u0440\u0430\u0444\u0438\u043A\u0443", detail: `${due.date} \xB7 ${money(due.amount)}`, action: "legal", tone: due.date < TODAY ? "red" : "neutral" };
  }
  if (r.promise && r.promise < TODAY) return { key: "overdue", label: "\u041E\u0431\u0435\u0449\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043E", detail: `\u041E\u043F\u043B\u0430\u0442\u0430 \u043E\u0436\u0438\u0434\u0430\u043B\u0430\u0441\u044C ${r.promise}. \u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0438 \u0441\u0432\u044F\u0437\u0430\u0442\u044C\u0441\u044F.`, action: "robot", tone: "red" };
  if (r.promise && r.promise >= TODAY) return { key: "promise", label: "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u043E\u0431\u0435\u0449\u0430\u043D\u043D\u043E\u0439 \u043E\u043F\u043B\u0430\u0442\u044B", detail: `\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u043E\u043F\u043B\u0430\u0442\u0443 ${r.promise}. \u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433: \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435.`, action: "task", tone: "green" };
  const notices = currentNotices(r).filter((e) => c ? e.caseId === c.id : !e.caseId);
  if (["\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"].includes(r.stage) && !notices.length) return { key: "new", label: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", detail: `\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430 ${r.age} \u0434\u043D. \u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0439 \u043A\u0430\u043D\u0430\u043B.`, action: "channels", tone: "pink" };
  if (notices.some((e) => e.status === "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)")) return { key: "delivery", label: "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F", detail: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0443.", action: "history", tone: "neutral" };
  if (notices.some((e) => e.status === "\u041D\u0435\u0442 \u043E\u0442\u0432\u0435\u0442\u0430 (\u0434\u0435\u043C\u043E)") && !notices.some((e) => e.status === "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)")) return { key: "retryContact", label: "\u0421\u0432\u044F\u0437\u0430\u0442\u044C\u0441\u044F \u0434\u0440\u0443\u0433\u0438\u043C \u043A\u0430\u043D\u0430\u043B\u043E\u043C", detail: "\u041E\u0442\u0432\u0435\u0442 \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D \u043F\u043E \u0442\u0435\u043A\u0443\u0449\u0435\u043C\u0443 \u043F\u0435\u0440\u0438\u043E\u0434\u0443 \u0434\u043E\u043B\u0433\u0430.", action: "channels", tone: "amber" };
  const next = { "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435": "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0443 \u0438 \u043E\u043F\u043B\u0430\u0442\u0443", "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435": "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043B\u0430\u0442\u0451\u0436 \u043F\u043E \u0433\u0440\u0430\u0444\u0438\u043A\u0443", "\u041F\u0440\u0438\u043A\u0430\u0437": "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u043E \u043F\u0440\u0438\u043A\u0430\u0437\u0443", "\u0418\u0441\u043A": "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0435 \u0438\u0441\u043A\u0430", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B": "\u0421\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u043F\u043E \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u0443", "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C": "\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0432\u0438\u0434 \u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430" };
  return { key: "follow", label: next[r.stage] || r.next, detail: `\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C: ${c?.legal?.nextDate || r.nextDate}`, action: ["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B", "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C"].includes(r.stage) ? "legal" : "task", tone: "neutral" };
}
function upgradeUntouchedSampleDetails(state2) {
  if (state2.imports?.length) return false;
  let changed = false;
  for (const original of seed().rows.filter((r) => ["4001", "1002"].includes(r.id))) {
    const r = state2.rows.find((x) => x.id === original.id);
    if (!r || ["company", "building", "flat", "source", "principal", "penalty", "fee", "asOf"].some((k) => r[k] !== original[k]) || r.events.some((e) => !String(e.id).startsWith("seed-"))) continue;
    for (const key of ["owners", "charges"]) if (!r[key]?.length) {
      r[key] = structuredClone(original[key]);
      changed = true;
    }
  }
  return changed;
}
function filterRows(rows, f = {}) {
  if (f.maxAge !== void 0 && f.maxAge !== "") rows = rows.filter((r) => r.age <= Number(f.maxAge));
  if (f.stage) {
    rows = rows.filter((r) => stagePortions(r).some((x) => x.stage === f.stage));
    f = { ...f, stage: "" };
  }
  return rows.filter((r) => (!f.search || [r.account, r.building, r.company, r.caseId].join(" ").toLowerCase().includes(f.search.toLowerCase())) && (!f.building || r.building === f.building) && (!f.entrance || r.entrance === f.entrance) && (!f.minDebt || total(r) >= Number(f.minDebt) * 100) && (!f.maxDebt || total(r) <= Number(f.maxDebt) * 100) && (!f.company || r.company === f.company) && (!f.owner || r.owner === f.owner) && (!f.stage || r.stage === f.stage) && (!f.category || r.category === f.category) && (!f.minAge || r.age >= Number(f.minAge)) && (!f.segment || (f.segment === "attention" ? ["reconcile", "stale", "overdue", "dispute", "close"].includes(recommendation(r).key) : f.segment === "new" ? r.stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" : f.segment === "court" ? ["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A"].includes(r.stage) : true)));
}
function eligible(r, action) {
  if (!ACTIONS[action]) return "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435";
  if (action === "task") return "";
  if (r.reviewTask?.status === "open") return "\u0416\u0434\u0451\u043C \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u044F \u043E\u0442 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0430";
  if (r.caseBalanceConflict) return "\u041D\u0443\u0436\u043D\u043E \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0434\u043E\u043B\u0433 \u043F\u043E \u0434\u0435\u043B\u0430\u043C";
  if (total(r) <= 0) return "\u0414\u043E\u043B\u0433 \u043F\u043E\u0433\u0430\u0448\u0435\u043D";
  if (r.unallocated > 0) return "\u0415\u0441\u0442\u044C \u043D\u0435\u0440\u0430\u0437\u043D\u0435\u0441\u0451\u043D\u043D\u0430\u044F \u043E\u043F\u043B\u0430\u0442\u0430";
  if (days(r.asOf) > 7) return "\u0423\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A";
  if (r.disputed) return "\u0414\u043E\u043B\u0433 \u043E\u0441\u043F\u0430\u0440\u0438\u0432\u0430\u0435\u0442\u0441\u044F";
  if (action === "case" && r.caseId) return "\u0414\u0435\u043B\u043E \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442";
  if (action === "robot" && !r.phone) return "\u041D\u0435\u0442 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430";
  if (action === "app" && !r.app) return "\u041D\u0435\u0442 \u041C\u041F";
  if (action === "email" && !r.email) return "\u041D\u0435\u0442 email";
  if (action === "max" && !r.max) return "\u041D\u0435\u0442 \u0441\u0432\u044F\u0437\u0438 \u0441 MAX";
  if (action === "court" && !["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B"].includes(r.stage)) return "\u041D\u0435\u0442 \u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0433\u043E \u044D\u0442\u0430\u043F\u0430";
  if (r.events.some((e) => e.action === action && e.scope === noticeScope(r) && e.at.startsWith(TODAY) && !e.status.startsWith("\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E:"))) return "\u0423\u0436\u0435 \u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0441\u0435\u0433\u043E\u0434\u043D\u044F";
  return "";
}
function plan(rows, ids, action) {
  return rows.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, reason: eligible(r, action), amount: total(r) }));
}
function execute(state2, ids, action, details = {}) {
  const preview2 = plan(state2.rows, ids, action);
  for (const p of preview2.filter((p2) => !p2.reason)) {
    const r = state2.rows.find((x) => x.id === p.id);
    const period = r.billing ? billingPeriod(billingLines(r)) : r.period;
    if (["app", "email", "max", "receipt", "robot", "notice"].includes(action) && !r.cases.some((c) => c.stage === "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435") && amount(unassigned(r)) > 0) {
      createCase(r, period, unassigned(r));
    }
    if (action === "case") {
      initializeCases(r);
      createCase(r, period, unassigned(r));
      r.next = "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435";
    }
    if (action === "task") {
      r.next = details.note || "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435";
      r.nextDate = details.date || TODAY;
      if (details.owner) r.owner = details.owner;
      r.task = { text: r.next, due: r.nextDate, owner: r.owner, status: "open" };
    }
    const status = action === "case" || action === "task" ? "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u0432 \u0434\u0435\u043C\u043E" : "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)";
    r.events.unshift({ id: crypto.randomUUID(), action, label: ACTIONS[action], at: `${TODAY}T12:00:00`, status, scope: noticeScope(r), caseId: r.caseId, amount: total(r), note: details.note || "", date: details.date || TODAY });
  }
  return preview2;
}
function allocate(r, payment2, allocation, caseId = r.caseId, meta = {}) {
  const paidAt = meta.date || TODAY, source = String(meta.source || "\u0423\u0447\u0435\u0431\u043D\u043E\u0435 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435").trim(), reference = String(meta.reference || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || !Number.isFinite(Date.parse(paidAt)) || new Date(paidAt).toISOString().slice(0, 10) !== paidAt || paidAt > TODAY) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0443\u044E \u0434\u0430\u0442\u0443 \u043E\u043F\u043B\u0430\u0442\u044B \u043D\u0435 \u043F\u043E\u0437\u0436\u0435 \u0434\u0430\u0442\u044B \u0434\u0435\u043C\u043E");
  if (!source) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043E\u043F\u043B\u0430\u0442\u044B");
  if (reference && r.payments.some((p) => p.source === source && p.reference === reference)) throw Error("\u042D\u0442\u043E \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435 \u0443\u0436\u0435 \u0443\u0447\u0442\u0435\u043D\u043E: \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0438 \u043D\u043E\u043C\u0435\u0440 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0442");
  if (!Number.isSafeInteger(payment2) || payment2 <= 0) throw Error("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u0443\u044E \u0441\u0443\u043C\u043C\u0443 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F");
  const keys2 = ["principal", "penalty", "fee"];
  if (keys2.some((k) => !Number.isSafeInteger(allocation[k]) || allocation[k] < 0 || allocation[k] > r[k])) throw Error("\u0420\u0430\u0437\u043D\u0435\u0441\u0435\u043D\u0438\u0435 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u0430");
  if (keys2.reduce((s, k) => s + allocation[k], 0) !== payment2) throw Error("\u0421\u0443\u043C\u043C\u0430 \u0440\u0430\u0437\u043D\u0435\u0441\u0435\u043D\u0438\u044F \u0434\u043E\u043B\u0436\u043D\u0430 \u0440\u0430\u0432\u043D\u044F\u0442\u044C\u0441\u044F \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044E");
  if (r.unallocated && payment2 !== r.unallocated) throw Error("\u0421\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043E\u043B\u043D\u0443\u044E \u0441\u0443\u043C\u043C\u0443 \u043D\u0435\u0440\u0430\u0437\u043D\u0435\u0441\u0451\u043D\u043D\u043E\u0433\u043E \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F");
  if (r.caseBalanceConflict) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u0434\u043E\u043B\u0433 \u043F\u043E \u0434\u0435\u043B\u0430\u043C");
  const target = caseId ? r.cases?.find((c) => c.id === caseId) : null;
  if (caseId && !target) throw Error("\u0414\u0435\u043B\u043E \u043F\u043B\u0430\u0442\u0435\u0436\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E");
  const remaining = target?.remaining || unassigned(r);
  if (keys2.some((k) => allocation[k] > remaining[k])) throw Error("\u041F\u043B\u0430\u0442\u0451\u0436 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430 \u0438\u043B\u0438 \u0434\u043E\u043B\u0433\u0430 \u0432\u043D\u0435 \u0434\u0435\u043B");
  const debtor = ownerPayment(target, allocation, meta.ownerId);
  if (!target && r.owners?.length > 1) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0434\u0435\u043B\u043E \u0438 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430");
  payBilling(r, allocation, caseId);
  if (debtor) for (const k of keys2) debtor.remaining[k] -= allocation[k];
  if (target) for (const k of keys2) target.remaining[k] -= allocation[k];
  for (const k of keys2) r[k] -= allocation[k];
  r.unallocated = 0;
  r.lastPaymentAt = [r.lastPaymentAt || "", paidAt].sort().at(-1);
  const afterNotice = currentNotices(r).some((e) => e.caseId === (caseId || null) && ["\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u041E\u0431\u0435\u0449\u0430\u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0430 (\u0434\u0435\u043C\u043E)"].includes(e.status) && (e.completedAt || e.at.slice(0, 10)) < paidAt);
  r.payments.unshift({ id: crypto.randomUUID(), at: paidAt, recordedAt: TODAY, source, reference, ownerId: debtor?.id, ownerName: debtor?.name, amount: payment2, ...allocation, caseId: caseId || null, scope: noticeScope(r), stage: paidAt === TODAY ? target?.stage || "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" : null, afterNotice });
  r.events.unshift({ id: crypto.randomUUID(), at: `${TODAY}T12:00:00`, action: "payment", label: "\u041E\u043F\u043B\u0430\u0442\u0430 \u0440\u0430\u0437\u043D\u0435\u0441\u0435\u043D\u0430", status: "\u0423\u0447\u0442\u0435\u043D\u043E \u0432 \u0434\u0435\u043C\u043E", amount: payment2, note: `\u0414\u043E\u043B\u0433 ${money(allocation.principal)}, \u043F\u0435\u043D\u0438 ${money(allocation.penalty)}, \u043F\u043E\u0448\u043B\u0438\u043D\u0430 ${money(allocation.fee)}` });
  invalidatePending(r);
}
function invalidatePending(r) {
  for (const e of r.events) if (e.status === "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)") e.status = total(r) === 0 ? "\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E: \u0434\u043E\u043B\u0433 \u043F\u043E\u0433\u0430\u0448\u0435\u043D" : "\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E: \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0441\u044F";
  if (total(r) === 0) {
    r.age = 0;
    r.promise = null;
    r.next = r.caseId ? "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u0435 \u0434\u0435\u043B\u0430" : "\u041E\u043F\u043B\u0430\u0442\u0430 \u0443\u0447\u0442\u0435\u043D\u0430";
    r.nextDate = TODAY;
  }
}
function changeStage(r, stage, reason = "\u041F\u043E\u0433\u0430\u0448\u0435\u043D\u0438\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u043C") {
  stage = canonicalStage(stage);
  if (!STAGES.includes(stage) || stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430") throw Error("\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u0430\u044F \u0441\u0442\u0430\u0434\u0438\u044F");
  if (!r.caseId) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0434\u0435\u043B\u043E");
  const c = currentCase(r);
  if (stage === "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B" && (c.legal?.status === "\u041E\u0442\u043C\u0435\u043D\u0451\u043D \u043F\u0440\u0438\u043A\u0430\u0437" || !c.documents?.some((d) => !d.archived && (c.stage === "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B" ? ["order", "enforcement"].includes(d.kind) : d.kind === (c.stage === "\u0418\u0441\u043A" ? "enforcement" : "order"))))) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442");
  if (stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" && (r.caseBalanceConflict || amount(c?.remaining || r) > 0)) throw Error("\u0415\u0441\u0442\u044C \u043D\u0435\u043F\u043E\u0433\u0430\u0448\u0435\u043D\u043D\u044B\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0434\u0435\u043B\u0430: \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0441\u0432\u0435\u0440\u043A\u0430");
  if (stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" && !reason.trim()) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F");
  if (["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A"].includes(stage) && !r.claim) r.claim = { amount: amount(c?.remaining || r), period: c?.period || r.period, registered: TODAY, components: { ...c.remaining }, calculation: r.billing ? structuredClone(billingLines(r, c.id)) : void 0 };
  r.stage = stage;
  if (c) {
    if (c.stage !== stage) c.stageEnteredAt = TODAY;
    c.stage = stage;
    c.claim = r.claim;
    if (stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E") c.closedReason = reason;
  }
  r.stageNeedsReview = false;
  r.events.unshift({ id: crypto.randomUUID(), at: `${TODAY}T12:00:00`, action: "stage", label: `\u0421\u0442\u0430\u0434\u0438\u044F: ${stage}`, status: "\u0423\u0447\u0442\u0435\u043D\u043E \u0432 \u0434\u0435\u043C\u043E", note: ["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A"].includes(stage) ? "\u0421\u0443\u043C\u043C\u0430 \u0438 \u043F\u0435\u0440\u0438\u043E\u0434 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u044B." : "" });
}
var CSV_FIELDS = ["source_id", "company", "account", "building", "flat", "as_of", "period", "principal", "penalty", "fee", "age_days"];
function cents(value) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(String(value).trim())) throw Error("\u0421\u0443\u043C\u043C\u0430 \u0434\u043E\u043B\u0436\u043D\u0430 \u0431\u044B\u0442\u044C \u043D\u0435\u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0439, \u0434\u043E 2 \u0437\u043D\u0430\u043A\u043E\u0432");
  const result = Math.round(Number(String(value).replace(",", ".")) * 100);
  if (!Number.isSafeInteger(result)) throw Error("\u0421\u0443\u043C\u043C\u0430 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0432\u0435\u043B\u0438\u043A\u0430");
  return result;
}
function completeCommunication(r, eventId, outcome, nextDate) {
  const event = r.events.find((e) => e.id === eventId);
  if (!event || !["\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0434\u043B\u044F \u043F\u0435\u0447\u0430\u0442\u0438 (\u0434\u0435\u043C\u043E)"].includes(event.status)) throw Error("\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0443\u0436\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E \u0438\u043B\u0438 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u043E");
  if (event.scope !== noticeScope(r)) throw Error("\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0435\u043C\u0443 \u043F\u0435\u0440\u0438\u043E\u0434\u0443 \u0434\u043E\u043B\u0433\u0430");
  if (event.date > TODAY) throw Error("\u0414\u0430\u0442\u0430 \u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0441\u0442\u0443\u043F\u0438\u043B\u0430");
  if (!OUTCOMES.includes(outcome)) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate || "") || !Number.isFinite(Date.parse(nextDate)) || nextDate < TODAY) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F");
  if (total(r) <= 0 || r.unallocated > 0 || r.disputed || days(r.asOf) > 7) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A");
  event.status = outcome;
  event.completedAt = TODAY;
  r.next = outcome.startsWith("\u041D\u0435\u0442 \u043E\u0442\u0432\u0435\u0442\u0430") ? "\u0421\u0432\u044F\u0437\u0430\u0442\u044C\u0441\u044F \u0434\u0440\u0443\u0433\u0438\u043C \u043A\u0430\u043D\u0430\u043B\u043E\u043C" : outcome.startsWith("\u041E\u0431\u0435\u0449\u0430\u043D\u0430") ? "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u0431\u0435\u0449\u0430\u043D\u043D\u0443\u044E \u043E\u043F\u043B\u0430\u0442\u0443" : "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u043F\u043B\u0430\u0442\u0443 \u043F\u043E\u0441\u043B\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F";
  r.nextDate = nextDate;
  if (outcome.startsWith("\u041E\u0431\u0435\u0449\u0430\u043D\u0430")) {
    r.promise = nextDate;
    r.category = "\u041E\u0431\u0435\u0449\u0430\u043D\u0438\u0435 \u043E\u043F\u043B\u0430\u0442\u044B";
  }
}
function previewImport(state2, input) {
  const seen = /* @__PURE__ */ new Set();
  return input.map((x, i) => {
    const errors = [];
    let amounts = {};
    for (const k of CSV_FIELDS) if (x[k] === void 0 || String(x[k]).trim() === "") errors.push(`\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E ${k}`);
    for (const k of ["principal", "penalty", "fee"]) {
      try {
        amounts[k] = cents(x[k]);
      } catch (e) {
        errors.push(`${k}: ${e.message}`);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.as_of || "") || !Number.isFinite(Date.parse(x.as_of)) || new Date(x.as_of).toISOString().slice(0, 10) !== x.as_of || x.as_of > TODAY) errors.push("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0438\u043B\u0438 \u0431\u0443\u0434\u0443\u0449\u0430\u044F \u0434\u0430\u0442\u0430");
    if (!/^\d+$/.test(x.age_days || "")) errors.push("age_days: \u043D\u0443\u0436\u043D\u044B \u0446\u0435\u043B\u044B\u0435 \u0434\u043D\u0438");
    const key = [x.source_id, x.company, x.account].join("|");
    if (seen.has(key)) errors.push("\u0414\u0443\u0431\u043B\u044C \u043B\u0438\u0446\u0435\u0432\u043E\u0433\u043E \u0441\u0447\u0451\u0442\u0430 \u0432 \u0444\u0430\u0439\u043B\u0435");
    seen.add(key);
    const existing = state2.rows.find((r) => r.sourceId === x.source_id && r.company === x.company && r.account === x.account);
    if (!existing && state2.rows.some((r) => r.company === x.company && r.account === x.account)) errors.push("\u041B\u0421 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442 \u0441 \u0434\u0440\u0443\u0433\u0438\u043C \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u043E\u043C: \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435");
    if (existing && x.as_of < existing.asOf) errors.push("\u0421\u0440\u0435\u0437 \u0441\u0442\u0430\u0440\u0435\u0435 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E");
    if (existing && existing.lastPaymentAt && x.as_of <= existing.lastPaymentAt) errors.push("\u041F\u043E\u0441\u043B\u0435 \u044D\u0442\u043E\u0433\u043E \u0441\u0440\u0435\u0437\u0430 \u0440\u0430\u0437\u043D\u0435\u0441\u0435\u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0430: \u043D\u0443\u0436\u043D\u0430 \u0441\u0432\u0435\u0440\u043A\u0430");
    if (existing && existing.unallocated > 0) errors.push("\u0415\u0441\u0442\u044C \u043D\u0435\u0440\u0430\u0437\u043D\u0435\u0441\u0451\u043D\u043D\u0430\u044F \u043E\u043F\u043B\u0430\u0442\u0430: \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u0432\u0435\u0440\u043A\u0430");
    const same = existing && x.as_of === existing.asOf && ["principal", "penalty", "fee"].every((k) => existing[k] === amounts[k]) && x.period === existing.period && Number(x.age_days) === existing.age && x.building === existing.building && String(x.flat) === String(existing.flat);
    if (existing && x.as_of === existing.asOf && !same) errors.push("\u041D\u0430 \u044D\u0442\u0443 \u0434\u0430\u0442\u0443 \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u0434\u0440\u0443\u0433\u043E\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A");
    return { row: i + 2, input: x, amounts, existingId: existing?.id, errors, status: errors.length ? "error" : same ? "skip" : existing ? "update" : "new" };
  });
}
function applyImport(state2, preview2) {
  if (preview2.some((p) => p.errors.length)) throw Error("\u0418\u0441\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u043E\u0448\u0438\u0431\u043A\u0438 \u0432\u0441\u0435\u0433\u043E \u0444\u0430\u0439\u043B\u0430 \u043F\u0435\u0440\u0435\u0434 \u0438\u043C\u043F\u043E\u0440\u0442\u043E\u043C");
  let changed = 0;
  for (const p of preview2.filter((p2) => p2.status !== "skip")) {
    const x = p.input;
    let r = state2.rows.find((r2) => r2.id === p.existingId);
    if (!r) {
      r = { id: crypto.randomUUID(), account: x.account, company: x.company, sourceId: x.source_id, source: x.source_id, stage: "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", caseId: null, claim: null, category: "\u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0430", owner: "\u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D", phone: false, email: false, app: false, unallocated: 0, disputed: false, events: [], payments: [], next: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435", nextDate: TODAY };
      state2.rows.push(r);
    }
    initializeCases(r);
    const newScope = r.period !== x.period || amount(p.amounts) > total(r);
    if (newScope) {
      r.noticeEpoch++;
      r.promise = null;
    }
    if (r.charges.length && r.principal !== p.amounts.principal) {
      r.chargesArchive ||= [];
      r.chargesArchive.push({ asOf: r.asOf, rows: r.charges });
      r.charges = [];
    }
    if (r.cases.some((c) => c.stage !== "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E") && COMPONENTS.some((k) => p.amounts[k] !== r[k])) r.caseBalanceConflict = true;
    Object.assign(r, p.amounts, { building: x.building, flat: x.flat, asOf: x.as_of, period: x.period, age: Number(x.age_days), entrance: x.entrance || r.entrance || "" });
    invalidatePending(r);
    r.events.unshift({ id: crypto.randomUUID(), at: `${TODAY}T12:00:00`, action: "import", label: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D", status: "\u0423\u0447\u0442\u0435\u043D\u043E \u0432 \u0434\u0435\u043C\u043E", amount: total(r), note: `\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A: ${x.source_id}` });
    changed++;
  }
  state2.imports.unshift({ at: TODAY, changed, skipped: preview2.length - changed });
  return changed;
}

// dist/workflow.mjs
var CHANNELS = ["app", "email", "max", "receipt", "robot", "notice"];
var STAGE_INFO = {
  "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C": { title: "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0432\u0438\u0434 \u0434\u0435\u043B\u0430", meaning: "\u0412 \u0441\u0442\u0430\u0440\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0438 \u043F\u0440\u0438\u043A\u0430\u0437 \u0438 \u0438\u0441\u043A \u0431\u044B\u043B\u0438 \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u0435\u043D\u044B. \u041F\u043E \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u043C \u0434\u0430\u043D\u043D\u044B\u043C \u0432\u0438\u0434 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u0430 \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u0435\u043D.", next: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0438 \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0440\u0438\u043A\u0430\u0437 \u0438\u043B\u0438 \u0438\u0441\u043A." },
  "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430": { title: "\u0415\u0449\u0451 \u0431\u0435\u0437 \u0434\u0435\u043B\u0430", meaning: "\u0414\u043E\u043B\u0433 \u0435\u0441\u0442\u044C, \u0440\u0430\u0431\u043E\u0442\u0430 \u043F\u043E \u0432\u0437\u044B\u0441\u043A\u0430\u043D\u0438\u044E \u0435\u0449\u0451 \u043D\u0435 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0430.", next: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0438 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u043F\u0435\u0440\u0432\u043E\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435." },
  "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435": { title: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043E \u0434\u043E\u043B\u0433\u0435", meaning: "\u0414\u043E\u0441\u0443\u0434\u0435\u0431\u043D\u0430\u044F \u0441\u0432\u044F\u0437\u044C \u0441 \u0436\u0438\u0442\u0435\u043B\u0435\u043C. \u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430, \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u0438 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E.", next: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u043E\u043B\u0436\u043D\u0438\u043A\u043E\u0432 \u0438 \u043A\u0430\u043D\u0430\u043B \u0441\u0432\u044F\u0437\u0438; \u0437\u0430\u0442\u0435\u043C \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0443 \u0438 \u043E\u043F\u043B\u0430\u0442\u0443." },
  "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435": { title: "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u043E\u0431 \u043E\u043F\u043B\u0430\u0442\u0435", meaning: "\u0423\u0441\u043B\u043E\u0432\u0438\u044F \u0440\u0430\u0441\u0441\u0440\u043E\u0447\u043A\u0438, \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0438 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u0433\u0440\u0430\u0444\u0438\u043A\u0430. \u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u043E\u0435 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E.", next: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442, \u0434\u0430\u0442\u0443 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u0433\u043E \u043F\u043B\u0430\u0442\u0435\u0436\u0430 \u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0433\u0440\u0430\u0444\u0438\u043A\u0430." },
  "\u041F\u0440\u0438\u043A\u0430\u0437": { title: "\u0421\u0443\u0434\u0435\u0431\u043D\u044B\u0439 \u043F\u0440\u0438\u043A\u0430\u0437", meaning: "\u0420\u0430\u0431\u043E\u0442\u0430 \u043F\u043E \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u044E \u043E \u0432\u044B\u0434\u0430\u0447\u0435 \u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0433\u043E \u043F\u0440\u0438\u043A\u0430\u0437\u0430: \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430, \u043F\u043E\u0434\u0430\u0447\u0430 \u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0441\u0443\u0434\u0430.", next: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0440\u0430\u0441\u0447\u0451\u0442 \u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B; \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u0434\u0430\u0447\u0443, \u0432\u044B\u0434\u0430\u0447\u0443 \u0438\u043B\u0438 \u043E\u0442\u043C\u0435\u043D\u0443 \u043F\u0440\u0438\u043A\u0430\u0437\u0430." },
  "\u0418\u0441\u043A": { title: "\u0418\u0441\u043A\u043E\u0432\u043E\u0435 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u043E", meaning: "\u0420\u0430\u0441\u0441\u043C\u043E\u0442\u0440\u0435\u043D\u0438\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u0432 \u0438\u0441\u043A\u043E\u0432\u043E\u043C \u043F\u043E\u0440\u044F\u0434\u043A\u0435, \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 \u043F\u043E\u0441\u043B\u0435 \u043E\u0442\u043C\u0435\u043D\u044B \u043F\u0440\u0438\u043A\u0430\u0437\u0430.", next: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0438\u0441\u043A \u0438 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430, \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0437\u0430\u0441\u0435\u0434\u0430\u043D\u0438\u0435 \u0438 \u0440\u0435\u0448\u0435\u043D\u0438\u0435." },
  "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B": { title: "\u0418\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435: \u043F\u0440\u0438\u0441\u0442\u0430\u0432\u044B \u0438\u043B\u0438 \u0431\u0430\u043D\u043A", meaning: "\u0423\u0447\u0451\u0442 \u043F\u0440\u0435\u0434\u044A\u044F\u0432\u043B\u0435\u043D\u043D\u043E\u0433\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430. \u041F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044C (\u0431\u0430\u043D\u043A \u0438\u043B\u0438 \u0424\u0421\u0421\u041F), \u0440\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0443\u043A\u0430\u0437\u0430\u043D\u044B \u0432 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0435 \u0434\u0435\u043B\u0430.", next: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044F \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430, \u043F\u043E\u0441\u0442\u0443\u043F\u0438\u0432\u0448\u0438\u0435 \u0441\u0443\u043C\u043C\u044B \u0438 \u043E\u0441\u0442\u0430\u0442\u043E\u043A." },
  "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E": { title: "\u0417\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u044B\u0435 \u0434\u0435\u043B\u0430", meaning: "\u0420\u0430\u0431\u043E\u0442\u0430 \u043F\u043E \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u043C\u0443 \u0434\u0435\u043B\u0443 \u0437\u0430\u043A\u0440\u044B\u0442\u0430 \u0441 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u043C \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435\u043C.", next: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B. \u041D\u043E\u0432\u044B\u0439 \u0434\u043E\u043B\u0433 \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0442\u044C \u043A \u0441\u0442\u0430\u0440\u043E\u043C\u0443 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044E." }
};
var NOTICE_LABELS = { none: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439 \u043D\u0435\u0442", prepared: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E, \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E", sent: "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E, \u0436\u0434\u0451\u043C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442", print: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u043F\u0435\u0447\u0430\u0442\u0438 / \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u044F", delivered: "\u0415\u0441\u0442\u044C \u043E\u0442\u043C\u0435\u0442\u043A\u0430 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438", noanswer: "\u041D\u0435\u0442 \u043E\u0442\u0432\u0435\u0442\u0430" };
function notificationState(r) {
  const events = currentNotices(r);
  if (events.some((e) => ["\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u041E\u0431\u0435\u0449\u0430\u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0430 (\u0434\u0435\u043C\u043E)"].includes(e.status))) return "delivered";
  if (events.some((e) => e.status === "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)")) return "sent";
  if (events.some((e) => e.status === "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0434\u043B\u044F \u043F\u0435\u0447\u0430\u0442\u0438 (\u0434\u0435\u043C\u043E)")) return "print";
  if (events.some((e) => e.status === "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)")) return "prepared";
  if (events.some((e) => e.status === "\u041D\u0435\u0442 \u043E\u0442\u0432\u0435\u0442\u0430 (\u0434\u0435\u043C\u043E)")) return "noanswer";
  return "none";
}
var QUEUES = { notify: "\u0423\u0432\u0435\u0434\u043E\u043C\u0438\u0442\u044C", follow: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u043F\u043B\u0430\u0442\u0443 / \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0443", overdue: "\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043D\u044B\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F", check: "\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0434\u043E\u043B\u0433", waiting: "\u0416\u0434\u0451\u043C \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u044F \u043E\u0442 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0430", legal: "\u0420\u0430\u0431\u043E\u0442\u0430 \u043F\u043E \u0434\u0435\u043B\u0443", paid: "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0434\u0435\u043B\u043E" };
function queueFor(r) {
  r = workRecord(r);
  if (r.reviewTask?.status === "open") return "waiting";
  if (r.caseBalanceConflict || r.unallocated > 0 || days(r.asOf) > 7 || r.disputed) return "check";
  const rec = recommendation(r);
  if (rec.key === "done") return "";
  if (rec.key === "close") return "paid";
  if (["overdue", "overdueTask", "overdueAgreement"].includes(rec.key) || r.task?.status === "open" && r.task.due < TODAY) return "overdue";
  if (["\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"].includes(r.stage) && total(r) > 0 && ["none", "noanswer"].includes(notificationState(r)) && !r.promise) return "notify";
  if (["\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435", "\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B", "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C"].includes(r.stage)) return "legal";
  return "follow";
}
function workRows(rows, { notice = "", queue = "", debtOnly = false } = {}) {
  return rows.filter((r) => (!debtOnly || total(r) > 0) && (!notice || notificationState(r) === notice) && (!queue || queueFor(r) === queue)).sort((a, b) => {
    const date2 = (r) => r.reviewTask?.due || r.task?.due || r.promise || currentCase(r)?.legal?.nextDate || r.nextDate;
    return (date2(a) || "9999").localeCompare(date2(b) || "9999") || total(b) - total(a);
  });
}
function migrate(state2) {
  for (const r of state2.rows) {
    if (r.stage === "\u0421\u0443\u0434") {
      r.stageNeedsReview = true;
      r.stage = "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C";
    }
    r.stage = canonicalStage(r.stage);
    initializeCases(r);
    for (const c of r.cases) c.stage = canonicalStage(c.stage);
    for (const p of r.payments) if (p.stage) p.stage = p.stage === "\u0421\u0443\u0434" ? "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C" : canonicalStage(p.stage);
  }
  return state2;
}
function summary(rows) {
  const debtors = rows.filter((r) => total(r) > 0);
  const portions = (r) => stagePortions(r).filter((x) => x.id || x.amount > 0);
  return {
    amount: debtors.reduce((s, r) => s + total(r), 0),
    accounts: debtors.length,
    premises: new Set(debtors.map((r) => [r.company, r.building, r.flat].join("|"))).size,
    stages: STAGES.map((stage) => ({ stage, count: rows.filter((r) => portions(r).some((x) => x.stage === stage)).length, caseCount: rows.reduce((s, r) => s + portions(r).filter((x) => x.stage === stage).length, 0), amount: rows.reduce((s, r) => s + portions(r).filter((x) => x.stage === stage).reduce((a, x) => a + x.amount, 0), 0) })),
    notices: Object.fromEntries(Object.keys(NOTICE_LABELS).map((k) => [k, debtors.filter((r) => notificationState(r) === k).length]))
  };
}
function paymentReport(rows, from, to) {
  const records = rows.flatMap((r) => r.payments.filter((p) => p.at.slice(0, 10) >= from && p.at.slice(0, 10) <= to).map((p) => ({ r, p })));
  const group = (list) => ({ accounts: new Set(list.map((x) => x.r.id)).size, amount: list.reduce((s, x) => s + x.p.amount, 0), principal: list.reduce((s, x) => s + (x.p.principal || 0), 0), penalty: list.reduce((s, x) => s + (x.p.penalty || 0), 0), fee: list.reduce((s, x) => s + x.p.fee, 0), records: list });
  const notified = rows.map((r) => ({ r, dates: r.events.filter((e) => CHANNELS.includes(e.action) && ["\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u041E\u0431\u0435\u0449\u0430\u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0430 (\u0434\u0435\u043C\u043E)"].includes(e.status)).map((e) => e.completedAt || e.at.slice(0, 10)).filter((d) => d >= from && d <= to).sort() })).filter((x) => x.dates.length);
  const cohortPayments = records.filter(({ r, p }) => {
    const matching = r.events.filter((e) => CHANNELS.includes(e.action) && ["\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u041E\u0431\u0435\u0449\u0430\u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0430 (\u0434\u0435\u043C\u043E)"].includes(e.status) && e.scope === p.scope).map((e) => e.completedAt || e.at.slice(0, 10)).filter((d) => d >= from && d <= to);
    const day = p.at.slice(0, 10);
    return matching.some((d) => day > d || day === d && p.afterNotice === true);
  });
  const cohort = { notified: new Set(notified.map((x) => x.r.id)).size, ...group(cohortPayments) };
  return {
    all: group(records),
    afterNotice: group(records.filter((x) => x.p.afterNotice === true)),
    cohort,
    stages: [...STAGES, "\u041D\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D"].map((stage) => ({ stage, ...group(records.filter((x) => (x.p.stage || "\u041D\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D") === stage)) }))
  };
}

// dist/workspace-views.mjs
var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var icon = (n) => `<i data-lucide="${n}"></i>`;
var caseUnit = (n) => n % 100 >= 11 && n % 100 <= 14 ? "\u0434\u0435\u043B" : n % 10 === 1 ? "\u0434\u0435\u043B\u043E" : n % 10 >= 2 && n % 10 <= 4 ? "\u0434\u0435\u043B\u0430" : "\u0434\u0435\u043B";
function overviewRows(rows, { company = "", building = "", houseStatus = "" } = {}) {
  return rows.filter((r) => (!company || r.company === company) && (!building || r.building === building) && (!houseStatus || (r.houseStatus || "unknown") === houseStatus));
}
function overviewFilters(rows, scope) {
  const options2 = (items, current, all) => `<option value="">${all}</option>${items.map((x) => `<option value="${esc(x)}" ${x === current ? "selected" : ""}>${esc(x)}</option>`).join("")}`;
  return `<div class="overview-filters"><label>\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0449\u0430\u044F \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044F<select data-overview-filter="company">${options2([...new Set(rows.map((r) => r.company))], scope.company, "\u0412\u0441\u0435 \u0423\u041A")}</select></label><label>\u0414\u043E\u043C<select data-overview-filter="building">${options2([...new Set(overviewRows(rows, { company: scope.company }).map((r) => r.building))], scope.building, "\u0412\u0441\u0435 \u0434\u043E\u043C\u0430")}</select></label><label>\u0421\u0442\u0430\u0442\u0443\u0441 \u0434\u043E\u043C\u0430<select data-overview-filter="houseStatus"><option value="">\u0412\u0441\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u044B</option><option value="active" ${scope.houseStatus === "active" ? "selected" : ""}>\u0412 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0438</option><option value="departed" ${scope.houseStatus === "departed" ? "selected" : ""}>\u0412\u044B\u0431\u044B\u0432\u0448\u0438\u0435 \u0434\u043E\u043C\u0430</option><option value="unknown" ${scope.houseStatus === "unknown" ? "selected" : ""}>\u0421\u0442\u0430\u0442\u0443\u0441 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D</option></select></label></div>`;
}
function overview(allRows, from, to, scope = {}) {
  const rows = overviewRows(allRows, scope);
  const s = summary(rows), p = paymentReport(rows, "0001-01-01", TODAY);
  const dates = [...new Set(rows.map((r) => r.asOf).filter(Boolean))].sort(), periods = [...new Set(rows.map((r) => r.billing?.lines.map((x) => x.month).sort().at(-1)).filter(Boolean))].sort();
  return `${overviewFilters(allRows, scope)}<p class="data-freshness">${dates.length ? `\u041E\u0441\u0442\u0430\u0442\u043A\u0438 \u043D\u0430 ${esc(dates[0])}${dates.length > 1 ? " \u2014 " + esc(dates.at(-1)) : ""}` : "\u0414\u0430\u0442\u0430 \u043E\u0441\u0442\u0430\u0442\u043A\u043E\u0432 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u0430"}${periods.length ? ` \xB7 \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u0440\u0430\u0441\u0447\u0451\u0442\u043D\u044B\u0439 \u043C\u0435\u0441\u044F\u0446: ${esc(periods.join(", "))}` : ""} \xB7 \u0423\u0447\u0435\u0431\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435</p><section class="overview-totals" aria-label="\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A">
    <div><span>\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0434\u043E\u043B\u0433 \u0441\u0435\u0439\u0447\u0430\u0441</span><strong>${money(rows.reduce((sum2, r) => sum2 + r.principal, 0))}</strong><small>\u041F\u0435\u043D\u0438: ${money(rows.reduce((sum2, r) => sum2 + r.penalty, 0))} \xB7 \u043F\u043E\u0448\u043B\u0438\u043D\u0430: ${money(rows.reduce((sum2, r) => sum2 + r.fee, 0))}</small><small>\u041E\u0431\u0449\u0430\u044F \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C: ${money(s.amount)}</small></div>
    <div><span>\u041F\u043E\u0441\u0442\u0443\u043F\u0438\u043B\u043E \u0437\u0430 \u0432\u0441\u0451 \u0432\u0440\u0435\u043C\u044F</span><strong>${money(p.all.amount)}</strong><small>\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0434\u043E\u043B\u0433: ${money(p.all.principal)}</small><small>\u041F\u0435\u043D\u0438: ${money(p.all.penalty)} \xB7 \u043F\u043E\u0448\u043B\u0438\u043D\u0430: ${money(p.all.fee)}</small><small>\u0412\u0441\u044F \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u0430\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u043E\u043F\u043B\u0430\u0442 \u0434\u043E ${esc(TODAY)}</small></div>
    <div><span>\u041B\u0438\u0446\u0435\u0432\u044B\u0445 \u0441\u0447\u0435\u0442\u043E\u0432 \u0441 \u0434\u043E\u043B\u0433\u043E\u043C</span><strong>${s.accounts}</strong><small>\u0412 ${s.premises} \u043F\u043E\u043C\u0435\u0449\u0435\u043D\u0438\u044F\u0445</small></div>
  </section>
  ${rows.some((r) => r.reviewTask?.status === "open") ? `<button class="review-counter" data-queue="waiting"><strong>${rows.filter((r) => r.reviewTask?.status === "open").length}</strong> \u041D\u0430 \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u0438 \u0443 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0430 ${icon("arrow-up-right")}</button>` : ""}
  <div class="section-head"><h2>\u0422\u0435\u043A\u0443\u0449\u0438\u0435 \u0434\u0435\u043B\u0430</h2><button class="icon-button" data-action="stageHelp" title="\u0427\u0442\u043E \u043E\u0437\u043D\u0430\u0447\u0430\u044E\u0442 \u044D\u0442\u0430\u043F\u044B" aria-label="\u0427\u0442\u043E \u043E\u0437\u043D\u0430\u0447\u0430\u044E\u0442 \u044D\u0442\u0430\u043F\u044B">${icon("circle-help")}</button></div>
  <div class="stage-list">${s.stages.filter((x) => x.stage !== "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C" || x.count > 0).map((x) => `<button class="stage-tile" data-stage-link="${esc(x.stage)}"><span>${esc(STAGE_INFO[x.stage].title)}</span><strong>${x.caseCount}</strong><small>${x.stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" ? "\u041B\u0421 \u0441 \u0434\u043E\u043B\u0433\u043E\u043C \u0432\u043D\u0435 \u0434\u0435\u043B" : caseUnit(x.caseCount)} \xB7 ${money(x.amount)}</small>${icon("arrow-up-right")}</button>`).join("")}</div>
  <small class="definition">\u0412 \u0432\u044B\u0431\u043E\u0440\u043A\u0435 ${rows.length} \u041B\u0421, \u0432\u043A\u043B\u044E\u0447\u0430\u044F ${rows.filter((r) => total(r) === 0).length} \u0431\u0435\u0437 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438. \u041E\u0434\u0438\u043D \u041B\u0421 \u043C\u043E\u0436\u0435\u0442 \u0438\u043C\u0435\u0442\u044C \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0434\u0435\u043B. \u0414\u043E\u043B\u0433 \u0432\u043D\u0435 \u0434\u0435\u043B \u043F\u043E\u043A\u0430\u0437\u0430\u043D \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E. ${rows.some((r) => r.caseBalanceConflict) ? "\u0421\u0443\u043C\u043C\u044B \u043F\u043E \u0434\u0435\u043B\u0430\u043C \u0442\u0440\u0435\u0431\u0443\u044E\u0442 \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u044F." : ""}</small><div class="overview-section"><div class="section-head"><h2>\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F</h2><button class="button small" data-queue="notify">${icon("send")} \u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F</button></div>
  <div class="notification-strip">${Object.entries(NOTICE_LABELS).map(([key, label]) => `<button data-notice-link="${key}"><strong>${s.notices[key]}</strong><span>${label}</span></button>`).join("")}</div>
  <small class="definition">\u0422\u043E\u043B\u044C\u043A\u043E \u041B\u0421 \u0441 \u0434\u043E\u043B\u0433\u043E\u043C. \u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0443 \u0438\u043B\u0438 \u043E\u0437\u043D\u0430\u043A\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u0436\u0438\u0442\u0435\u043B\u044F.</small></div>
  `;
}
function stageGuide() {
  return `<p class="form-note">\u0420\u0430\u0431\u043E\u0447\u0438\u0435 \u044D\u0442\u0430\u043F\u044B, \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0446\u0435\u043F\u043E\u0447\u043A\u0430. \u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u043C\u043E\u0436\u0435\u0442 \u043D\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0430\u0442\u044C\u0441\u044F; \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u0438\u043A\u0430\u0437\u0430 \u043D\u0435 \u0432\u0441\u0435\u0433\u0434\u0430 \u043D\u0443\u0436\u0435\u043D \u0438\u0441\u043A. \u041F\u0435\u0440\u0435\u0445\u043E\u0434 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u043F\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u043C.</p><dl class="stage-guide">${STAGES.slice(1).map((s) => `<div><dt>${esc(STAGE_INFO[s].title)}</dt><dd>${esc(STAGE_INFO[s].meaning)}<small>\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433: ${esc(STAGE_INFO[s].next)}</small></dd></div>`).join("")}</dl><p class="form-note">\xAB\u041F\u0440\u0438\u043A\u0430\u0437\xBB \u0438 \xAB\u0418\u0441\u043A\xBB \u0437\u0434\u0435\u0441\u044C \u0440\u0430\u0437\u0434\u0435\u043B\u0435\u043D\u044B \u043F\u043E \u0432\u0438\u0434\u0443 \u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u044B. \u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u0441\u0440\u043E\u043A\u0438 \u0434\u043B\u044F \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442. \u042D\u0442\u043E \u043A\u043E\u043D\u0446\u0435\u043F\u0446\u0438\u044F \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430, \u043D\u0435 \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u043F\u043E \u0441\u0443\u0434\u0435\u0431\u043D\u043E\u043C\u0443 \u0432\u0437\u044B\u0441\u043A\u0430\u043D\u0438\u044E.</p><a href="https://www.vsrf.ru/documents/own/16145/" target="_blank" rel="noopener">\u0420\u0430\u0437\u044A\u044F\u0441\u043D\u0435\u043D\u0438\u044F \u0412\u0435\u0440\u0445\u043E\u0432\u043D\u043E\u0433\u043E \u0421\u0443\u0434\u0430, \u043F\u0443\u043D\u043A\u0442 5</a>`;
}
function stageContext(stage) {
  const x = STAGE_INFO[stage];
  return x ? `<div class="stage-context"><div><strong>${esc(x.title)}</strong><p>${esc(x.next)}</p></div><button class="icon-button" data-action="stageHelp" title="\u0421\u043C\u044B\u0441\u043B \u044D\u0442\u0430\u043F\u043E\u0432" aria-label="\u0421\u043C\u044B\u0441\u043B \u044D\u0442\u0430\u043F\u043E\u0432">${icon("circle-help")}</button></div>` : "";
}
function receiptPages(r) {
  return `<div class="receipt-preview"><section class="paper"><small>\u041B\u0418\u0421\u0422 1 \xB7 \u0414\u0415\u041C\u041E-\u041A\u0412\u0418\u0422\u0410\u041D\u0426\u0418\u042F</small><h3>${esc(r.company)}</h3><p>${esc(r.building)}, \u043A\u0432. ${esc(r.flat)} \xB7 \u041B\u0421 ${esc(r.account)}</p><dl><div><dt>\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0434\u043E\u043B\u0433</dt><dd>${money(r.principal)}</dd></div><div><dt>\u041F\u0435\u043D\u0438</dt><dd>${money(r.penalty)}</dd></div><div><dt>\u0413\u043E\u0441\u043F\u043E\u0448\u043B\u0438\u043D\u0430 \u043A \u0432\u043E\u0437\u043C\u0435\u0449\u0435\u043D\u0438\u044E</dt><dd>${money(r.fee)}</dd></div><div><dt>\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438</dt><dd><strong>${money(total(r))}</strong></dd></div></dl><small>\u0414\u0430\u043D\u043D\u044B\u0435 \u043D\u0430 ${esc(r.asOf)}. \u0422\u0435\u043A\u0443\u0449\u0438\u0435 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u0432 \u044D\u0442\u043E\u0442 \u043F\u0440\u0438\u043C\u0435\u0440 \u043D\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B.</small></section><section class="paper"><small>\u041B\u0418\u0421\u0422 2 \xB7 \u0414\u0415\u041C\u041E-\u041F\u0420\u0415\u0422\u0415\u041D\u0417\u0418\u042F</small><h3>\u041F\u0440\u0435\u0442\u0435\u043D\u0437\u0438\u044F \u043E\u0431 \u043E\u043F\u043B\u0430\u0442\u0435 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438</h3><p>${esc(r.building)}, \u043A\u0432. ${esc(r.flat)} \xB7 \u041B\u0421 ${esc(r.account)}</p><p>\u041D\u0430 ${esc(r.asOf)} \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0437\u0430 ${esc(r.period)}: ${money(total(r))}. \u0417\u0430 \u0443\u0441\u043B\u0443\u0433\u0438 ${money(r.principal)}, \u043F\u0435\u043D\u0438 ${money(r.penalty)}, \u0433\u043E\u0441\u043F\u043E\u0448\u043B\u0438\u043D\u0430 ${money(r.fee)}.</p><p>\u041F\u0440\u043E\u0441\u0438\u043C \u043F\u043E\u0433\u0430\u0441\u0438\u0442\u044C \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C. \u0415\u0441\u043B\u0438 \u043E\u043F\u043B\u0430\u0442\u0430 \u0443\u0436\u0435 \u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0430 \u0438\u043B\u0438 \u0412\u044B \u043D\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043D\u044B \u0441 \u0441\u0443\u043C\u043C\u043E\u0439, \u0441\u043E\u043E\u0431\u0449\u0438\u0442\u0435 \u043E\u0431 \u044D\u0442\u043E\u043C \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0449\u0435\u0439 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438.</p><p>\u041F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u0438\u0442\u0435\u043B\u044C: ____________________</p><hr><h4>\u0418\u0437\u0432\u0435\u0449\u0435\u043D\u0438\u0435 \u043E\u0431 \u043E\u043F\u043B\u0430\u0442\u0435</h4><p>${esc(r.company)} \xB7 \u041B\u0421 ${esc(r.account)}<br>\u041A \u043E\u043F\u043B\u0430\u0442\u0435: <strong>${money(total(r))}</strong></p><small>\u0411\u0435\u0437 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0445 \u0440\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u043E\u0432, QR-\u043A\u043E\u0434\u0430 \u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u0438.</small><hr><h4>\u041E\u0442\u043C\u0435\u0442\u043A\u0430 \u043E \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u0438</h4><p>\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0430 \u0441\u0443\u043C\u043C\u0443 ${money(total(r))} \u043F\u043E\u043B\u0443\u0447\u0435\u043D.<br>\u0414\u0430\u0442\u0430 __________ \u0424\u0418\u041E __________ \u041F\u043E\u0434\u043F\u0438\u0441\u044C __________</p><small>\u0417\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u043F\u0440\u0438 \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u043C \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u0438. \u0423\u0447\u0435\u0431\u043D\u0430\u044F \u0430\u0434\u0430\u043F\u0442\u0430\u0446\u0438\u044F \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u043E\u0433\u043E \u043E\u0431\u0440\u0430\u0437\u0446\u0430; \u043F\u0440\u0430\u0432\u043E\u0432\u044B\u0435 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u0441\u0440\u043E\u043A \u043E\u0442\u0432\u0435\u0442\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442.</small></section></div>`;
}
function noticeBadge(r) {
  return `<small class="notice-state">${esc(NOTICE_LABELS[notificationState(r)])}</small>`;
}

// dist/documents.mjs
var DOCUMENTS = {
  notice: { title: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043E \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438", stages: ["\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435"] },
  demand: { title: "\u0414\u043E\u0441\u0443\u0434\u0435\u0431\u043D\u0430\u044F \u043F\u0440\u0435\u0442\u0435\u043D\u0437\u0438\u044F", stages: ["\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435"] },
  agreement: { title: "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u043E \u043F\u043E\u0433\u0430\u0448\u0435\u043D\u0438\u0438 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438", stages: ["\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435"] },
  schedule: { title: "\u0413\u0440\u0430\u0444\u0438\u043A \u043F\u043E\u0433\u0430\u0448\u0435\u043D\u0438\u044F \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438", stages: ["\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435"] },
  paymentStatement: { title: "\u0420\u0435\u0435\u0441\u0442\u0440 \u043E\u043F\u043B\u0430\u0442 \u043F\u043E \u0434\u0435\u043B\u0443", stages: ["\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435", "\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B", "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"] },
  closure: { title: "\u041E\u0442\u0447\u0451\u0442 \u043E \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0438 \u0434\u0435\u043B\u0430", stages: ["\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"] },
  orderApplication: { title: "\u0417\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u043E \u0432\u044B\u0434\u0430\u0447\u0435 \u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0433\u043E \u043F\u0440\u0438\u043A\u0430\u0437\u0430", stages: ["\u041F\u0440\u0438\u043A\u0430\u0437"] },
  courtInventory: { title: "\u041E\u043F\u0438\u0441\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432", stages: ["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A"] },
  claim: { title: "\u0418\u0441\u043A\u043E\u0432\u043E\u0435 \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435", stages: ["\u0418\u0441\u043A"] },
  enforcementApplication: { title: "\u0417\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u043E \u043F\u0440\u0435\u0434\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u0438 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430", stages: ["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B"] },
  calculation: { title: "\u0420\u0430\u0441\u0447\u0451\u0442 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438", stages: ["\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435", "\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B", "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"] }
};
function availableTemplates(c) {
  return Object.entries(DOCUMENTS).filter(([kind, d]) => d.stages.includes(c?.stage) && (kind !== "enforcementApplication" || c.legal?.status !== "\u041E\u0442\u043C\u0435\u043D\u0451\u043D \u043F\u0440\u0438\u043A\u0430\u0437" && c.documents?.some((doc) => !doc.archived && (c.stage === "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B" ? ["order", "enforcement"].includes(doc.kind) : doc.kind === (c.stage === "\u041F\u0440\u0438\u043A\u0430\u0437" ? "order" : "enforcement")))));
}
function caseProgress(c, r) {
  const progress = stageProgress(c, r), issues = r && c?.stage !== "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" ? reviewReasons(r) : [];
  return issues.length ? { ...progress, dataIssue: issues.join("; "), next: r.reviewTask?.status === "open" ? "\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0438\u0438" : "\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0441\u0443\u043C\u043C\u0443 \u043F\u0435\u0440\u0435\u0434 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u0435\u043C", work: r.reviewTask?.status === "open" ? "reviewStatus" : "review" } : progress;
}
function stageProgress(c, r) {
  if (!c && r && amount(r) === 0) return { label: "\u0417\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438 \u043D\u0435\u0442", next: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u043B\u0438\u0446\u0435\u0432\u043E\u0433\u043E \u0441\u0447\u0451\u0442\u0430", work: "history" };
  if (!c) return { label: "\u0412\u0437\u044B\u0441\u043A\u0430\u043D\u0438\u0435 \u043D\u0435 \u043D\u0430\u0447\u0430\u0442\u043E", next: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", work: "channels" };
  if (c.stage !== "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" && c.balanceConfirmed && amount(c.remaining) === 0) return { label: "\u0414\u043E\u043B\u0433 \u043F\u043E \u0434\u0435\u043B\u0443 \u043F\u043E\u0433\u0430\u0448\u0435\u043D", next: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0438 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0434\u0435\u043B\u043E", work: "closeCase" };
  if (c.stage === "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435") return c.agreement ? { label: `\u041F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043E: ${c.agreement.number} \u043E\u0442 ${c.agreement.date}`, next: c.schedule.some((x) => !x.paid) ? "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043B\u0430\u0442\u0451\u0436 \u043F\u043E \u0433\u0440\u0430\u0444\u0438\u043A\u0443" : "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u043F\u043E \u0434\u0435\u043B\u0443", work: c.schedule.some((x) => !x.paid) ? "installment" : "follow" } : c.agreementProposal ? { label: "\u0413\u0440\u0430\u0444\u0438\u043A \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D, \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u0435\u0449\u0451 \u043D\u0435\u0442", next: "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u0438\u0435", work: "agreement" } : { label: "\u0423\u0441\u043B\u043E\u0432\u0438\u044F \u0440\u0430\u0441\u0441\u0440\u043E\u0447\u043A\u0438 \u043D\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u044B", next: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u0438 \u0433\u0440\u0430\u0444\u0438\u043A", work: "agreement" };
  if (c.stage === "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435") {
    const events = (r?.events || []).filter((e) => e.caseId === c.id && ["app", "email", "max", "robot", "notice", "receipt"].includes(e.action) && !e.status.startsWith("\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E"));
    const sent = events.find((e) => ["\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u041E\u0431\u0435\u0449\u0430\u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0430 (\u0434\u0435\u043C\u043E)"].includes(e.status));
    if (c.contactResult) return { label: c.contactResult.label, next: "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0442\u0432\u0435\u0442 / \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u043F\u043B\u0430\u0442\u0443", work: "outcome" };
    if (!sent && events.some((e) => e.status === "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0434\u043B\u044F \u043F\u0435\u0447\u0430\u0442\u0438 (\u0434\u0435\u043C\u043E)")) return { label: "\u041F\u0435\u0447\u0430\u0442\u043D\u0430\u044F \u0444\u043E\u0440\u043C\u0430 \u0433\u043E\u0442\u043E\u0432\u0430, \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E", next: "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u044F", work: "outcome" };
    return sent ? { label: sent.status, next: "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0442\u0432\u0435\u0442 \u0434\u043E\u043B\u0436\u043D\u0438\u043A\u0430", work: "outcome" } : { label: events.length ? "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E, \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E" : "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u0435\u0449\u0451 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E", next: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", work: "channels" };
  }
  if (c.stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E") return { label: c.closedReason || "\u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E", next: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u044E", work: "documents" };
  const hasDocument = c.documents?.some((d) => !d.archived && d.kind === { \u041F\u0440\u0438\u043A\u0430\u0437: "order", \u0418\u0441\u043A: "claim", \u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B: "enforcement" }[c.stage]);
  if (c.legal?.status === "\u041E\u0442\u043C\u0435\u043D\u0451\u043D \u043F\u0440\u0438\u043A\u0430\u0437") return { label: "\u0421\u0443\u0434\u0435\u0431\u043D\u044B\u0439 \u043F\u0440\u0438\u043A\u0430\u0437 \u043E\u0442\u043C\u0435\u043D\u0451\u043D", next: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u0430\u043B\u044C\u043D\u0435\u0439\u0448\u0438\u0439 \u043F\u0443\u0442\u044C: \u0438\u0441\u043A", work: "transition" };
  if (c.stage === "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C") return { label: "\u0412 \u0441\u0442\u0430\u0440\u043E\u043C \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D \u0432\u0438\u0434 \u0441\u0443\u0434\u0430", next: "\u0423\u043A\u0430\u0437\u0430\u0442\u044C: \u043F\u0440\u0438\u043A\u0430\u0437 \u0438\u043B\u0438 \u0438\u0441\u043A", work: "transition" };
  if (c.stage === "\u041F\u0440\u0438\u043A\u0430\u0437" && c.legal?.status === "\u041F\u043E\u043B\u0443\u0447\u0435\u043D \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442" && !c.documents?.some((d) => !d.archived && d.kind === "order")) return { label: "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u043F\u0440\u0438\u043A\u0430\u0437\u0430 \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043E, \u0444\u0430\u0439\u043B \u043D\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D", next: "\u041F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u044C \u0441\u0443\u0434\u0435\u0431\u043D\u044B\u0439 \u043F\u0440\u0438\u043A\u0430\u0437", work: "uploadCase" };
  if (c.stage === "\u0418\u0441\u043A" && c.legal?.status === "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u0435" && !c.documents?.some((d) => !d.archived && d.kind === "enforcement")) return { label: "\u0420\u0435\u0448\u0435\u043D\u0438\u0435 \u0441\u0443\u0434\u0430 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043E", next: "\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442", work: "receiveExecution" };
  if (["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A"].includes(c.stage) && c.packageRevisionNeeded) return { label: c.legal?.status || "\u041D\u0443\u0436\u043D\u044B \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F", next: "\u0418\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043F\u0430\u043A\u0435\u0442 \u043F\u043E \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F\u043C \u0441\u0443\u0434\u0430", work: "reworkPackage" };
  if (c.stage === "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B") return { label: c.legal?.status || "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u043F\u0440\u0438\u043D\u044F\u0442\u0438\u044F \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430", next: c.legal?.status === "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0451\u043D \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442" ? "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u043E \u043F\u0440\u0435\u0434\u044A\u044F\u0432\u0438\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442" : c.legal?.status === "\u0418\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435" ? "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F" : "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0442\u0432\u0435\u0442 \u0431\u0430\u043D\u043A\u0430 / \u0424\u0421\u0421\u041F", work: c.legal?.status === "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0451\u043D \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442" ? "enforcement" : "legal" };
  if (["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A"].includes(c.stage) && c.documents?.some((d) => !d.archived && d.kind === (c.stage === "\u041F\u0440\u0438\u043A\u0430\u0437" ? "order" : "enforcement"))) return { label: c.legal?.status || "\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D", next: "\u041F\u0440\u0435\u0434\u044A\u044F\u0432\u0438\u0442\u044C \u0432 \u0431\u0430\u043D\u043A / \u0424\u0421\u0421\u041F", work: "enforcement" };
  if (["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A"].includes(c.stage) && (!c.legal?.status || ["\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430", "\u0418\u0441\u043A \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D", "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u0438\u0441\u043A\u0430"].includes(c.legal.status))) {
    const kinds = c.stage === "\u041F\u0440\u0438\u043A\u0430\u0437" ? ["orderApplication", "calculation", "courtInventory"] : ["claim", "calculation", "courtInventory"];
    const docs = r ? stageDocumentEntries(r) : [];
    const ready = kinds.every((k) => docs.some((d) => d.kind === k && d.id && !d.missing.length));
    return ready ? { label: "\u041F\u0430\u043A\u0435\u0442 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D, \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u0430\u043D", next: "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u0434\u0430\u0447\u0443 \u0432 \u0441\u0443\u0434", work: "legal" } : { label: "\u0417\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u0433\u043E\u0442\u043E\u0432\u0438\u0442\u0441\u044F", next: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u043F\u0430\u043A\u0435\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432", work: "templates" };
  }
  if (c.legal?.next) return { label: c.legal.status || "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D", next: c.legal.status === "\u041E\u0442\u043A\u0430\u0437\u0430\u043D\u043E" ? "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u044E\u0440\u0438\u0441\u0442\u0430 \u043F\u043E \u043E\u0442\u043A\u0430\u0437\u0443" : c.legal.next, work: "legal" };
  if (["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A"].includes(c.stage)) return { label: c.legal?.status || "\u0417\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u0433\u043E\u0442\u043E\u0432\u0438\u0442\u0441\u044F", next: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F", work: "templates" };
  return { label: c.legal?.status || "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u044D\u0442\u0430\u043F\u0430 \u043D\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D", next: c.legal?.next || (hasDocument ? "\u0423\u043A\u0430\u0437\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433" : "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0438\u043B\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442"), work: c.legal?.next || hasDocument ? "legal" : "templates" };
}
function reviewReasons(r) {
  return [r.unallocated > 0 ? `\u041D\u0435 \u0440\u0430\u0437\u043D\u0435\u0441\u0435\u043D\u0430 \u043E\u043F\u043B\u0430\u0442\u0430 ${money(r.unallocated)}` : "", r.caseBalanceConflict ? `\u041D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0434\u043E\u043B\u0433\u0430 \u041B\u0421 ${money(amount(r))} \u043C\u0435\u0436\u0434\u0443 \u0434\u0435\u043B\u0430\u043C\u0438. \u041D\u0443\u0436\u0435\u043D \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0433\u043E \u0434\u043E\u043B\u0433\u0430, \u043F\u0435\u043D\u0435\u0439 \u0438 \u043F\u043E\u0448\u043B\u0438\u043D\u044B \u043F\u043E \u043A\u0430\u0436\u0434\u043E\u043C\u0443 \u0434\u0435\u043B\u0443` : "", r.disputed ? "\u0416\u0438\u0442\u0435\u043B\u044C \u043E\u0441\u043F\u0430\u0440\u0438\u0432\u0430\u0435\u0442 \u0441\u0443\u043C\u043C\u0443 \u0434\u043E\u043B\u0433\u0430" : "", days(r.asOf) > 7 ? `\u0420\u0435\u0435\u0441\u0442\u0440 \u043E\u0442 ${r.asOf} \u0443\u0441\u0442\u0430\u0440\u0435\u043B` : "", r.reviewTask?.status === "open" ? `\u0416\u0434\u0451\u043C \u043E\u0442\u0432\u0435\u0442 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0430: ${r.reviewTask.reason}` : ""].filter(Boolean);
}
function stageDocumentEntries(r) {
  const c = currentCase(r);
  if (!c) return [];
  return availableTemplates(c).map(([kind]) => {
    const fresh = draftDocument(r, kind), saved = c.drafts?.findLast((d) => !d.archived && d.kind === kind && JSON.stringify(d.data) === JSON.stringify(fresh.data));
    return saved ? { ...saved, missing: saved.status === "sent" ? saved.missing : fresh.missing } : { ...fresh, status: "not_created" };
  });
}
function ensureDocument(r, kind) {
  const entry = stageDocumentEntries(r).find((d) => d.kind === kind);
  if (!entry) throw Error("\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u043D\u0430 \u044D\u0442\u043E\u043C \u044D\u0442\u0430\u043F\u0435");
  if (entry.id) {
    const saved2 = currentCase(r).drafts.find((d) => d.id === entry.id);
    if (saved2.status !== "sent") saved2.missing = entry.missing;
    return saved2;
  }
  const saved = saveDraft(r, entry, entry.text);
  saved.autoFilled = true;
  return saved;
}
function stageAge(c) {
  if (!c?.stageEnteredAt) return "\u0414\u0430\u0442\u0430 \u0432\u0445\u043E\u0434\u0430 \u043D\u0430 \u044D\u0442\u0430\u043F \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u0430";
  const n = Math.floor((Date.parse(TODAY) - Date.parse(c.stageEnteredAt)) / 864e5);
  return Number.isFinite(n) && n >= 0 ? `${n} \u0434\u043D. \u043D\u0430 \u044D\u0442\u0430\u043F\u0435 \xB7 \u0441 ${c.stageEnteredAt}` : "\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u0430\u0442\u0443 \u0432\u0445\u043E\u0434\u0430 \u043D\u0430 \u044D\u0442\u0430\u043F";
}
function draftDocument(r, kind) {
  const draft = buildDraftDocument(r, kind), c = currentCase(r);
  if (["orderApplication", "claim", "enforcementApplication"].includes(kind)) draft.text = draft.text.replace("\u041A\u043E\u043C\u0443:", "\u0414\u043E\u043B\u0436\u043D\u0438\u043A:");
  if (kind === "enforcementApplication") {
    draft.data.recipient = c.legal?.recipient || "bank";
    draft.data.legalNumber = c.legal?.number || "";
    if (draft.data.recipient === "fssp") draft.text = draft.text.replace("\u0410\u0434\u0440\u0435\u0441\u0430\u0442: \u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0431\u0430\u043D\u043A.", "\u0410\u0434\u0440\u0435\u0441\u0430\u0442: \u0423\u0447\u0435\u0431\u043D\u043E\u0435 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0424\u0421\u0421\u041F.");
  }
  if (["agreement", "schedule"].includes(kind)) {
    const terms = c.agreement || c.agreementProposal;
    draft.data.agreementNumber = terms?.number || "";
    draft.data.agreementDate = terms?.date || "";
    draft.data.agreementStatus = c.agreement ? "\u041F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043E" : "\u041F\u0440\u043E\u0435\u043A\u0442, \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u043D\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u044B";
    draft.text += `

\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435: ${terms?.number || "[\u043D\u043E\u043C\u0435\u0440 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D]"} \u043E\u0442 ${terms?.date || "[\u0434\u0430\u0442\u0430 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u0430]"}. ${draft.data.agreementStatus}.`;
    if (!terms) draft.missing.push("\u043D\u043E\u043C\u0435\u0440 \u0438 \u0434\u0430\u0442\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F");
    if (kind === "agreement" && !c.schedule.length) draft.missing.push("\u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0433\u0440\u0430\u0444\u0438\u043A \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439");
  }
  if (kind === "agreement") draft.data.schedule = JSON.stringify(c.schedule.map((x) => ({ date: x.date, amount: x.amount })));
  if (kind === "schedule") {
    draft.data.schedule = JSON.stringify(c.schedule);
    if (!c.schedule.length) draft.missing.push("\u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0433\u0440\u0430\u0444\u0438\u043A \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439");
    draft.text += `

\u0413\u0440\u0430\u0444\u0438\u043A: ${c.schedule.map((x) => `${x.date}: ${money(x.amount)} \xB7 ${x.paid ? "\u043E\u043F\u043B\u0430\u0442\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430" : "\u043E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F"}`).join("\n") || "\u041D\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D"}`;
  }
  if (["paymentStatement", "closure"].includes(kind)) {
    const payments = (r.payments || []).filter((p) => p.caseId === c.id);
    draft.data.payments = JSON.stringify(payments);
    draft.data.closedReason = c.closedReason || "";
    draft.text += `

\u041E\u043F\u043B\u0430\u0442\u044B \u043F\u043E \u0434\u0435\u043B\u0443:
${payments.map((p) => `${p.at} \xB7 ${p.source || "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D"} \xB7 ${p.reference || p.externalId || p.id || "\u0411\u0435\u0437 \u043D\u043E\u043C\u0435\u0440\u0430"} \xB7 ${money(p.amount)} (\u0434\u043E\u043B\u0433 ${money(p.principal)}, \u043F\u0435\u043D\u0438 ${money(p.penalty)}, \u043F\u043E\u0448\u043B\u0438\u043D\u0430 ${money(p.fee)})`).join("\n") || "\u041F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u043D\u0435 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u044B"}
\u041E\u0441\u0442\u0430\u0442\u043E\u043A: ${money(amount(c.remaining))}${kind === "closure" ? "\n\u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F: " + (c.closedReason || "\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E") : ""}`;
    if (kind === "closure" && !c.closedReason) draft.missing.push("\u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F");
  }
  if (["notice", "demand"].includes(kind)) {
    const data = draft.data;
    data.templateRevision = "notice-2026-11-03";
    draft.text = `\u0414\u0415\u041C\u041E\u041D\u0421\u0422\u0420\u0410\u0426\u0418\u041E\u041D\u041D\u042B\u0419 \u0414\u041E\u041A\u0423\u041C\u0415\u041D\u0422. \u041D\u0415 \u0414\u041B\u042F \u041E\u0422\u041F\u0420\u0410\u0412\u041A\u0418.
${draft.title}
\u2116 ${c.id} \u043E\u0442 ${TODAY}
\u041E\u0442: ${data.company}
\u041A\u043E\u043C\u0443: ${data.people}
\u0410\u0434\u0440\u0435\u0441: ${data.address}
\u041B\u0438\u0446\u0435\u0432\u043E\u0439 \u0441\u0447\u0451\u0442: ${data.account}

\u041F\u043E \u0434\u0430\u043D\u043D\u044B\u043C \u043D\u0430 ${r.asOf} \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0437\u0430 ${data.period} \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 ${money(data.remaining)}.
\u0417\u0430 \u0443\u0441\u043B\u0443\u0433\u0438: ${money(data.principal)}
\u041F\u0435\u043D\u0438: ${money(data.penalty)}
\u0413\u043E\u0441\u043F\u043E\u0448\u043B\u0438\u043D\u0430 \u043A \u0432\u043E\u0437\u043C\u0435\u0449\u0435\u043D\u0438\u044E: ${money(data.fee)}

\u041F\u0440\u043E\u0441\u0438\u043C \u043F\u043E\u0433\u0430\u0441\u0438\u0442\u044C \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C. \u0415\u0441\u043B\u0438 \u0412\u044B \u0443\u0436\u0435 \u043E\u043F\u043B\u0430\u0442\u0438\u043B\u0438 \u0434\u043E\u043B\u0433 \u043B\u0438\u0431\u043E \u043D\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043D\u044B \u0441 \u0441\u0443\u043C\u043C\u043E\u0439, \u0441\u043E\u043E\u0431\u0449\u0438\u0442\u0435 \u043E\u0431 \u044D\u0442\u043E\u043C \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0449\u0435\u0439 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438 \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u0438 \u0440\u0430\u0441\u0447\u0451\u0442\u0430.
${kind === "demand" ? "\u041F\u043E\u0441\u043B\u0435\u0434\u0441\u0442\u0432\u0438\u044F \u043D\u0435\u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F, \u0441\u0440\u043E\u043A \u043E\u0442\u0432\u0435\u0442\u0430 \u0438 \u043F\u0440\u0430\u0432\u043E\u0432\u044B\u0435 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u0438 \u0434\u043E\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F \u0432 \u0441\u0443\u0434 \u043D\u0435\u0442.\n" : ""}
\u041F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u0438\u0442\u0435\u043B\u044C \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438: ____________________

\u0418\u0417\u0412\u0415\u0429\u0415\u041D\u0418\u0415 \u041E\u0411 \u041E\u041F\u041B\u0410\u0422\u0415
\u041F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044C: ${data.company}
\u041B\u0421 ${data.account}
\u041A \u043E\u043F\u043B\u0430\u0442\u0435: ${money(data.remaining)}
\u0420\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u0438 QR-\u043A\u043E\u0434 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u044B \u0432 \u0434\u0435\u043C\u043E.

\u041E\u0422\u041C\u0415\u0422\u041A\u0410 \u041E \u0412\u0420\u0423\u0427\u0415\u041D\u0418\u0418
\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0430 \u0441\u0443\u043C\u043C\u0443 ${money(data.remaining)} \u043F\u043E\u043B\u0443\u0447\u0435\u043D.
\u0414\u0430\u0442\u0430: ____________________
\u0424\u0418\u041E \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044F: ____________________
\u041F\u043E\u0434\u043F\u0438\u0441\u044C: ____________________
\u0417\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438 \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u043C \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u0438.

\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u0430\u0434\u0430\u043F\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u043F\u043E \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u043E\u043C\u0443 \u043E\u0431\u0440\u0430\u0437\u0446\u0443 \u0432\u0442\u043E\u0440\u043E\u0433\u043E \u043B\u0438\u0441\u0442\u0430 \u043A\u0432\u0438\u0442\u0430\u043D\u0446\u0438\u0438. \u0420\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B, \u0430\u0434\u0440\u0435\u0441 \u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u044C \u0438\u0437 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u0430 \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442\u0441\u044F.
${draft.missing.length ? "\u041D\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445: " + draft.missing.join("; ") : "\u0421\u0443\u043C\u043C\u044B \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u044B \u0438\u0437 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430."}`;
  }
  if (["notice", "demand"].includes(kind)) draft.text += `

\u0420\u0430\u0441\u0447\u0451\u0442 \u0441\u0443\u043C\u043C\u044B (\u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435):
${draft.data.calculation}`;
  return draft;
}
function buildDraftDocument(r, kind) {
  const c = currentCase(r), def = DOCUMENTS[kind];
  if (!c || !def || !def.stages.includes(c.stage)) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u044D\u0442\u0430\u043F\u0430");
  const frozen = ["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B", "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"].includes(c.stage) && c.claim;
  const missing = [];
  if (!r.owners?.length) missing.push("\u0424\u0418\u041E \u0438 \u0434\u043E\u043B\u0438 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u043E\u0432");
  if (!r.charges?.length) missing.push("\u043F\u043E\u043C\u0435\u0441\u044F\u0447\u043D\u044B\u0439 \u0440\u0430\u0441\u0447\u0451\u0442 \u0438\u0437 \u0431\u0438\u043B\u043B\u0438\u043D\u0433\u0430");
  if (r.caseBalanceConflict) missing.push("\u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u043E\u0441\u0442\u0430\u0442\u043A\u0438 \u043F\u043E \u0434\u0435\u043B\u0430\u043C");
  if (r.unallocated > 0) missing.push("\u0440\u0430\u0437\u043D\u0435\u0441\u0435\u043D\u0438\u0435 \u043F\u043E\u0441\u0442\u0443\u043F\u0438\u0432\u0448\u0435\u0439 \u043E\u043F\u043B\u0430\u0442\u044B");
  if (days(r.asOf) > 7) missing.push("\u0441\u0432\u0435\u0436\u0438\u0439 \u0440\u0435\u0435\u0441\u0442\u0440 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438");
  if (r.disputed || r.reviewTask?.status === "open") missing.push("\u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438");
  if (!c.period?.trim()) missing.push("\u043F\u0435\u0440\u0438\u043E\u0434 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438");
  if (["orderApplication", "claim", "enforcementApplication"].includes(kind) && !r.billing) missing.push("\u0440\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u0430\u0434\u0440\u0435\u0441\u0430\u0442\u0430 \u0438 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0439 \u044E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0442\u0435\u043A\u0441\u0442");
  const debtors = currentCase(r)?.ownerBalances || r.owners;
  const people = debtors?.length ? debtors.map((o) => `${o.name}, \u0434\u043E\u043B\u044F ${o.share}%`).join("; ") : "[\u0424\u0418\u041E \u0438 \u0434\u043E\u043B\u0438 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u044B]";
  const lines = r.billing ? frozen && c.claim.calculation ? c.claim.calculation : billingLines(r, c.id) : null;
  const calculation = lines ? lines.map((x) => `${x.month} \xB7 ${x.service} \xB7 ${r.billing.area} \u043C\xB2 \xB7 ${x.formula}
\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u043E ${money(x.charged)}; \u043E\u043F\u043B\u0430\u0447\u0435\u043D\u043E ${money(x.paid)}; \u0434\u043E\u043B\u0433 ${money(principalDue(x))}; \u043F\u0435\u043D\u0438 ${money(penaltyDue(x))}`).join("\n") : r.charges?.length ? r.charges.map((x) => `${x.month}: \u043F\u043B\u043E\u0449\u0430\u0434\u044C ${x.area} \u043C\xB2; ${x.formula}; \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u043E ${money(x.charges)}; \u043E\u043F\u043B\u0430\u0447\u0435\u043D\u043E ${money(x.payments)}; \u043E\u0441\u0442\u0430\u0442\u043E\u043A ${money(x.closing)}`).join("\n") : "[\u041F\u043E\u043C\u0435\u0441\u044F\u0447\u043D\u044B\u0439 \u0440\u0430\u0441\u0447\u0451\u0442 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D]";
  const data = { company: r.company, address: `${r.building}, \u043A\u0432. ${r.flat}`, account: r.account, people, caseId: c.id, period: frozen ? c.claim.period : c.period, amount: frozen ? c.claim.amount : amount(c.remaining), remaining: amount(c.remaining), principal: c.remaining.principal, penalty: c.remaining.penalty, fee: c.remaining.fee, date: TODAY, calculation };
  const purpose = { schedule: "\u0413\u0440\u0430\u0444\u0438\u043A \u0438 \u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439.", paymentStatement: "\u0423\u0447\u0442\u0451\u043D\u043D\u044B\u0435 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u043E\u0442\u043D\u043E\u0441\u044F\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C\u0443 \u0434\u0435\u043B\u0443.", closure: "\u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u0438 \u0438\u0442\u043E\u0433\u043E\u0432\u044B\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430.", notice: "\u041F\u0440\u043E\u0441\u0438\u043C \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0440\u0430\u0441\u0447\u0451\u0442 \u0438 \u043F\u043E\u0433\u0430\u0441\u0438\u0442\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0443\u044E \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C.", demand: "\u041F\u0440\u0435\u0442\u0435\u043D\u0437\u0438\u043E\u043D\u043D\u044B\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F, \u0441\u0440\u043E\u043A \u043E\u0442\u0432\u0435\u0442\u0430 \u0438 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u044F \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442.", agreement: "\u0413\u0440\u0430\u0444\u0438\u043A, \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u0441\u0442\u043E\u0440\u043E\u043D \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u044E\u0442\u0441\u044F \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0442\u0441\u044F \u044E\u0440\u0438\u0441\u0442\u043E\u043C.", orderApplication: "\u0421\u043E\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u044F \u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442 \u043F\u0435\u0440\u0435\u0434 \u043F\u043E\u0434\u0430\u0447\u0435\u0439.", claim: "\u041E\u0431\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430, \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442.", enforcementApplication: "\u0410\u0434\u0440\u0435\u0441\u0430\u0442 (\u0424\u0421\u0421\u041F \u0438\u043B\u0438 \u0431\u0430\u043D\u043A), \u0440\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430 \u0438 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442.", courtInventory: "\u0421\u043E\u0441\u0442\u0430\u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u043F\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u043C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430.", calculation: "\u0414\u0430\u043D\u043D\u044B\u0435 \u0440\u0430\u0441\u0447\u0451\u0442\u0430 \u043F\u043E\u0441\u0442\u0443\u043F\u0430\u044E\u0442 \u0438\u0437 \u0431\u0438\u043B\u043B\u0438\u043D\u0433\u0430; \u043E\u0441\u0442\u0430\u0442\u043A\u0438 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0434\u0435\u043B \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E." }[kind];
  const demoPurpose = r.billing ? { notice: `\u041F\u0440\u043E\u0441\u0438\u043C \u043F\u043E\u0433\u0430\u0441\u0438\u0442\u044C \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C ${money(data.remaining)}. \u0423\u0447\u0435\u0431\u043D\u0430\u044F \u0434\u0430\u0442\u0430 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044F: 05.11.2026. \u041F\u0440\u0438 \u043D\u0435\u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0438 \u043D\u0430\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0435 \u0432 \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0449\u0443\u044E \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044E.`, demand: `\u041F\u0440\u0435\u0442\u0435\u043D\u0437\u0438\u044F: \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435 \u043E\u0431 \u043E\u043F\u043B\u0430\u0442\u0435 ${money(data.remaining)} \u0437\u0430 ${data.period}. \u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435: \u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u0434\u043E\u0433\u043E\u0432\u043E\u0440 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u0434\u043E\u043C\u043E\u043C, \u0440\u0430\u0441\u0447\u0451\u0442 \u0438 \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E\u0431 \u043E\u043F\u043B\u0430\u0442\u0430\u0445. \u0423\u0447\u0435\u0431\u043D\u0430\u044F \u0434\u0430\u0442\u0430 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044F: 05.11.2026.`, agreement: `\u0421\u0442\u043E\u0440\u043E\u043D\u044B: ${r.company} \u0438 ${people}. \u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F: \u043F\u043E\u0433\u0430\u0448\u0435\u043D\u0438\u0435 ${money(data.remaining)} \u0437\u0430 ${data.period}. \u0413\u0440\u0430\u0444\u0438\u043A \u043F\u0440\u0438\u0432\u0435\u0434\u0451\u043D \u043D\u0438\u0436\u0435; \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0432 \u0434\u0435\u043C\u043E \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F.`, orderApplication: `\u0410\u0434\u0440\u0435\u0441\u0430\u0442: \u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0441\u0443\u0434\u0435\u0431\u043D\u044B\u0439 \u0443\u0447\u0430\u0441\u0442\u043E\u043A \u2116 1. \u0417\u0430\u044F\u0432\u0438\u0442\u0435\u043B\u044C: ${r.company}. \u0414\u043E\u043B\u0436\u043D\u0438\u043A: ${people}. \u0423\u0447\u0435\u0431\u043D\u043E\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435: \u0432\u044B\u0434\u0430\u0442\u044C \u043F\u0440\u0438\u043A\u0430\u0437 \u043E \u0432\u0437\u044B\u0441\u043A\u0430\u043D\u0438\u0438 ${money(data.amount)} \u0437\u0430 ${data.period}. \u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435: \u0434\u043E\u0433\u043E\u0432\u043E\u0440 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u0434\u043E\u043C\u043E\u043C, \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u0438 \u043D\u0435\u043E\u043F\u043B\u0430\u0447\u0435\u043D\u043D\u044B\u0435 \u0443\u0441\u043B\u0443\u0433\u0438. \u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F: \u0440\u0430\u0441\u0447\u0451\u0442 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438, \u0434\u043E\u0433\u043E\u0432\u043E\u0440 \u0434\u043E\u043C\u0430, \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430\u0445, \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E\u0449\u0438\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B.`, claim: `\u0410\u0434\u0440\u0435\u0441\u0430\u0442: \u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0440\u0430\u0439\u043E\u043D\u043D\u044B\u0439 \u0441\u0443\u0434. \u0418\u0441\u0442\u0435\u0446: ${r.company}. \u041E\u0442\u0432\u0435\u0442\u0447\u0438\u043A: ${people}. \u0423\u0447\u0435\u0431\u043D\u043E\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435: \u0432\u0437\u044B\u0441\u043A\u0430\u0442\u044C ${money(data.amount)} \u0437\u0430 ${data.period}. \u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435: \u043D\u0435\u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432 \u043F\u043E \u0443\u0447\u0435\u0431\u043D\u043E\u043C\u0443 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0443 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F; \u0440\u0430\u0441\u0447\u0451\u0442 \u043F\u0440\u0438\u0432\u0435\u0434\u0451\u043D \u043D\u0438\u0436\u0435. \u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F: \u0440\u0430\u0441\u0447\u0451\u0442, \u0434\u043E\u0433\u043E\u0432\u043E\u0440 \u0434\u043E\u043C\u0430, \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430\u0445 \u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0434\u043E\u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u044B.`, enforcementApplication: `\u0410\u0434\u0440\u0435\u0441\u0430\u0442: \u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0431\u0430\u043D\u043A. \u0412\u0437\u044B\u0441\u043A\u0430\u0442\u0435\u043B\u044C: ${r.company}. \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442: ${c.legal?.number || "\u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442"}. \u0423\u0447\u0435\u0431\u043D\u043E\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435: \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0432 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u0445 \u043D\u0435\u043F\u043E\u0433\u0430\u0448\u0435\u043D\u043D\u043E\u0439 \u0441\u0443\u043C\u043C\u044B ${money(data.remaining)}. \u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435: \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430. \u0411\u0430\u043D\u043A\u043E\u0432\u0441\u043A\u0438\u0435 \u0440\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u0432 \u0434\u0435\u043C\u043E \u043D\u0435 \u044F\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u043C\u0438.`, courtInventory: "\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0441\u043E\u0441\u0442\u0430\u0432 \u043F\u0430\u043A\u0435\u0442\u0430: \u0440\u0430\u0441\u0447\u0451\u0442 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438 \u043F\u043E \u0434\u0435\u043B\u0443, \u043E\u0431\u0449\u0438\u0439 \u0434\u043E\u0433\u043E\u0432\u043E\u0440 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u0434\u043E\u043C\u043E\u043C, \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0434\u0435\u043B\u0430. \u0424\u0430\u0439\u043B\u044B \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u044B \u0432 ZIP-\u043F\u0430\u043A\u0435\u0442\u0435." }[kind] : null;
  return { kind, title: def.title, data, missing, text: `\u0414\u0415\u041C\u041E\u041D\u0421\u0422\u0420\u0410\u0426\u0418\u041E\u041D\u041D\u042B\u0419 \u0427\u0415\u0420\u041D\u041E\u0412\u0418\u041A. \u041D\u0415 \u0414\u041B\u042F \u041E\u0422\u041F\u0420\u0410\u0412\u041A\u0418 \u0418 \u041F\u041E\u0414\u0410\u0427\u0418.
${def.title}
\u0414\u0430\u0442\u0430: ${TODAY}
\u041E\u0442: ${r.company}
\u041A\u043E\u043C\u0443: ${people}
\u0410\u0434\u0440\u0435\u0441: ${data.address}
\u041B\u0421: ${r.account} \xB7 \u0434\u0435\u043B\u043E ${c.id}
\u041F\u0435\u0440\u0438\u043E\u0434 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F: ${data.period}
${frozen ? "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435" : "\u0421\u0443\u043C\u043C\u0430 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F"}: ${money(data.amount)}
\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0434\u0435\u043B\u0430: ${money(data.remaining)}
\u0412 \u043E\u0441\u0442\u0430\u0442\u043A\u0435: \u0434\u043E\u043B\u0433 ${money(data.principal)}; \u043F\u0435\u043D\u0438 ${money(data.penalty)}; \u0433\u043E\u0441\u043F\u043E\u0448\u043B\u0438\u043D\u0430 ${money(data.fee)}

${demoPurpose || purpose}
${["agreement", "schedule"].includes(kind) && c.schedule.length ? "\u0413\u0440\u0430\u0444\u0438\u043A: " + c.schedule.map((x) => `${x.date}: ${money(x.amount)}`).join("; ") : ""}

${lines ? frozen ? "\u0420\u0430\u0441\u0447\u0451\u0442 \u043D\u0430 \u0434\u0430\u0442\u0443 \u0444\u0438\u043A\u0441\u0430\u0446\u0438\u0438 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F" : "\u0420\u0430\u0441\u0447\u0451\u0442 \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C\u0443 \u0434\u0435\u043B\u0443" : "\u0420\u0430\u0441\u0447\u0451\u0442 \u043F\u043E \u041B\u0421 (\u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u0435\u0442 \u0440\u0430\u0441\u0447\u0451\u0442 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430)"}:
${calculation}

\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0438\u0435 \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F: ${missing.join("; ") || "\u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0440\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u0438 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u043F\u0435\u0440\u0435\u0434 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u0435\u043C"}.` };
}
function saveDraft(r, draft, text, id) {
  const c = currentCase(r);
  if (!c || !text.trim()) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430");
  c.drafts ||= [];
  const old = id && c.drafts.find((d) => d.id === id);
  if (id && !old) throw Error("\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
  if (old?.archived) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442");
  if (old?.status === "sent") throw Error("\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0439 \u044D\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F \u043D\u0435\u0438\u0437\u043C\u0435\u043D\u043D\u044B\u043C. \u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A.");
  const doc = { ...draft, id: old?.id || crypto.randomUUID(), text: text.trim(), status: "draft", created: old?.created || TODAY, updated: TODAY, archived: false };
  if (old) Object.assign(old, doc);
  else c.drafts.push(doc);
  return doc;
}
function documentStatus(r, id, status) {
  const c = currentCase(r), d = c?.drafts?.find((d2) => d2.id === id);
  if (!d || d.archived) throw Error("\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
  if (!["draft", "prepared", "sent"].includes(status)) throw Error("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441");
  if (status === "prepared" && d.missing.length) throw Error(`\u041D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E: ${d.missing.join("; ")}`);
  if (status === "sent" && d.status !== "prepared") throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u044C\u0442\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442");
  if (d.status === "sent") throw Error("\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0439 \u044D\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440 \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F");
  d.status = status;
  d.updated = TODAY;
}
function documentText(r, id) {
  const d = currentCase(r)?.drafts?.find((d2) => d2.id === id);
  if (!d || d.archived) throw Error("\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
  return d.text;
}
function accountingContext(r) {
  return (r.cases || []).filter((c) => c.stage !== "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E").map((c) => ({ id: c.id, stage: c.stage, number: c.legal?.number || "\u043D\u043E\u043C\u0435\u0440 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D", period: c.period, remaining: amount(c.remaining), fee: c.remaining.fee }));
}

// dist/role-actions.mjs
var requests = {
  reconcile: "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0443 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0430 \u0443\u0447\u0451\u0442 \u043F\u043E\u0441\u0442\u0443\u043F\u0438\u0432\u0448\u0435\u0439 \u043E\u043F\u043B\u0430\u0442\u044B",
  stale: "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0443 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0430 \u0441\u0432\u0435\u0436\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A",
  caseBalance: "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0443 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0430 \u043E\u0441\u0442\u0430\u0442\u043A\u0438 \u043F\u043E \u0434\u0435\u043B\u0430\u043C",
  dispute: "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0443 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u0441\u043F\u043E\u0440\u043D\u043E\u0439 \u0441\u0443\u043C\u043C\u044B"
};
function accountingAction(rec, role2) {
  if (rec.key === "waiting") return role2 === "lawyer" ? { label: "\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0443", action: "reviewStatus" } : { label: "\u041E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441 \u044E\u0440\u0438\u0441\u0442\u0430", action: "resolve" };
  if (!requests[rec.key]) return null;
  return role2 === "lawyer" ? { label: requests[rec.key], action: "review" } : { label: rec.label, action: rec.key === "reconcile" ? "payment" : "resolve" };
}
function roleRecommendation(r, role2) {
  const scope = r._caseView ? r : workRecord(r);
  if (role2 === "lawyer" && scope.stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" && !scope.caseId) {
    const rec2 = recommendation(scope);
    if (rec2.key === "waiting") return { ...rec2, label: "\u0421\u0432\u0435\u0440\u0438\u0442\u044C. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u0434\u043E\u043B\u0433 \u043D\u0430 \u041B\u0421", action: "reviewStatus" };
    if (["caseBalance", "reconcile", "stale", "dispute"].includes(rec2.key)) return { ...rec2, label: "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0443 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0430 \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435", action: "review" };
    return { key: "new", label: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", detail: "\u0414\u043E\u043B\u0433 \u044D\u0442\u043E\u0433\u043E \u043F\u0435\u0440\u0438\u043E\u0434\u0430 \u0435\u0449\u0451 \u043D\u0435 \u0432\u043A\u043B\u044E\u0447\u0451\u043D \u0432 \u0434\u0435\u043B\u043E.", action: "channels", tone: "pink" };
  }
  const rec = recommendation(r), accounting = accountingAction(rec, role2);
  if (accounting) return { ...rec, ...accounting };
  if (role2 === "accountant") return { ...rec, label: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u0438 \u0440\u0430\u0441\u0447\u0451\u0442", action: "data", detail: `\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u043D\u0430 ${r.asOf}. \u0420\u0430\u0431\u043E\u0442\u0430 \u0441 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F\u043C\u0438 \u0438 \u043E\u043F\u043B\u0430\u0442\u0430\u043C\u0438.` };
  return rec;
}
function roleCaseProgress(c, r, role2) {
  const p = caseProgress(c, r);
  const rec = r && recommendation({ ...r, caseId: c?.id || null, stage: c?.stage || "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", _caseView: true });
  const accounting = rec && accountingAction(rec, role2);
  if (p.dataIssue && accounting) return { ...p, next: accounting.label, work: accounting.action };
  if (role2 === "accountant") return { ...p, next: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u0438 \u0440\u0430\u0441\u0447\u0451\u0442", work: "data" };
  return p;
}
function visibleStages(rows) {
  return STAGES.filter((stage) => stage !== "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C" || rows.some((r) => r.cases?.some((c) => c.stage === stage)));
}

// dist/operations.mjs
function dateValid(x) {
  return /^\d{4}-\d{2}-\d{2}$/.test(x || "") && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
}
function audit(r, label, note) {
  r.events.unshift({ id: crypto.randomUUID(), at: `${TODAY}T12:00:00`, action: "work", label, status: "\u0423\u0447\u0442\u0435\u043D\u043E \u0432 \u0434\u0435\u043C\u043E", note, caseId: r.caseId });
}
function requestReview(r, due, reason) {
  if (!dateValid(due) || due < TODAY || !reason.trim()) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0440\u0438\u0447\u0438\u043D\u0443 \u0438 \u0441\u0440\u043E\u043A \u0441\u0432\u0435\u0440\u043A\u0438");
  if (r.reviewTask?.status === "open") throw Error("\u0417\u0430\u043F\u0440\u043E\u0441 \u0443\u0436\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u043D \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0438\u0438");
  r.reviewTask = { due, reason: reason.trim(), status: "open", owner: "\u0411\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0438\u044F" };
  audit(r, "\u041F\u0435\u0440\u0435\u0434\u0430\u043D\u043E \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0438\u0438", reason);
}
function resolveReview(r, note) {
  if (!note.trim()) throw Error("\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0441\u0432\u0435\u0440\u043A\u0438");
  if (!r.reviewTask || r.reviewTask.status !== "open") throw Error("\u041D\u0435\u0442 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0433\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0430");
  if (r.caseBalanceConflict || r.unallocated > 0 || days(r.asOf) > 7 || r.disputed) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u0441\u0442\u0440\u0430\u043D\u0438\u0442\u0435 \u043F\u0440\u0438\u0447\u0438\u043D\u0443: \u043E\u043F\u043B\u0430\u0442\u0430, \u043E\u0441\u0442\u0430\u0442\u043A\u0438 \u0434\u0435\u043B, \u0441\u043F\u043E\u0440 \u0438\u043B\u0438 \u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0438\u0439 \u0440\u0435\u0435\u0441\u0442\u0440");
  r.reviewTask.status = "done";
  r.reviewTask.result = note;
  audit(r, "\u0421\u0432\u0435\u0440\u043A\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430", note);
}
function saveLegal(r, input) {
  const c = currentCase(r);
  if (!c) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0434\u0435\u043B\u043E");
  if (!input.number.trim() || !dateValid(input.date) || input.date > TODAY || !dateValid(input.nextDate) || input.nextDate < TODAY || !input.next.trim()) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u043E\u043C\u0435\u0440, \u0434\u0430\u0442\u0443 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430, \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0438 \u0441\u0440\u043E\u043A");
  c.legal = { ...c.legal, ...input };
  r.next = input.next;
  r.nextDate = input.nextDate;
  r.task = { text: input.next, due: input.nextDate, owner: r.owner, status: "open" };
  audit(r, "\u0420\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u0434\u0435\u043B\u0430 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u044B", `${input.number} \xB7 ${input.status}`);
}
function saveAgreement(r, number, date2, schedule) {
  const c = currentCase(r);
  if (!c) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0434\u0435\u043B\u043E");
  if (!number.trim() || !dateValid(date2) || date2 > TODAY) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u043E\u043C\u0435\u0440 \u0438 \u0434\u0430\u0442\u0443 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F");
  if (!schedule.length || schedule.some((s) => !dateValid(s.date) || s.date < date2 || !Number.isSafeInteger(s.amount) || s.amount <= 0)) throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u0430\u0442\u044B \u0438 \u0441\u0443\u043C\u043C\u044B \u0433\u0440\u0430\u0444\u0438\u043A\u0430");
  if (schedule.reduce((a, s) => a + s.amount, 0) !== amount(c.remaining)) throw Error("\u0413\u0440\u0430\u0444\u0438\u043A \u0434\u043E\u043B\u0436\u0435\u043D \u043F\u043E\u043A\u0440\u044B\u0432\u0430\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430");
  if (!c.documents.some((d) => d.kind === "agreement" && !d.archived)) throw Error("\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u0435 \u0444\u0430\u0439\u043B \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u043E\u0433\u043E \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F");
  c.agreement = { number: number.trim(), date: date2 };
  c.schedule = schedule.sort((a, b) => a.date.localeCompare(b.date));
  if (c.stage !== "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435") c.stageEnteredAt = TODAY;
  c.stage = "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435";
  r.stage = c.stage;
  r.promise = null;
  r.task = null;
  audit(r, "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u0438 \u0433\u0440\u0430\u0444\u0438\u043A \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B", number);
}
function markInstallment(r, index, paymentIndexes) {
  const c = currentCase(r), s = c?.schedule[index];
  if (!s || s.paid) throw Error("\u041F\u043B\u0430\u0442\u0451\u0436 \u0443\u0436\u0435 \u043E\u0442\u043C\u0435\u0447\u0435\u043D \u0438\u043B\u0438 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
  const chosen = [...new Set(paymentIndexes)];
  if (!chosen.length || chosen.some((i) => !r.payments[i] || r.payments[i].caseId !== c.id)) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0447\u0442\u0451\u043D\u043D\u044B\u0435 \u043F\u043B\u0430\u0442\u0435\u0436\u0438 \u0438\u043C\u0435\u043D\u043D\u043E \u044D\u0442\u043E\u0433\u043E \u0434\u0435\u043B\u0430");
  if (c.schedule.some((x) => x.paid && x.paymentIds?.some((id) => chosen.some((i) => r.payments[i].id === id)))) throw Error("\u041F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435 \u0443\u0436\u0435 \u0441\u0432\u044F\u0437\u0430\u043D\u043E \u0441 \u0434\u0440\u0443\u0433\u0438\u043C \u043F\u043B\u0430\u0442\u0435\u0436\u043E\u043C \u0433\u0440\u0430\u0444\u0438\u043A\u0430");
  if (chosen.reduce((sum2, i) => sum2 + r.payments[i].amount, 0) !== s.amount) throw Error("\u0421\u0443\u043C\u043C\u0430 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0439 \u0434\u043E\u043B\u0436\u043D\u0430 \u0441\u043E\u0432\u043F\u0430\u0441\u0442\u044C \u0441 \u043F\u043B\u0430\u0442\u0435\u0436\u043E\u043C \u0433\u0440\u0430\u0444\u0438\u043A\u0430");
  for (const i of chosen) r.payments[i].id ||= crypto.randomUUID();
  s.paid = true;
  s.paymentIds = chosen.map((i) => r.payments[i].id);
  audit(r, "\u041F\u043B\u0430\u0442\u0451\u0436 \u0433\u0440\u0430\u0444\u0438\u043A\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D", s.date);
}
function saveOwners(r, list) {
  if (!list.length || list.some((o) => !o.name.trim() || !Number.isFinite(o.share) || o.share <= 0 || o.share > 100) || Math.abs(list.reduce((s, o) => s + o.share, 0) - 100) > 1e-3) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u043E\u0432; \u0441\u0443\u043C\u043C\u0430 \u0434\u043E\u043B\u0435\u0439 \u0434\u043E\u043B\u0436\u043D\u0430 \u0431\u044B\u0442\u044C 100%");
  r.owners = list;
  audit(r, "\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0438 \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u044B", "\u0414\u043E\u043B\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B");
}
function validateMonthly(rows) {
  const seen = /* @__PURE__ */ new Set();
  return rows.map((x) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(x.month) || seen.has(x.month)) throw Error("\u041F\u0435\u0440\u0438\u043E\u0434\u044B: \u0413\u0413\u0413\u0413-\u041C\u041C, \u0431\u0435\u0437 \u0434\u0443\u0431\u043B\u0435\u0439");
    seen.add(x.month);
    const v = { month: x.month, area: Number(x.area), formula: String(x.formula || "").trim(), opening: cents(x.opening), charges: cents(x.charges), payments: cents(x.payments), closing: cents(x.closing) };
    if (!Number.isFinite(v.area) || v.area <= 0 || !v.formula || v.opening + v.charges - v.payments !== v.closing) throw Error(`\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043B\u043E\u0449\u0430\u0434\u044C, \u0444\u043E\u0440\u043C\u0443\u043B\u0443 \u0438 \u0431\u0430\u043B\u0430\u043D\u0441 \u0437\u0430 ${x.month}`);
    return v;
  }).sort((a, b) => a.month.localeCompare(b.month));
}
function saveMonthly(r, input) {
  const rows = validateMonthly(input);
  if (!rows.length || rows.at(-1).closing !== r.principal) throw Error("\u0418\u0442\u043E\u0433 \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0433\u043E \u0434\u043E\u043B\u0433\u0430 \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0442\u044C \u0441 \u0442\u0435\u043A\u0443\u0449\u0438\u043C \u0440\u0435\u0435\u0441\u0442\u0440\u043E\u043C");
  for (let i = 1; i < rows.length; i++) if (rows[i].opening !== rows[i - 1].closing) throw Error("\u041D\u0430\u0447\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u043C \u043C\u0435\u0441\u044F\u0446\u0435\u043C");
  r.charges = rows;
  audit(r, "\u0420\u0430\u0441\u0447\u0451\u0442 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D", `${rows.length} \u043C\u0435\u0441\u044F\u0446\u0435\u0432; \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0434\u043E\u043B\u0433 \u0441\u0432\u0435\u0440\u0451\u043D`);
}
function packetFiles(state2, r) {
  return [...state2.houseDocuments?.[JSON.stringify([r.company, r.building])] || [], ...currentCase(r)?.documents || []];
}

// dist/demo-billing.mjs
var DEMO_COMPANY = "\u0423\u041A \xAB\u0423\u0447\u0435\u0431\u043D\u0430\u044F\xBB";
function installOwnerExample(state2) {
  if (state2.rows.some((r2) => r2.id === "\u0414\u041E\u041B\u0418-001")) return false;
  const r = fixture("\u0414\u041E\u041B\u0418-001", "\u0423\u0447\u0435\u0431\u043D\u0430\u044F, 10", 12, [["2026-09", 1e6, 2e4]], "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430");
  r.owners = [{ id: "share-a", name: "\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A \u0410", share: 50 }, { id: "share-b", name: "\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A \u0411", share: 50 }];
  state2.rows.push(r);
  return true;
}
var file = (id, name, text, kind) => ({ id, name, kind, size: new TextEncoder().encode(text).length, data: `data:text/plain;charset=utf-8,${encodeURIComponent(text)}` });
var contract = (house) => file(`contract-${house}`, `\u0414\u0435\u043C\u043E-\u0434\u043E\u0433\u043E\u0432\u043E\u0440 ${house}.txt`, `\u0423\u0427\u0415\u0411\u041D\u042B\u0419 \u0414\u041E\u041A\u0423\u041C\u0415\u041D\u0422. \u0414\u043E\u0433\u043E\u0432\u043E\u0440 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F: ${DEMO_COMPANY}, ${house}. \u041D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u043E\u043C \u0441 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u043C\u0438 \u043B\u0438\u0446\u0430\u043C\u0438.`, "contract");
function fixture(id, house, flat, months, stage, departed = false) {
  const lines = months.flatMap(([month, value, penalty = 0]) => [
    { id: `${id}-${month}-1`, month, service: "\u0421\u043E\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435", formula: "50 \u043C\xB2 \xD7 40 \u20BD (\u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u0442\u0430\u0440\u0438\u0444)", charged: 2e5, paid: 0, penalty, penaltyPaid: 0 },
    { id: `${id}-${month}-2`, month, service: "\u0412\u043E\u0434\u043E\u0441\u043D\u0430\u0431\u0436\u0435\u043D\u0438\u0435 (\u0443\u0447\u0435\u0431\u043D\u043E\u0435)", formula: `${(value - 2e5) / 1e4} \u043C\xB3 \xD7 100 \u20BD (\u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u0442\u0430\u0440\u0438\u0444)`, charged: value - 2e5, paid: 0, penalty: 0, penaltyPaid: 0 }
  ]);
  const parts = billingParts(lines), r = { id, account: id, company: DEMO_COMPANY, building: house, flat, entrance: "1", ...parts, age: 90, stage: "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", caseId: null, claim: null, source: "\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0431\u0438\u043B\u043B\u0438\u043D\u0433", sourceId: "demo-billing-v1", category: "\u041F\u0435\u0440\u0432\u0438\u0447\u043D\u0430\u044F \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430", owner: "\u042E\u0440\u0438\u0441\u0442", asOf: TODAY, phone: true, email: true, app: true, max: true, disputed: false, unallocated: 0, promise: null, nextDate: TODAY, next: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", period: billingPeriod(lines), events: [], payments: [], houseStatus: departed ? "departed" : "active", contractEnd: departed ? "2026-09-30" : null, billing: { area: 50, lines, source: "\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0431\u0438\u043B\u043B\u0438\u043D\u0433", asOf: TODAY, applied: [] } };
  initializeCases(r, true);
  r.owners = [{ name: `\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A ${flat}`, share: 100 }];
  refreshMonthly(r);
  if (stage !== "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430") {
    createCase(r, r.period, unassigned(r));
    if (stage === "\u041F\u0440\u0438\u043A\u0430\u0437") {
      r.fee = 2e5;
      currentCase(r).remaining.fee = 2e5;
      changeStage(r, "\u041F\u0440\u0438\u043A\u0430\u0437");
      currentCase(r).documents.push(file(`${id}-order`, "\u0414\u0435\u043C\u043E-\u0441\u0443\u0434\u0435\u0431\u043D\u044B\u0439 \u043F\u0440\u0438\u043A\u0430\u0437.txt", "\u0423\u0427\u0415\u0411\u041D\u042B\u0419 \u041F\u0420\u0418\u041A\u0410\u0417. \u0420\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u0438 \u0441\u0443\u043C\u043C\u044B \u043F\u0440\u0435\u0434\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0434\u0435\u043C\u043E\u043D\u0441\u0442\u0440\u0430\u0446\u0438\u0438.", "order"));
      saveLegal(r, { number: `\u0414\u0415\u041C\u041E-${id}`, date: TODAY, status: "\u041F\u043E\u043B\u0443\u0447\u0435\u043D \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442", next: "\u041F\u0440\u0435\u0434\u044A\u044F\u0432\u0438\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0432 \u0424\u0421\u0421\u041F \u0438\u043B\u0438 \u0431\u0430\u043D\u043A", nextDate: TODAY });
    }
  }
  return r;
}
function installDemoBilling(state2) {
  if (state2.demoBillingVersion) return installStageExamples(state2);
  const rows = [fixture("\u0423\u0427-001", "\u0423\u0447\u0435\u0431\u043D\u0430\u044F, 10", 1, [["2026-07", 54e4, 1e4], ["2026-08", 54e4, 1e4], ["2026-09", 54e4, 1e4]], "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430"), fixture("\u0423\u0427-002", "\u0423\u0447\u0435\u0431\u043D\u0430\u044F, 10", 2, [["2026-08", 48e4, 1e4], ["2026-09", 48e4, 1e4]], "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435"), fixture("\u0423\u0427-003", "\u0423\u0447\u0435\u0431\u043D\u0430\u044F, 20", 3, [["2026-09", 339258]], "\u041F\u0440\u0438\u043A\u0430\u0437", true), fixture("\u0423\u0427-004", "\u0423\u0447\u0435\u0431\u043D\u0430\u044F, 20", 4, [["2026-09", 21e4]], "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", true)];
  const old = rows.at(-1), fresh = structuredClone(old);
  fresh.id = fresh.account = "\u0423\u0427-005";
  fresh.principal = 0;
  fresh.age = 0;
  fresh.period = "\u0417\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438 \u043D\u0435\u0442";
  fresh.billing.lines = [];
  fresh.owners = [{ name: "\u041D\u043E\u0432\u044B\u0439 \u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A 4", share: 100 }];
  fresh.ownerHistory = [{ name: old.owners[0].name, account: old.account, reason: "\u0421\u043C\u0435\u043D\u0430 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430. \u0414\u043E\u043B\u0433 \u043E\u0441\u0442\u0430\u043B\u0441\u044F \u043D\u0430 \u043F\u0440\u0435\u0436\u043D\u0435\u043C \u041B\u0421." }];
  refreshMonthly(fresh);
  rows.push(fresh);
  if (rows.some((x) => state2.rows.some((r) => r.id === x.id))) throw Error("\u0423\u0447\u0435\u0431\u043D\u044B\u0435 \u041B\u0421 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0442 \u0431\u0435\u0437 \u0432\u0435\u0440\u0441\u0438\u0438 \u043D\u0430\u0431\u043E\u0440\u0430");
  state2.rows.push(...rows);
  state2.houseDocuments ||= {};
  for (const house of ["\u0423\u0447\u0435\u0431\u043D\u0430\u044F, 10", "\u0423\u0447\u0435\u0431\u043D\u0430\u044F, 20"]) {
    const key = JSON.stringify([DEMO_COMPANY, house]);
    state2.houseDocuments[key] ||= [{ ...contract(house), house: true }];
  }
  state2.demoBillingVersion = 1;
  rows.forEach(validateBilling);
  installStageExamples(state2);
  return true;
}
function installStageExamples(state2) {
  if (state2.demoBillingVersion >= 2) return false;
  const agreement = fixture("\u0423\u0427-006", "\u0423\u0447\u0435\u0431\u043D\u0430\u044F, 10", 6, [["2026-09", 5e5, 1e4]], "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435");
  demoEvent(state2, agreement, "agreement");
  currentCase(agreement).agreement.date = "2026-10-20";
  for (const event of agreement.events) event.at = "2026-10-20T12:00:00";
  const claim = fixture("\u0423\u0427-007", "\u0423\u0447\u0435\u0431\u043D\u0430\u044F, 10", 7, [["2026-08", 6e5, 2e4]], "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435");
  changeStage(claim, "\u0418\u0441\u043A");
  saveLegal(claim, { number: "\u0414\u0415\u041C\u041E-\u0418\u0421\u041A-007", date: "2026-10-20", status: "\u0418\u0441\u043A \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D", next: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F", nextDate: "2026-10-30" });
  const execution = fixture("\u0423\u0427-008", "\u0423\u0447\u0435\u0431\u043D\u0430\u044F, 10", 8, [["2026-09", 7e5, 15e3]], "\u041F\u0440\u0438\u043A\u0430\u0437");
  demoEvent(state2, execution, "execution");
  const closed = fixture("\u0423\u0427-009", "\u0423\u0447\u0435\u0431\u043D\u0430\u044F, 10", 9, [["2026-09", 3e5, 5e3]], "\u041F\u0440\u0438\u043A\u0430\u0437");
  demoEvent(state2, closed, "fullPayment");
  changeStage(closed, "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E", "\u041F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u043F\u043E\u0433\u0430\u0448\u0435\u043D\u043E \u043F\u043E \u0443\u0447\u0435\u0431\u043D\u043E\u0439 \u0432\u044B\u043F\u0438\u0441\u043A\u0435");
  const extra = [agreement, claim, execution, closed];
  if (extra.some((x) => state2.rows.some((r) => r.id === x.id))) throw Error("\u0423\u0447\u0435\u0431\u043D\u044B\u0435 \u041B\u0421 \u043D\u043E\u0432\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0438 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0442");
  for (const r of extra) {
    currentCase(r).createdAt = "2026-10-10";
    currentCase(r).stageEnteredAt = ["\u0423\u0427-008", "\u0423\u0427-009"].includes(r.id) ? TODAY : "2026-10-20";
    validateBilling(r);
  }
  state2.rows.push(...extra);
  state2.demoBillingVersion = 2;
  return true;
}
function demoEvent(state2, r, kind) {
  const before = structuredClone(r);
  try {
    return applyDemoEvent(state2, r, kind);
  } catch (error) {
    for (const key of Object.keys(r)) if (!(key in before)) delete r[key];
    Object.assign(r, before);
    throw error;
  }
}
function applyDemoEvent(state2, r, kind) {
  if (!r.billing || r.company !== DEMO_COMPANY) throw Error("\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0443\u0447\u0435\u0431\u043D\u044B\u043C \u041B\u0421");
  const c = currentCase(r);
  const id = `${kind}:${c?.id || "free"}`;
  if (r.billing.applied.includes(id)) throw Error("\u042D\u0442\u043E \u0443\u0447\u0435\u0431\u043D\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u0443\u0436\u0435 \u0443\u0447\u0442\u0435\u043D\u043E");
  if (kind === "newMonth") {
    if (r.houseStatus === "departed") throw Error("\u041F\u043E\u0441\u043B\u0435 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0430 \u043D\u043E\u0432\u044B\u0435 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u044E\u0442\u0441\u044F");
    if (r.billing.lines.some((x) => x.month === "2026-10")) throw Error("\u041E\u043A\u0442\u044F\u0431\u0440\u044C \u0443\u0436\u0435 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D");
    r.billing.lines.push({ id: `${r.id}-2026-10`, month: "2026-10", service: "\u0421\u043E\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435", formula: "50 \u043C\xB2 \xD7 40 \u20BD (\u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u0442\u0430\u0440\u0438\u0444)", charged: 2e5, paid: 0, penalty: 0, penaltyPaid: 0 });
    r.principal += 2e5;
    r.period = billingPeriod(r.billing.lines);
    r.age = Math.max(r.age, 1);
    r.noticeEpoch++;
    refreshMonthly(r);
    if (c?.stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E") selectCase(r, null);
    audit(r, "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u044B \u043D\u043E\u0432\u044B\u0435 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F", "\u041E\u043A\u0442\u044F\u0431\u0440\u044C: 2 000 \u20BD. \u0421\u0442\u0430\u0440\u043E\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435 \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u043E.");
  } else if (kind === "agreement") {
    if (!c || !["\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435"].includes(c.stage) || amount(c.remaining) <= 0) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043D\u0435\u043F\u043E\u0433\u0430\u0448\u0435\u043D\u043D\u043E\u0435 \u0434\u043E\u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0435 \u0434\u0435\u043B\u043E");
    const sum2 = amount(c.remaining);
    c.documents.push(file(`${c.id}-signed`, "\u0423\u0447\u0435\u0431\u043D\u043E\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u043E\u0435 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435.txt", "\u0423\u0427\u0415\u0411\u041D\u042B\u0419 \u041F\u0420\u0418\u041C\u0415\u0420: \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u0438 \u0434\u0432\u0435 \u0447\u0430\u0441\u0442\u0438 \u043F\u043B\u0430\u0442\u0435\u0436\u0430. \u041D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u044C\u044E.", "agreement"));
    const half = Math.floor(sum2 / 2);
    saveAgreement(r, `\u0414\u0415\u041C\u041E-${r.account}`, TODAY, [{ date: "2026-10-29", amount: half }, { date: "2026-11-15", amount: sum2 - half }]);
  } else if (kind === "execution") {
    if (!c || c.stage !== "\u041F\u0440\u0438\u043A\u0430\u0437") throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0435\u043B\u043E \u0441 \u0441\u0443\u0434\u0435\u0431\u043D\u044B\u043C \u043F\u0440\u0438\u043A\u0430\u0437\u043E\u043C");
    c.documents.push(file(`${c.id}-exec`, "\u0423\u0447\u0435\u0431\u043D\u043E\u0435 \u043F\u0440\u0435\u0434\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u0432 \u0431\u0430\u043D\u043A.txt", "\u0423\u0427\u0415\u0411\u041D\u042B\u0419 \u0414\u041E\u041A\u0423\u041C\u0415\u041D\u0422. \u041F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u0432 \u0431\u0430\u043D\u043A \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u043C\u0438\u0442\u0438\u0440\u0443\u0435\u0442\u0441\u044F.", "enforcement"));
    changeStage(r, "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B");
    saveLegal(r, { number: `\u0411\u0410\u041D\u041A-${r.account}`, date: TODAY, status: "\u041F\u0435\u0440\u0435\u0434\u0430\u043D\u043E \u0432 \u0431\u0430\u043D\u043A (\u0434\u0435\u043C\u043E)", next: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u0438\u0437 \u0431\u0430\u043D\u043A\u0430", nextDate: "2026-11-05" });
  } else if (kind === "fullPayment" || kind === "halfPayment") {
    const balance = c?.remaining || unassigned(r);
    if (amount(balance) <= 0) throw Error("\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0434\u043E\u043B\u0433 \u0443\u0436\u0435 \u043F\u043E\u0433\u0430\u0448\u0435\u043D");
    const parts = kind === "fullPayment" ? { ...balance } : { principal: Math.floor(balance.principal / 2), penalty: Math.floor(balance.penalty / 2), fee: balance.fee };
    allocate(r, amount(parts), parts, c?.id || null);
    r.payments[0].source = "\u0423\u0447\u0435\u0431\u043D\u0430\u044F \u0432\u044B\u043F\u0438\u0441\u043A\u0430";
    r.payments[0].externalId = id;
    const installment = c?.schedule?.findIndex((s) => !s.paid && s.amount === amount(parts));
    if (installment >= 0) markInstallment(r, installment, [0]);
  } else throw Error("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u0443\u0447\u0435\u0431\u043D\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435");
  r.billing.applied.push(id);
  validateBilling(r);
  return total(r);
}

// dist/docx.mjs
var TEMPLATE_FIELDS = ["title", "body", "company", "address", "account", "people", "caseId", "period", "amount", "remaining", "principal", "penalty", "fee", "date", "calculation"];
var xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
var paragraph = (text) => `<w:p><w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
var WARNING = "\u0423\u0427\u0415\u0411\u041D\u042B\u0419 \u0414\u041E\u041A\u0423\u041C\u0415\u041D\u0422. \u0421\u0418\u041D\u0422\u0415\u0422\u0418\u0427\u0415\u0421\u041A\u0418\u0415 \u0414\u0410\u041D\u041D\u042B\u0415. \u041D\u0415 \u0414\u041B\u042F \u041E\u0422\u041F\u0420\u0410\u0412\u041A\u0418 \u0418 \u041F\u041E\u0414\u0410\u0427\u0418.";
function baseTemplate(Zip) {
  const zip = new Zip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph("{title}")}${paragraph("{body}")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:bottom="1134" w:left="1134" w:right="1134"/></w:sectPr></w:body></w:document>`);
  return zip;
}
function validateTemplate(zip) {
  if (!zip.file("word/document.xml")) throw Error("\u041D\u0443\u0436\u0435\u043D DOCX, \u043D\u0435 DOC \u0438\u043B\u0438 PDF");
  let size = 0;
  for (const [name, f] of Object.entries(zip.files)) {
    size += f._data?.uncompressedSize || 0;
    if (size > 4 * 1024 * 1024) throw Error("\u0420\u0430\u0441\u043F\u0430\u043A\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0448\u0430\u0431\u043B\u043E\u043D \u0431\u043E\u043B\u044C\u0448\u0435 4 \u041C\u0411");
    if (/vbaProject|embeddings|activeX/i.test(name)) throw Error("\u041C\u0430\u043A\u0440\u043E\u0441\u044B \u0438 \u0432\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0435 \u043E\u0431\u044A\u0435\u043A\u0442\u044B \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D\u044B");
    if (name.endsWith(".rels") && /TargetMode\s*=\s*["']External/i.test(f.asText())) throw Error("\u0412\u043D\u0435\u0448\u043D\u0438\u0435 \u0441\u0441\u044B\u043B\u043A\u0438 \u0432 \u0448\u0430\u0431\u043B\u043E\u043D\u0435 \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D\u044B");
  }
}
function renderDocx(draft, { Zip, Templater }, custom) {
  const zip = custom ? new Zip(custom, { base64: typeof custom === "string" }) : baseTemplate(Zip);
  validateTemplate(zip);
  const path = "word/document.xml", source = zip.file(path).asText();
  zip.file(path, source.replace(/(<w:body[^>]*>)/, `$1${paragraph(WARNING)}`));
  const data = { ...draft.data, title: draft.title, body: draft.text };
  for (const k of ["amount", "remaining", "principal", "penalty", "fee"]) data[k] = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format((data[k] || 0) / 100);
  const doc = new Templater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: (part) => {
    throw Error(`\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u043F\u043E\u043B\u0435 \u0448\u0430\u0431\u043B\u043E\u043D\u0430: ${part.value}`);
  } });
  doc.render(Object.fromEntries(TEMPLATE_FIELDS.map((k) => [k, data[k] ?? ""])));
  return doc.getZip().generate({ type: "uint8array", compression: "DEFLATE" });
}
function templateBytes(Zip) {
  return baseTemplate(Zip).generate({ type: "uint8array", compression: "DEFLATE" });
}

// dist/lawyer-journey.mjs
var LEGAL_RESULTS = {
  "\u041F\u0440\u0438\u043A\u0430\u0437": { "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430": "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F", "\u041F\u043E\u0434\u0430\u043D\u043E": "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0442\u0432\u0435\u0442 \u0441\u0443\u0434\u0430", "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0435\u043D\u043E": "\u0418\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043F\u0430\u043A\u0435\u0442 \u0438 \u043F\u043E\u0434\u0430\u0442\u044C \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E", "\u041F\u043E\u043B\u0443\u0447\u0435\u043D \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442": "\u041F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u044C \u0441\u0443\u0434\u0435\u0431\u043D\u044B\u0439 \u043F\u0440\u0438\u043A\u0430\u0437", "\u041E\u0442\u043C\u0435\u043D\u0451\u043D \u043F\u0440\u0438\u043A\u0430\u0437": "\u0420\u0435\u0448\u0438\u0442\u044C \u0432\u043E\u043F\u0440\u043E\u0441 \u043E \u043F\u043E\u0434\u0430\u0447\u0435 \u0438\u0441\u043A\u0430", "\u041E\u0442\u043A\u0430\u0437\u0430\u043D\u043E": "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u044E\u0440\u0438\u0441\u0442\u0430" },
  "\u0418\u0441\u043A": { "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430": "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0438\u0441\u043A \u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F", "\u041F\u043E\u0434\u0430\u043D\u043E": "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0442\u0432\u0435\u0442 \u0441\u0443\u0434\u0430", "\u041F\u0440\u0438\u043D\u044F\u0442 \u043A \u0440\u0430\u0441\u0441\u043C\u043E\u0442\u0440\u0435\u043D\u0438\u044E": "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0434\u0430\u0442\u0443 \u0437\u0430\u0441\u0435\u0434\u0430\u043D\u0438\u044F / \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442", "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043E \u0437\u0430\u0441\u0435\u0434\u0430\u043D\u0438\u0435": "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0437\u0430\u0441\u0435\u0434\u0430\u043D\u0438\u044F", "\u041E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E \u0431\u0435\u0437 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u044F": "\u0423\u0441\u0442\u0440\u0430\u043D\u0438\u0442\u044C \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0441\u0443\u0434\u0430", "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0435\u043D\u043E": "\u0418\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043F\u0430\u043A\u0435\u0442 \u0438 \u043F\u043E\u0434\u0430\u0442\u044C \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E", "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u0435": "\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442", "\u041E\u0442\u043A\u0430\u0437\u0430\u043D\u043E": "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u044E\u0440\u0438\u0441\u0442\u0430" },
  "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B": { "\u041F\u0435\u0440\u0435\u0434\u0430\u043D\u043E \u043D\u0430 \u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435": "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0440\u0438\u043D\u044F\u0442\u0438\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430", "\u0418\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435": "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u043F\u043E \u0434\u0435\u043B\u0443", "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0451\u043D \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442": "\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u043F\u0440\u0438\u0447\u0438\u043D\u0443 \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E \u043F\u0440\u0435\u0434\u044A\u044F\u0432\u0438\u0442\u044C", "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442": "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442 \u0431\u0430\u043D\u043A\u0430 / \u0424\u0421\u0421\u041F" },
  "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C": { "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430": "\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0432\u0438\u0434 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u0430 \u043F\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u043C" }
};
var PACKAGE_KINDS = { "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435": ["agreement", "schedule"], "\u041F\u0440\u0438\u043A\u0430\u0437": ["orderApplication", "calculation", "courtInventory"], "\u0418\u0441\u043A": ["claim", "calculation", "courtInventory"], "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E": ["closure", "paymentStatement"] };
function prepareCasePackage(r) {
  const c = currentCase(r), kinds = PACKAGE_KINDS[c?.stage];
  if (!kinds) throw Error("\u041D\u0430 \u044D\u0442\u043E\u043C \u044D\u0442\u0430\u043F\u0435 \u043D\u0435\u0442 \u043F\u0430\u043A\u0435\u0442\u0430 \u0434\u043B\u044F \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0438");
  if (c.stage === "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435" && !c.agreement && !c.agreementProposal) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0433\u043B\u0430\u0441\u0443\u0439\u0442\u0435 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u0438 \u0433\u0440\u0430\u0444\u0438\u043A");
  const copy = structuredClone(r), docs = kinds.map((k) => ensureDocument(copy, k));
  if (docs.some((d) => d.missing.length)) throw Error("\u041D\u0443\u0436\u043D\u043E \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u044C: " + [...new Set(docs.flatMap((d) => d.missing))].join("; "));
  audit(copy, "\u041F\u0430\u043A\u0435\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D", docs.map((d) => d.title).join("; "));
  Object.assign(r, copy);
  return docs;
}
function packageReady(r) {
  const c = currentCase(r), kinds = PACKAGE_KINDS[c?.stage] || [];
  const docs = stageDocumentEntries(r);
  return kinds.length > 0 && kinds.every((k) => docs.some((d) => d.kind === k && d.id && !d.missing.length));
}
function demoReceivedDocument(r, kind, label) {
  const c = currentCase(r);
  if (!c) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0435\u043B\u043E");
  if (c.documents.some((d) => !d.archived && d.kind === kind && d.synthetic)) return;
  const text = `\u0423\u0427\u0415\u0411\u041D\u042B\u0419 \u041F\u0420\u0418\u041C\u0415\u0420. \u041D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u043C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u043C \u0438\u043B\u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u044C\u044E.
${label}
\u0414\u0435\u043B\u043E ${c.id}. \u041B\u0421 ${r.account}. \u0414\u0430\u0442\u0430 ${TODAY}.`;
  c.documents.push({ id: crypto.randomUUID(), kind, name: `\u0414\u0435\u043C\u043E - ${label}.txt`, synthetic: true, size: new TextEncoder().encode(text).length, data: "data:text/plain;charset=utf-8," + encodeURIComponent(text) });
}
function signDemoAgreement(r) {
  const copy = structuredClone(r), c = currentCase(copy), terms = c?.agreementProposal;
  if (!terms || c.agreement) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u044C\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F");
  if (!packageReady(copy)) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u0443\u0439\u0442\u0435 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u0438 \u0433\u0440\u0430\u0444\u0438\u043A");
  if (reviewReasons(copy).length) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0434\u043E\u043B\u0433\u0430");
  demoReceivedDocument(copy, "agreement", "\u041F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u043E\u0435 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435");
  saveAgreement(copy, terms.number, terms.date, c.schedule);
  Object.assign(r, copy);
}
function recordLegalResult(r, input, { simulateDocument = false } = {}) {
  const c = currentCase(r), statuses = LEGAL_RESULTS[c?.stage];
  if (!statuses || !Object.hasOwn(statuses, input.status)) throw Error("\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043D\u0435 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u044D\u0442\u043E\u043C\u0443 \u044D\u0442\u0430\u043F\u0443");
  if (input.status === "\u041F\u043E\u0434\u0430\u043D\u043E" && (!packageReady(r) || c.packageRevisionNeeded)) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u0443\u0439\u0442\u0435 \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0430\u043A\u0435\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432");
  if (!input.note?.trim()) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438\u043B\u0438 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F");
  if (reviewReasons(r).length) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0434\u043E\u043B\u0433\u0430");
  const copy = structuredClone(r), cc = currentCase(copy);
  cc.legalHistory ||= [];
  if (cc.legal?.status) cc.legalHistory.push({ ...cc.legal, ended: TODAY });
  saveLegal(copy, { ...input, next: statuses[input.status] });
  if (simulateDocument) {
    const kind = cc.stage === "\u041F\u0440\u0438\u043A\u0430\u0437" && input.status === "\u041F\u043E\u043B\u0443\u0447\u0435\u043D \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442" ? "order" : cc.stage === "\u0418\u0441\u043A" && input.status === "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u0435" ? "decision" : null;
    if (!kind) throw Error("\u0414\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 \u043D\u0435 \u043F\u0440\u0435\u0434\u0443\u0441\u043C\u043E\u0442\u0440\u0435\u043D \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442");
    demoReceivedDocument(copy, kind, kind === "order" ? "\u0421\u0443\u0434\u0435\u0431\u043D\u044B\u0439 \u043F\u0440\u0438\u043A\u0430\u0437" : "\u0420\u0435\u0448\u0435\u043D\u0438\u0435 \u0441\u0443\u0434\u0430");
  }
  if (["\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0435\u043D\u043E", "\u041E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E \u0431\u0435\u0437 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u044F"].includes(input.status)) cc.packageRevisionNeeded = true;
  audit(copy, "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u044E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u044B", input.note.trim());
  Object.assign(r, copy);
}
function reworkCasePackage(r, note) {
  if (!note?.trim()) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435, \u043A\u0430\u043A\u0438\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0443\u0441\u0442\u0440\u0430\u043D\u0435\u043D\u044B");
  const copy = structuredClone(r), c = currentCase(copy);
  if (!c?.packageRevisionNeeded) throw Error("\u041D\u0435\u0442 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u0439 \u043A \u043F\u0430\u043A\u0435\u0442\u0443");
  prepareCasePackage(copy);
  const updated = currentCase(copy);
  updated.packageRevisionNeeded = false;
  updated.legalHistory ||= [];
  updated.legalHistory.push({ ...updated.legal, ended: TODAY });
  updated.legal = { ...updated.legal, status: "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430", note: note.trim() };
  audit(copy, "\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u043A \u043F\u0430\u043A\u0435\u0442\u0443 \u0443\u0441\u0442\u0440\u0430\u043D\u0435\u043D\u044B", note.trim());
  Object.assign(r, copy);
}
var CONTACT_RESULTS = { waiting: "\u041E\u0442\u0432\u0435\u0442\u0430 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442", promise: "\u041E\u0431\u0435\u0449\u0430\u0435\u0442 \u043E\u043F\u043B\u0430\u0442\u0438\u0442\u044C", agreement: "\u041E\u0431\u0441\u0443\u0436\u0434\u0430\u0435\u043C \u0440\u0430\u0441\u0441\u0440\u043E\u0447\u043A\u0443", order: "\u041D\u0435 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u043B\u0438\u0441\u044C: \u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0430 \u043F\u0440\u0438\u043A\u0430\u0437", claim: "\u041D\u0435 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u043B\u0438\u0441\u044C: \u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0438\u0441\u043A", dispute: "\u041E\u0441\u043F\u0430\u0440\u0438\u0432\u0430\u0435\u0442 \u0441\u0443\u043C\u043C\u0443 \u0434\u043E\u043B\u0433\u0430" };
function recordContactResult(r, result, note, due) {
  const c = currentCase(r);
  if (!c || !["\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435"].includes(c.stage) || !CONTACT_RESULTS[result]) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0434\u043E\u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0439 \u0440\u0430\u0431\u043E\u0442\u044B");
  if (!note?.trim() || !dateValid(due) || due < TODAY) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430 \u0438 \u0434\u0430\u0442\u0443 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044F");
  if (["order", "claim", "agreement"].includes(result)) {
    const stage = { order: "\u041F\u0440\u0438\u043A\u0430\u0437", claim: "\u0418\u0441\u043A", agreement: "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435" }[result];
    if (stage !== c.stage) transitionCase(r, stage, note);
  }
  c.contactResult = { result, label: CONTACT_RESULTS[result], note: note.trim(), at: TODAY, due };
  c.communicationNextDate = due;
  if (result === "dispute") r.disputed = true;
  audit(r, CONTACT_RESULTS[result], note.trim());
}
function transitionOptions(c) {
  if (!c || c.stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E") return [];
  if (c.balanceConfirmed && amount(c.remaining) === 0) return ["\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"];
  return { "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435": ["\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435", "\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A"], "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435": ["\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A"], "\u041F\u0440\u0438\u043A\u0430\u0437": ["\u0418\u0441\u043A"], "\u0418\u0441\u043A": [], "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B": [], "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C": ["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A"] }[c.stage] || [];
}
function transitionCase(r, stage, reason) {
  const c = currentCase(r);
  if (!transitionOptions(c).includes(stage)) throw Error("\u042D\u0442\u043E\u0442 \u043F\u0435\u0440\u0435\u0445\u043E\u0434 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0434\u043B\u044F \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430");
  if (!reason?.trim()) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0430");
  changeStage(r, stage, reason);
  c.legalHistory ||= [];
  if (c.legal?.status) c.legalHistory.push({ ...c.legal, ended: TODAY });
  c.legal = {};
  c.packageRevisionNeeded = false;
  audit(r, "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u044D\u0442\u0430\u043F\u0430", reason.trim());
}
function saveAgreementProposal(r, number, date2, schedule) {
  const c = currentCase(r);
  if (!c || !["\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435"].includes(c.stage)) throw Error("\u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043D\u0430 \u0434\u043E\u0441\u0443\u0434\u0435\u0431\u043D\u043E\u043C \u044D\u0442\u0430\u043F\u0435");
  if (c.agreement || c.schedule.some((x) => x.paid)) throw Error("\u041F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0439 \u0433\u0440\u0430\u0444\u0438\u043A \u043D\u0435\u043B\u044C\u0437\u044F \u0437\u0430\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435\u043C");
  if (!number.trim() || !dateValid(date2) || date2 > TODAY) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u043E\u043C\u0435\u0440 \u0438 \u0434\u0430\u0442\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430");
  if (!schedule.length || schedule.some((x) => !dateValid(x.date) || x.date < date2 || !Number.isSafeInteger(x.amount) || x.amount <= 0)) throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u0430\u0442\u044B \u0438 \u0441\u0443\u043C\u043C\u044B \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439");
  if (new Set(schedule.map((x) => x.date)).size !== schedule.length) throw Error("\u041E\u0431\u044A\u0435\u0434\u0438\u043D\u0438\u0442\u0435 \u043F\u043B\u0430\u0442\u0435\u0436\u0438 \u043D\u0430 \u043E\u0434\u043D\u0443 \u0434\u0430\u0442\u0443");
  if (schedule.reduce((s, x) => s + x.amount, 0) !== amount(c.remaining)) throw Error("\u0413\u0440\u0430\u0444\u0438\u043A \u0434\u043E\u043B\u0436\u0435\u043D \u043F\u043E\u043A\u0440\u044B\u0432\u0430\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430");
  c.agreementProposal = { number: number.trim(), date: date2 };
  c.schedule = schedule.map((x) => ({ ...x })).sort((a, b) => a.date.localeCompare(b.date));
  if (c.stage !== "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435") changeStage(r, "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435");
  audit(r, "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0440\u0430\u0441\u0441\u0440\u043E\u0447\u043A\u0438", "\u0413\u0440\u0430\u0444\u0438\u043A \u043D\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D; \u043E\u043F\u043B\u0430\u0442\u044B \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B");
}
function caseNotices(r, c) {
  return (r.events || []).filter((e) => e.caseId === c.id && ["app", "email", "max", "receipt", "robot", "notice"].includes(e.action)).sort((a, b) => b.at.localeCompare(a.at));
}

// dist/workbench.mjs
var $ = (s) => document.querySelector(s);
var labels = { principal: "\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0434\u043E\u043B\u0433", penalty: "\u041F\u0435\u043D\u0438", fee: "\u0413\u043E\u0441\u043F\u043E\u0448\u043B\u0438\u043D\u0430" };
var choose = (arr, value) => arr.map((x) => `<option value="${esc(x)}" ${value === x ? "selected" : ""}>${esc(x)}</option>`).join("");
function demoControls(r, role2) {
  if (!r.billing) return "";
  const c = currentCase(r);
  return `<section class="case-section"><h3>\u0423\u0447\u0435\u0431\u043D\u044B\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u044F</h3><div class="action-row">${role2 === "accountant" ? `<button class="button secondary small" data-work="demo:halfPayment" data-id="${r.id}">\u041F\u043E\u0441\u0442\u0443\u043F\u0438\u043B\u0430 \u0447\u0430\u0441\u0442\u044C \u043E\u043F\u043B\u0430\u0442\u044B</button><button class="button secondary small" data-work="demo:fullPayment" data-id="${r.id}">\u041F\u043E\u0441\u0442\u0443\u043F\u0438\u043B\u0430 \u043F\u043E\u043B\u043D\u0430\u044F \u043E\u043F\u043B\u0430\u0442\u0430</button>${r.houseStatus !== "departed" ? `<button class="button secondary small" data-work="demo:newMonth" data-id="${r.id}">\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u0437\u0430 \u043E\u043A\u0442\u044F\u0431\u0440\u044C</button>` : ""}` : `${c && ["\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435"].includes(c.stage) ? `<button class="button secondary small" data-work="demo:agreement" data-id="${r.id}">\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u043E\u0435 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435</button>` : ""}${c?.stage === "\u041F\u0440\u0438\u043A\u0430\u0437" ? `<button class="button secondary small" data-work="demo:execution" data-id="${r.id}">\u041F\u0440\u0435\u0434\u044A\u044F\u0432\u0438\u0442\u044C \u043F\u0440\u0438\u043A\u0430\u0437 \u0432 \u0431\u0430\u043D\u043A</button>` : ""}`}<small>\u0422\u043E\u043B\u044C\u043A\u043E \u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0443\u0440. \u0412\u043D\u0435\u0448\u043D\u0438\u0445 \u043E\u0442\u043F\u0440\u0430\u0432\u043E\u043A \u043D\u0435\u0442.</small></div></section>`;
}
function billingTable(r) {
  const c = currentCase(r), lines = c ? billingLines(r, c.id) : billingLines(r);
  return `<h3>${c ? "\u0420\u0430\u0441\u0447\u0451\u0442 \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C\u0443 \u0434\u0435\u043B\u0443" : "\u0420\u0430\u0441\u0447\u0451\u0442 \u0434\u043E\u043B\u0433\u0430 \u0432\u043D\u0435 \u0434\u0435\u043B"}</h3><p>\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A: \u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u0431\u0438\u043B\u043B\u0438\u043D\u0433 \xB7 ${esc(r.billing.asOf)} \xB7 \u043F\u043B\u043E\u0449\u0430\u0434\u044C ${r.billing.area} \u043C\xB2</p><div class="table-frame"><table class="billing-table"><thead><tr><th>\u041C\u0435\u0441\u044F\u0446 / \u0443\u0441\u043B\u0443\u0433\u0430</th><th>\u0420\u0430\u0441\u0447\u0451\u0442</th><th>\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u043E</th><th>\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E</th><th>\u0414\u043E\u043B\u0433</th><th>\u041F\u0435\u043D\u0438</th></tr></thead><tbody>${lines.map((x) => `<tr><td data-label="\u041C\u0435\u0441\u044F\u0446 / \u0443\u0441\u043B\u0443\u0433\u0430">${esc(x.month)}<small>${esc(x.service)}</small></td><td data-label="\u0420\u0430\u0441\u0447\u0451\u0442">${esc(x.formula)}</td><td data-label="\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u043E">${money(x.charged)}</td><td data-label="\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E">${money(x.paid)}</td><td data-label="\u0414\u043E\u043B\u0433">${money(principalDue(x))}</td><td data-label="\u041F\u0435\u043D\u0438">${money(penaltyDue(x))}</td></tr>`).join("")}</tbody></table></div><p>\u041F\u0440\u0435\u0434\u043B\u0430\u0433\u0430\u0435\u043C\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434 \u043D\u043E\u0432\u043E\u0433\u043E \u0434\u0435\u043B\u0430: ${esc(billingPeriod(billingLines(r)) || "\u041D\u0435\u0442 \u0434\u043E\u043B\u0433\u0430 \u0432\u043D\u0435 \u0434\u0435\u043B")}.</p>`;
}
function queueOverview(rows) {
  return `<section class="work-overview"><div class="section-head"><h2>\u0421 \u043A\u0435\u043C \u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0441\u0435\u0439\u0447\u0430\u0441</h2></div><div class="work-queues">${Object.entries(QUEUES).map(([key, label]) => `<button data-queue="${key}" class="work-queue ${key === "overdue" ? "urgent" : ""}"><span>${label}</span><strong>${workRows(rows, { queue: key }).length}</strong>${icon("arrow-up-right")}</button>`).join("")}</div></section>`;
}
function nextAction(r, role2) {
  const rec = roleRecommendation({ ...r, _caseView: true }, role2), c = currentCase(r);
  if (role2 === "lawyer" && c && (rec.key === "agreement" || rec.key === "follow" && ["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B"].includes(c.stage))) return "";
  let action = rec.action, label = rec.label;
  if (role2 === "lawyer") {
    if (rec.key === "agreement") action = "agreement";
    if (["agreementDue", "overdueAgreement"].includes(rec.key)) action = "installment";
    if (rec.key === "close") {
      action = "closeCase";
      label = "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0434\u0435\u043B\u043E";
    }
    if (rec.key === "done") {
      action = "documents";
      label = "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0434\u0435\u043B\u0430";
    }
    if (["promise", "follow"].includes(rec.key) && !["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B", "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C"].includes(r.stage)) {
      action = "follow";
      label = "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u043E\u043F\u043B\u0430\u0442\u044B";
    }
  }
  if (action === "robot") {
    action = "channels";
    label = "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435";
  }
  const check = ["reconcile", "stale", "dispute", "caseBalance", "waiting"].includes(rec.key);
  return `<section class="next-action"><small>${check ? "\u041D\u0443\u0436\u043D\u043E \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435" : "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435"} \xB7 ${esc(r.reviewTask?.status === "open" ? "\u0411\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0438\u044F" : r.owner)}</small><h3>${esc(rec.label)}</h3><p>${esc(rec.detail)}</p><button class="button" data-work="${action}" data-index="${c?.schedule.findIndex((x) => !x.paid) ?? -1}" data-id="${r.id}">${icon("arrow-right")}${esc(label)}</button></section>`;
}
function casesPanel(r) {
  return `<section class="case-section"><div class="section-head"><h3>\u0414\u0435\u043B\u0430 \u0438 \u043F\u0435\u0440\u0438\u043E\u0434\u044B</h3></div>
  ${r.cases.length ? `<label>\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u0434\u0435\u043B\u043E<select data-case-select="${r.id}"><option value="" ${!r.caseId ? "selected" : ""}>\u0414\u043E\u043B\u0433 \u0432\u043D\u0435 \u0434\u0435\u043B</option>${r.cases.map((c) => `<option value="${esc(c.id)}" ${r.caseId === c.id ? "selected" : ""}>${esc(c.id)} \xB7 ${esc(ownerLabel(c))} \xB7 ${esc(c.period)} \xB7 ${esc(c.stage)}</option>`).join("")}</select></label>` : "<p>\u0412\u0437\u044B\u0441\u043A\u0430\u043D\u0438\u0435 \u0435\u0449\u0451 \u043D\u0435 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u043E.</p>"}
  <div class="case-summary">${r.cases.map((c) => `<div><strong>${esc(c.id)} \xB7 ${esc(c.stage)}</strong><small>${esc(c.period)}</small><span>\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0434\u0435\u043B\u0430: ${money(amount(c.remaining))}${!c.balanceConfirmed ? " \xB7 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0441\u0432\u0435\u0440\u043A\u0438" : ""}</span>${c.claim ? `<small>\u041F\u0435\u0440\u0432\u043E\u043D\u0430\u0447\u0430\u043B\u044C\u043D\u043E\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435: ${money(c.claim.amount)}</small>` : ""}${c.closedReason ? `<small>\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E: ${esc(c.closedReason)}</small>` : ""}</div>`).join("")}</div>
  <p>\u0412\u043D\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0445 \u0434\u0435\u043B: <strong>${r.caseBalanceConflict ? "\u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0441\u0432\u0435\u0440\u043A\u0438" : money(amount(unassigned(r)))}</strong></p>${r.caseBalanceConflict ? '<div class="notice">\u041E\u0441\u0442\u0430\u0442\u043A\u0438 \u0434\u0435\u043B \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B. \u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B \u0434\u043E \u0441\u0432\u0435\u0440\u043A\u0438.</div>' : ""}</section>`;
}
function legalPanel(r) {
  const c = currentCase(r);
  if (!c) return "";
  const p = roleCaseProgress(c, r, "lawyer");
  const clock = `<p class="stage-age">${esc(stageAge(c))}${c.createdAt ? " \xB7 \u0414\u0435\u043B\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u043E " + esc(c.createdAt) : ""}</p>`;
  const extras = [];
  if (p.work !== "closeCase" && !p.dataIssue && ["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B"].includes(c.stage)) {
    if (p.work !== "uploadCase") extras.push(["uploadCase", "\u041F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u044C \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442"]);
    if (p.work !== "legal") extras.push(["legal", "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0441\u0443\u0434\u0430 / \u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F"]);
    if (transitionOptions(c).length && p.work !== "transition") extras.push(["transition", "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0443\u0442\u044C \u043F\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0443"]);
  }
  const secondary = extras.length ? `<details><summary>\u0414\u0440\u0443\u0433\u0438\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u043F\u043E \u0434\u0435\u043B\u0443</summary><div class="action-row">${extras.map(([work, label]) => `<button class="button secondary small" data-work="${work}" data-id="${r.id}">${label}</button>`).join("")}</div></details>` : "";
  return `<section class="case-section stage-work"><h3>${esc(p.label)}</h3>${c.contactResult && ["\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435"].includes(c.stage) ? `<p>${esc(c.contactResult.note)}</p>` : ""}${c.stage !== "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" && c.legal?.note ? `<p>${esc(c.legal.note)}</p>` : ""}${p.dataIssue ? `<p class="notice">${esc(p.dataIssue)}</p>` : ""}${c.legal?.number ? `<p>${esc(c.legal.number)} \xB7 ${esc(c.legal.date)}</p>` : ""}<div class="action-row"><button class="button" data-work="${p.work}" data-index="${c.schedule.findIndex((x) => !x.paid)}" data-id="${r.id}">${esc(p.next)}</button>${c.stage === "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435" && p.work !== "closeCase" && !p.dataIssue ? `<button class="button secondary small" data-work="outcome" data-id="${r.id}">\u041E\u0442\u043A\u0430\u0437 / \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0435 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0451\u043D\u043D\u043E\u0441\u0442\u0438</button>` : ""}</div>${secondary}
  ${c.stage === "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435" ? `<h3>\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043E \u0434\u043E\u043B\u0433\u0435: \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438</h3>${caseNotices(r, c).map((e) => `<div class="source-row"><div><strong>${esc(ACTIONS[e.action])}</strong><small>${esc(e.status)} \xB7 ${esc(e.at.slice(0, 10))}</small></div><button class="button ghost small" data-work="history" data-id="${r.id}">\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430</button></div>`).join("") || "<p>\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u043D\u0435 \u0431\u044B\u043B\u043E.</p>"}${caseNotices(r, c).length ? `<details><summary>\u0414\u0440\u0443\u0433\u0438\u0435 \u043A\u0430\u043D\u0430\u043B\u044B / \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435</summary><button class="button secondary small" data-work="channels" data-id="${r.id}">\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0434\u0440\u0443\u0433\u0443\u044E \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443</button></details>` : ""}` : ""}
  ${clock}${c.stage === "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435" && c.agreement ? `<p>\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 ${esc(c.agreement.number)} \u043E\u0442 ${esc(c.agreement.date)}</p>` : ""}${c.stage === "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435" && c.schedule.length ? `<table><thead><tr><th>\u0414\u0430\u0442\u0430</th><th>\u041F\u043B\u0430\u0442\u0451\u0436</th><th>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442</th></tr></thead><tbody>${c.schedule.map((x, i) => `<tr><td>${esc(x.date)}</td><td>${money(x.amount)}</td><td>${!c.agreement ? "\u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u043E, \u043D\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043E" : x.paid ? "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D" : `<button class="button ghost small" data-work="installment" data-index="${i}" data-id="${r.id}">${x.date < TODAY ? "\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D: \u0441\u0432\u0435\u0440\u0438\u0442\u044C" : "\u0421\u0432\u044F\u0437\u0430\u0442\u044C \u0441 \u043E\u043F\u043B\u0430\u0442\u043E\u0439"}</button>`}</td></tr>`).join("")}</tbody></table>` : ""}</section>`;
}
function dataPanel(r) {
  if (r.billing) return `<section class="case-section"><h3>\u0414\u0430\u043D\u043D\u044B\u0435 \u0438\u0437 \u0443\u0447\u0435\u0431\u043D\u043E\u0433\u043E \u0431\u0438\u043B\u043B\u0438\u043D\u0433\u0430</h3>${r.owners.map((o) => `<p>${esc(o.name)} \xB7 \u0434\u043E\u043B\u044F ${o.share}%</p>`).join("")}<p>${r.houseStatus === "departed" ? `\u0414\u043E\u043C \u0432\u044B\u0431\u044B\u043B \u0438\u0437 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F ${esc(r.contractEnd)}. \u0421\u0442\u0430\u0440\u044B\u0439 \u0434\u043E\u043B\u0433 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u0432 \u0440\u0430\u0431\u043E\u0442\u0435.` : "\u0414\u043E\u043C \u0432 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0438"}</p>${billingTable(r)}<h3>\u0421\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u043B\u0438\u0446\u0435\u0432\u044B\u0435 \u0441\u0447\u0435\u0442\u0430</h3>${r.ownerHistory.map((x) => `<p>${esc(x.name)} \xB7 \u041B\u0421 ${esc(x.account)} \xB7 ${esc(x.reason)}</p>`).join("") || "<p>\u0421\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0445 \u041B\u0421 \u043D\u0435\u0442.</p>"}</section>`;
  return `<section class="case-section"><h3>\u0414\u0430\u043D\u043D\u044B\u0435 \u0434\u043E\u043B\u0436\u043D\u0438\u043A\u0430</h3>${r.owners.length ? r.owners.map((o) => `<p>${esc(o.name)} \xB7 ${o.share}%</p>`).join("") : "<p>\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0438 \u0438 \u0434\u043E\u043B\u0438 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u044B. \u041D\u0435 \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u043C \u0434\u0430\u043D\u043D\u044B\u0435 \u0438\u0437 \u0430\u0434\u0440\u0435\u0441\u0430.</p>"}<button class="button secondary small" data-work="owners" data-id="${r.id}">\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0438 \u0438 \u0434\u043E\u043B\u0438</button>
  <h3>\u041F\u043E\u043C\u0435\u0441\u044F\u0447\u043D\u044B\u0439 \u0440\u0430\u0441\u0447\u0451\u0442</h3>${r.charges.length ? `<div class="table-frame"><table><thead><tr><th>\u041C\u0435\u0441\u044F\u0446</th><th>\u041F\u043B\u043E\u0449\u0430\u0434\u044C / \u0444\u043E\u0440\u043C\u0443\u043B\u0430</th><th>\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u043E</th><th>\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E</th><th>\u041E\u0441\u0442\u0430\u0442\u043E\u043A</th></tr></thead><tbody>${r.charges.map((x) => `<tr><td>${esc(x.month)}</td><td>${x.area} \u043C\xB2<small>${esc(x.formula)}</small></td><td>${money(x.charges)}</td><td>${money(x.payments)}</td><td>${money(x.closing)}</td></tr>`).join("")}</tbody></table></div>` : "<p>\u0420\u0435\u0435\u0441\u0442\u0440 \u043E\u0441\u0442\u0430\u0442\u043A\u043E\u0432 \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043F\u043E\u043C\u0435\u0441\u044F\u0447\u043D\u044B\u0445 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0439. \u041D\u0443\u0436\u0435\u043D \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0440\u0430\u0441\u0447\u0451\u0442 \u0438\u0437 \u0431\u0438\u043B\u043B\u0438\u043D\u0433\u0430.</p>"}<button class="button secondary small" data-work="monthly" data-id="${r.id}">\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0440\u0430\u0441\u0447\u0451\u0442</button>
  <h3>\u0421\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u043B\u0438\u0446\u0435\u0432\u044B\u0435 \u0441\u0447\u0435\u0442\u0430</h3>${r.ownerHistory.map((x) => `<p>\u041F\u0440\u0435\u0436\u043D\u0438\u0439 \u0432\u043B\u0430\u0434\u0435\u043B\u0435\u0446: ${esc(x.name)} \xB7 \u041B\u0421 ${esc(x.account)} \xB7 ${esc(x.reason)}</p>`).join("")}<button class="button secondary small" data-work="previous" data-id="${r.id}">\u0421\u0432\u044F\u0437\u0430\u0442\u044C \u043F\u0440\u0435\u0436\u043D\u0438\u0439 \u041B\u0421</button></section>`;
}
function documentsPanel(state2, r) {
  const c = currentCase(r), key = JSON.stringify([r.company, r.building]);
  const files = packetFiles(state2, r);
  const list = (items) => items.map((d) => `<div class="source-row"><div><strong>${esc(d.name)}</strong><small>\u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D \xB7 ${Math.ceil(d.size / 1024)} \u041A\u0411</small></div><button class="icon-button" data-work="download" data-doc="${d.id}" data-id="${r.id}" aria-label="\u0421\u043A\u0430\u0447\u0430\u0442\u044C ${esc(d.name)}">${icon("download")}</button></div>`).join("") || "<p>\u0424\u0430\u0439\u043B\u044B \u043D\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u044B.</p>";
  return `${c ? templateList(r) : "<p>\u0414\u043B\u044F \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0434\u0435\u043B\u043E.</p>"}<section class="case-section"><h3>\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0434\u043E\u043C\u0430</h3>${list(files.filter((d) => d.house))}<button class="button secondary small" data-work="uploadHouse" data-id="${r.id}">\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0434\u043E\u0433\u043E\u0432\u043E\u0440 \u0434\u043E\u043C\u0430</button></section>${c ? `<section class="case-section"><h3>\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u044B\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0434\u0435\u043B\u0430</h3>${list(files.filter((d) => !d.house))}<button class="button secondary small" data-work="uploadCase" data-id="${r.id}">\u041F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0434\u0435\u043B\u0430</button></section><div class="action-row"><button class="button secondary" data-work="exportPacket" data-id="${r.id}">\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043F\u0430\u043A\u0435\u0442 \u0434\u0435\u043B\u0430</button></div>` : ""}<p class="form-note">\u0422\u043E\u043B\u044C\u043A\u043E \u0434\u0435\u043C\u043E\u043D\u0441\u0442\u0440\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B. \u0412\u043D\u0435\u0448\u043D\u044F\u044F \u043F\u043E\u0434\u0430\u0447\u0430 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0430.</p>`;
}
function templateList(r) {
  const c = currentCase(r);
  if (!c) return "<p>\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0438 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F.</p>";
  const docs = stageDocumentEntries(r), current = new Set(docs.map((d) => d.id));
  const p = caseProgress(c, r), ready = packageReady(r);
  const packageAction = ["\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435", "\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"].includes(c.stage) && (!["\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435"].includes(c.stage) || c.agreement || c.agreementProposal) ? `<div class="package-action"><p>${c.stage === "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435" ? "\u041F\u0430\u043A\u0435\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0443\u0441\u043B\u043E\u0432\u0438\u044F: \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u0438 \u0433\u0440\u0430\u0444\u0438\u043A." : c.stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" ? "\u0418\u0442\u043E\u0433 \u0434\u0435\u043B\u0430: \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u0438 \u0443\u0447\u0442\u0451\u043D\u043D\u044B\u0435 \u043E\u043F\u043B\u0430\u0442\u044B." : "\u041F\u0430\u043A\u0435\u0442 \u0434\u043B\u044F \u043F\u043E\u0434\u0430\u0447\u0438: \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435, \u0440\u0430\u0441\u0447\u0451\u0442 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438 \u0438 \u043E\u043F\u0438\u0441\u044C \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0439."}</p><button class="button" data-work="${c.packageRevisionNeeded ? "reworkPackage" : ready ? p.work : "preparePackage"}" data-id="${r.id}">${c.packageRevisionNeeded ? "\u0423\u0441\u0442\u0440\u0430\u043D\u0438\u0442\u044C \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0441\u0443\u0434\u0430" : ready ? p.next : "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0430\u043A\u0435\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432"}</button></div>` : "";
  const purpose = { paymentStatement: "\u0424\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0443\u0447\u0442\u0451\u043D\u043D\u044B\u0435 \u043E\u043F\u043B\u0430\u0442\u044B \u044D\u0442\u043E\u0433\u043E \u0434\u0435\u043B\u0430: \u0434\u0430\u0442\u0430, \u0441\u0443\u043C\u043C\u0430, \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0434\u043E\u043B\u0433, \u043F\u0435\u043D\u0438 \u0438 \u043F\u043E\u0448\u043B\u0438\u043D\u0430. \u041D\u0435 \u0433\u0440\u0430\u0444\u0438\u043A \u0431\u0443\u0434\u0443\u0449\u0438\u0445 \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439.", calculation: "\u0418\u0437 \u0447\u0435\u0433\u043E \u0441\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435: \u043C\u0435\u0441\u044F\u0446\u044B, \u0443\u0441\u043B\u0443\u0433\u0438, \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F, \u0443\u0447\u0442\u0451\u043D\u043D\u044B\u0435 \u043E\u043F\u043B\u0430\u0442\u044B, \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0438 \u043F\u0435\u043D\u0438." };
  const render2 = (d) => `<div class="source-row"><div><strong>${esc(d.title)}</strong>${purpose[d.kind] ? `<small>${purpose[d.kind]}</small>` : ""}<small>${d.id ? d.status === "sent" ? "\u0421\u043E\u0445\u0440\u0430\u043D\u0451\u043D \u044D\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 / \u043F\u0435\u0447\u0430\u0442\u0438" : "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0441\u043E\u0437\u0434\u0430\u043D" : "\u0415\u0449\u0451 \u043D\u0435 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D"}${d.missing.length ? " \xB7 \u041D\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442: " + esc(d.missing.join("; ")) : ""}</small></div><div class="action-row"><button class="button secondary small" data-work="${d.id ? "docx:" + d.id : "createDocx:" + d.kind}" data-id="${r.id}">${icon("file-down")}${d.id ? "\u041E\u0442\u043A\u0440\u044B\u0442\u044C Word" : "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C DOCX"}</button><button class="icon-button" data-work="${d.id ? "editDraft:" + d.id : "draft:" + d.kind}" data-id="${r.id}" aria-label="\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0442\u0435\u043A\u0441\u0442: ${esc(d.title)}" title="\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0442\u0435\u043A\u0441\u0442">${icon("file-pen-line")}</button></div></div>`;
  const support = ["paymentStatement", "calculation"], main = docs.filter((d) => !support.includes(d.kind)), supportDocs = docs.filter((d) => support.includes(d.kind));
  return `<section class="case-section"><h3>\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B: ${esc(c.stage)}</h3>${packageAction}<div class="document-source"><strong>${esc(r.source)} \xB7 ${esc(r.asOf)}</strong><p>\u041B\u0421 ${esc(r.account)} \xB7 \u0434\u0435\u043B\u043E ${esc(c.id)} \xB7 ${esc(ownerLabel(c))} \xB7 ${esc(c.period)}</p><button class="button ghost small" data-work="data" data-id="${r.id}">\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0440\u0430\u0441\u0447\u0451\u0442</button></div>${c.stage === "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435" && !c.agreement && !c.agreementProposal ? `<p>\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u0443\u0439\u0442\u0435 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u0440\u0430\u0441\u0441\u0440\u043E\u0447\u043A\u0438. \u0417\u0430\u0442\u0435\u043C \u043C\u043E\u0436\u043D\u043E \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u0438 \u0433\u0440\u0430\u0444\u0438\u043A.</p><button class="button" data-work="agreement" data-id="${r.id}">\u0421\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u0442\u044C \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u0438 \u0433\u0440\u0430\u0444\u0438\u043A</button>` : main.map(render2).join("")}${supportDocs.length ? `<details><summary>\u0420\u0430\u0441\u0447\u0451\u0442 \u0438 \u0443\u0447\u0442\u0451\u043D\u043D\u044B\u0435 \u043E\u043F\u043B\u0430\u0442\u044B</summary>${supportDocs.map(render2).join("")}</details>` : ""}<details><summary>\u0428\u0430\u0431\u043B\u043E\u043D \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438</summary><button class="button secondary small" data-work="docxTemplate" data-id="${r.id}">\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D DOCX</button></details></section>${c.drafts?.some((d) => !current.has(d.id) && !d.archived) ? `<details class="case-section"><summary>\u0421\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0434\u0440\u0443\u0433\u0438\u0445 \u044D\u0442\u0430\u043F\u043E\u0432 \u0438 \u0432\u0435\u0440\u0441\u0438\u0439</summary>${c.drafts.filter((d) => !current.has(d.id) && !d.archived).map(render2).join("")}</details>` : ""}`;
}
function installWorkbench(api) {
  const { getState, getRole, save: save2, render: render2, modal: modal2, openDrawer: openDrawer2, toast: toast2, close, bulk: bulk2, payment: payment2, showSources, recordResult: recordResult2, notify, enforcement } = api;
  let context = null;
  const getRow = (id) => getState().rows.find((r) => r.id === id);
  const docxDeps = () => ({ Zip: window.PizZip, Templater: window.docxtemplater });
  const downloadBytes = (name, bytes, type) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  };
  const form = (title, r, body, submit, kind) => {
    context = { id: r.id, kind };
    modal2(title, `\u041B\u0421 ${r.account} \xB7 ${currentCase(r)?.id || "\u0431\u0435\u0437 \u0434\u0435\u043B\u0430"}`, `${body}<div id="workError"></div>`, `<button class="button" data-work-save="${kind}">${submit}</button>`);
  };
  const fields = (prefix, value = {}) => COMPONENTS.map((k) => `<label>${labels[k]}, \u20BD<input id="${prefix}${k}" inputmode="decimal" value="${(value[k] || 0) / 100}"></label>`).join("");
  const readParts = (prefix) => Object.fromEntries(COMPONENTS.map((k) => [k, cents($(`#${prefix}${k}`).value)]));
  const scheduleRow = (x = {}) => `<div class="schedule-row"><label>\u0414\u0430\u0442\u0430 \u043F\u043B\u0430\u0442\u0435\u0436\u0430<input type="date" data-schedule-date value="${esc(x.date || TODAY)}"></label><label>\u0421\u0443\u043C\u043C\u0430, \u20BD<input inputmode="decimal" data-schedule-amount value="${x.amount == null ? "" : x.amount / 100}"></label><button class="icon-button" data-remove-payment aria-label="\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043B\u0430\u0442\u0451\u0436" title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u043B\u0430\u0442\u0451\u0436">${icon("trash-2")}</button></div>`;
  function edit(kind, r, index) {
    const legalActions = ["newCase", "legal", "agreement", "outcome", "transition", "closeCase", "taskDone", "follow", "installment", "uploadHouse", "uploadCase", "preparePackage", "signDemoAgreement", "receiveExecution", "reworkPackage"];
    if (getRole() !== "lawyer" && legalActions.includes(kind)) throw Error("\u042D\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442");
    if (["owners", "previous", "monthly"].includes(kind) && getRole() !== "accountant") throw Error("\u0421\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u0438\u0437 \u0431\u0438\u043B\u043B\u0438\u043D\u0433\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A; \u044E\u0440\u0438\u0441\u0442 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0433\u043E\u0442\u043E\u0432\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435");
    const c = currentCase(r);
    if (kind === "preparePackage") {
      prepareCasePackage(r);
      save2();
      render2();
      return openDrawer2(r.id, "documents");
    }
    if (kind === "reworkPackage") return form("\u0418\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043F\u0430\u043A\u0435\u0442 \u043F\u043E \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F\u043C \u0441\u0443\u0434\u0430", r, `<p>${esc(c.legal?.note || "\u0417\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u044B")}</p><button class="button secondary" data-work="templates" data-id="${r.id}">\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438 \u043E\u0442\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B</button><label>\u041A\u0430\u043A\u0438\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0443\u0441\u0442\u0440\u0430\u043D\u0435\u043D\u044B<textarea id="reworkNote"></textarea></label><p>\u041F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u043F\u0430\u043A\u0435\u0442 \u0431\u0443\u0434\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0434\u043B\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0439 \u043F\u043E\u0434\u0430\u0447\u0438. \u041F\u0440\u0435\u0436\u043D\u0438\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u0432 \u0438\u0441\u0442\u043E\u0440\u0438\u0438.</p>`, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F", "reworkPackage");
    if (kind === "receiveExecution") return form("\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442", r, `<p>\u0420\u0435\u0448\u0435\u043D\u0438\u0435 \u0441\u0443\u0434\u0430 \u0441\u0430\u043C\u043E \u043F\u043E \u0441\u0435\u0431\u0435 \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430.</p><button class="button secondary" data-work="uploadCase" data-id="${r.id}">\u041F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u044C \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u044B\u0439 \u0444\u0430\u0439\u043B</button><label><input type="checkbox" id="receivedDemoExecution"> \u0412 \u0434\u0435\u043C\u043E: \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D, \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u0444\u0430\u0439\u043B</label>`, "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435", "receiveExecution");
    if (kind === "signDemoAgreement") return form("\u041F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F", r, `<p>\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 ${esc(c.agreementProposal?.number)} \u0438 \u0433\u0440\u0430\u0444\u0438\u043A \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u044B. \u0420\u0435\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u0432 \u0434\u0435\u043C\u043E \u043D\u0435\u0442.</p><label><input type="checkbox" id="signedDemoAgreement"> \u0412 \u0434\u0435\u043C\u043E: \u0441\u0442\u043E\u0440\u043E\u043D\u044B \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043B\u0438 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435</label>`, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0432 \u0434\u0435\u043C\u043E", "signDemoAgreement");
    if (kind === "data") return openDrawer2(r.id, "data");
    if (kind === "outcome") return form("\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0441 \u0434\u043E\u043B\u0436\u043D\u0438\u043A\u043E\u043C", r, `<p>\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0434\u0435\u043B\u0430: ${money(amount(c.remaining))}. \u041E\u0431\u0435\u0449\u0430\u043D\u0438\u0435 \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F \u043E\u043F\u043B\u0430\u0442\u043E\u0439.</p><label>\u0427\u0442\u043E \u0440\u0435\u0448\u0438\u043B \u0434\u043E\u043B\u0436\u043D\u0438\u043A / \u044E\u0440\u0438\u0441\u0442<select id="contactResult">${Object.entries(CONTACT_RESULTS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select></label><label>\u041E \u0447\u0451\u043C \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u043B\u0438\u0441\u044C \u0438\u043B\u0438 \u043F\u043E\u0447\u0435\u043C\u0443 \u0432\u044B\u0431\u0440\u0430\u043D \u044D\u0442\u043E\u0442 \u043F\u0443\u0442\u044C<textarea id="contactNote"></textarea></label><label>\u0414\u0430\u0442\u0430 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044F<input id="contactDue" type="date" min="${TODAY}" value="${TODAY}"></label><p>\u0420\u0430\u0441\u0441\u0440\u043E\u0447\u043A\u0430 \u043E\u0442\u043A\u0440\u043E\u0435\u0442 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F. \u041F\u0440\u0438\u043A\u0430\u0437 \u0438\u043B\u0438 \u0438\u0441\u043A \u043E\u0442\u043A\u0440\u043E\u0435\u0442 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0443 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0433\u043E \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u044F, \u043D\u043E \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442 \u0435\u0433\u043E \u0432 \u0441\u0443\u0434.</p>`, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442", "outcome");
    if (kind === "transition") return form("\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u044D\u0442\u0430\u043F\u0430", r, `<p>\u0421\u0435\u0439\u0447\u0430\u0441: ${esc(c.stage)}. \u041F\u0435\u0440\u0435\u0445\u043E\u0434 \u043C\u0435\u043D\u044F\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u0434\u0435\u043B\u043E, \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F.</p><label>\u041A\u0443\u0434\u0430 \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0438\u0442 \u0434\u0435\u043B\u043E<select id="nextStage">${choose(transitionOptions(c))}</select></label><label>\u0427\u0442\u043E \u043F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u043E \u0438 \u043F\u043E\u0447\u0435\u043C\u0443 \u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u044D\u0442\u0430\u043F<textarea id="transitionReason" placeholder="\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043B\u0438 \u043E\u0431\u0441\u0443\u0436\u0434\u0435\u043D\u0438\u0435 \u0440\u0430\u0441\u0441\u0440\u043E\u0447\u043A\u0438; \u0438\u043B\u0438 \u0434\u043E\u043B\u0436\u043D\u0438\u043A \u043E\u0442\u043A\u0430\u0437\u0430\u043B\u0441\u044F, \u044E\u0440\u0438\u0441\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u044F \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F \u0432 \u0441\u0443\u0434"></textarea></label>`, "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0435\u0440\u0435\u0445\u043E\u0434", "transition");
    if (kind === "channels") return notify(r);
    if (kind === "enforcement") return enforcement(r);
    if (kind.startsWith("demo:")) {
      const event = kind.split(":")[1], accounting = ["fullPayment", "halfPayment", "newMonth"].includes(event);
      if (getRole() !== (accounting ? "accountant" : "lawyer")) throw Error(accounting ? "\u042D\u0442\u043E \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A" : "\u042D\u0442\u043E \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442");
      const balance = c?.remaining || unassigned(r), parts = event === "halfPayment" ? { principal: Math.floor(balance.principal / 2), penalty: Math.floor(balance.penalty / 2), fee: balance.fee } : balance;
      const text = { fullPayment: `\u0423\u0447\u0435\u0431\u043D\u0430\u044F \u0432\u044B\u043F\u0438\u0441\u043A\u0430: ${money(amount(parts))}. \u0414\u043E\u043B\u0433 ${money(parts.principal)}, \u043F\u0435\u043D\u0438 ${money(parts.penalty)}, \u043F\u043E\u0448\u043B\u0438\u043D\u0430 ${money(parts.fee)}.`, halfPayment: `\u0423\u0447\u0435\u0431\u043D\u0430\u044F \u0432\u044B\u043F\u0438\u0441\u043A\u0430: ${money(amount(parts))}. \u0414\u043E\u043B\u0433 ${money(parts.principal)}, \u043F\u0435\u043D\u0438 ${money(parts.penalty)}, \u043F\u043E\u0448\u043B\u0438\u043D\u0430 ${money(parts.fee)}.`, newMonth: "\u0412 \u0443\u0447\u0435\u0431\u043D\u043E\u043C \u0431\u0438\u043B\u043B\u0438\u043D\u0433\u0435 \u043F\u043E\u044F\u0432\u0438\u043B\u0441\u044F \u043E\u043A\u0442\u044F\u0431\u0440\u044C: \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435 2 000 \u20BD. \u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u0434\u0435\u043B\u0430 \u0438 \u0441\u0443\u0434\u0435\u0431\u043D\u044B\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u043D\u0435 \u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F.", agreement: `\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0438 \u0433\u0440\u0430\u0444\u0438\u043A \u043D\u0430 ${money(amount(balance))}: \u0434\u0432\u0435 \u0447\u0430\u0441\u0442\u0438, 29.10 \u0438 15.11. \u0420\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u043D\u0435\u0442.`, execution: "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0443\u0447\u0435\u0431\u043D\u043E\u0435 \u043F\u0440\u0435\u0434\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0440\u0438\u043A\u0430\u0437\u0430 \u0432 \u0431\u0430\u043D\u043A. \u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0439 05.11.2026. \u0420\u0435\u0430\u043B\u044C\u043D\u043E\u0439 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u043D\u0435\u0442." }[event];
      form("\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0443\u0447\u0435\u0431\u043D\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435", r, `<p>${esc(text)}</p><p>\u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435: ${esc(c?.id || "\u0434\u043E\u043B\u0433 \u0432\u043D\u0435 \u0434\u0435\u043B")}. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435 \u043D\u0435 \u0443\u0432\u0435\u043B\u0438\u0447\u0438\u0432\u0430\u0435\u0442 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u0438\u043B\u0438 \u043F\u043B\u0430\u0442\u0435\u0436\u0438.</p>`, "\u0423\u0447\u0435\u0441\u0442\u044C \u0432 \u0434\u0435\u043C\u043E", "demo");
      context.event = event;
      return;
    }
    if (kind === "docxTemplate") {
      if (getRole() !== "lawyer") throw Error("\u0428\u0430\u0431\u043B\u043E\u043D\u044B \u043D\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0435\u0442 \u044E\u0440\u0438\u0441\u0442");
      return form("\u0428\u0430\u0431\u043B\u043E\u043D DOCX", r, `<label>\u0412\u0438\u0434 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430<select id="docxKind">${availableTemplates(c).map(([k, d]) => `<option value="${k}">${esc(d.title)}</option>`).join("")}</select></label><label>\u0424\u0430\u0439\u043B DOCX<input id="docxFile" type="file" accept=".docx"></label><p>\u041F\u043E\u043B\u044F: ${TEMPLATE_FIELDS.map((k) => `{${k}}`).join(", ")}. \u0414\u043E 500 \u041A\u0411, \u0431\u0435\u0437 \u043C\u0430\u043A\u0440\u043E\u0441\u043E\u0432 \u0438 \u0432\u043D\u0435\u0448\u043D\u0438\u0445 \u0441\u0441\u044B\u043B\u043E\u043A.</p><button class="button secondary" data-work="baseDocx" data-id="${r.id}">\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043E\u0431\u0440\u0430\u0437\u0435\u0446 \u0448\u0430\u0431\u043B\u043E\u043D\u0430</button>`, "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D", "docxTemplate");
    }
    if (kind === "templates") return openDrawer2(r.id, "documents");
    if (kind.startsWith("draft:") || kind.startsWith("editDraft:")) {
      if (getRole() !== "lawyer") throw Error("\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0433\u043E\u0442\u043E\u0432\u0438\u0442 \u044E\u0440\u0438\u0441\u0442");
      const previous = kind.startsWith("editDraft:") ? c.drafts?.find((d) => d.id === kind.split(":")[1]) : null;
      const draft = previous || draftDocument(r, kind.split(":")[1]);
      form(draft.title, r, `<label>\u0422\u0435\u043A\u0441\u0442 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430<textarea id="draftText" rows="16" ${previous?.status === "sent" ? "readonly" : ""}>${esc(draft.text)}</textarea></label>${draft.missing.length ? `<p class="notice">\u041D\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442: ${esc(draft.missing.join("; "))}. \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u0430\u043A \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A.</p>` : ""}<p>\u0414\u0430\u043D\u043D\u044B\u0435 \u0438 \u0442\u0435\u043A\u0441\u0442 \u044D\u0442\u043E\u0433\u043E \u044D\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u043E\u0442 \u043F\u043E\u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0445 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0434\u043E\u043B\u0433\u0430.</p>`, previous?.status === "sent" ? "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" : "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A", "draft");
      context.draft = draft;
      context.draftId = previous?.id;
      return;
    }
    if (kind === "review") {
      if (getRole() !== "lawyer") throw Error("\u0417\u0430\u043F\u0440\u043E\u0441 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0443 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442");
      if (r.reviewTask?.status === "open") return edit("reviewStatus", r);
      const missing = c ? [...new Set(stageDocumentEntries(r).flatMap((d) => d.missing))].filter((x) => !["\u043D\u043E\u043C\u0435\u0440 \u0438 \u0434\u0430\u0442\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F", "\u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0433\u0440\u0430\u0444\u0438\u043A \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439", "\u0440\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u0430\u0434\u0440\u0435\u0441\u0430\u0442\u0430 \u0438 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0439 \u044E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0442\u0435\u043A\u0441\u0442"].includes(x)) : [];
      return form(roleRecommendation({ ...r, _caseView: true }, "lawyer").action === "review" ? roleRecommendation({ ...r, _caseView: true }, "lawyer").label : "\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u0435 \u0443 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0430", r, `<label>\u0427\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C<textarea id="reviewReason">${esc(reviewReasons(r).join("; ") || (missing.length ? "\u0414\u043B\u044F \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432 \u0434\u0435\u043B\u0430 \u043D\u0443\u0436\u043D\u044B: " + missing.join("; ") : ""))}</textarea></label><label>\u0421\u0440\u043E\u043A \u043E\u0442\u0432\u0435\u0442\u0430<input id="reviewDue" type="date" min="${TODAY}" value="${TODAY}"></label><p>\u0417\u0430\u043F\u0440\u043E\u0441 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u0441\u0443\u043C\u043C\u0435 \u0438\u043B\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F\u043C, \u0430 \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442 \u044E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u044D\u0442\u0430\u043F.</p>`, "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441", "review");
    }
    if (kind === "reviewStatus") return modal2("\u0417\u0430\u043F\u0440\u043E\u0441 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0438\u0438", r.reviewTask.reason, `<p>\u0421\u0440\u043E\u043A: ${esc(r.reviewTask.due)} \xB7 ${r.reviewTask.status === "open" ? "\u0416\u0434\u0451\u043C \u043E\u0442\u0432\u0435\u0442\u0430" : "\u041E\u0442\u0432\u0435\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D"}</p>`);
    if (kind === "resolve") {
      if (getRole() !== "accountant") throw Error("\u0421\u0432\u0435\u0440\u043A\u0443 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A");
      return form("\u0423\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u0435 \u0441\u0443\u043C\u043C\u044B \u0434\u043E\u043B\u0433\u0430", r, `<p>${esc(r.reviewTask?.reason || recommendation(r).detail)}</p>${r.unallocated ? `<button class="button secondary" data-work="payment" data-id="${r.id}">\u0420\u0430\u0437\u043D\u0435\u0441\u0442\u0438 ${money(r.unallocated)}</button>` : ""}${days(r.asOf) > 7 ? `<button class="button secondary" data-work="sources" data-id="${r.id}">\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u0432\u0435\u0436\u0438\u0439 \u0440\u0435\u0435\u0441\u0442\u0440</button>` : ""}${r.caseBalanceConflict ? `<button class="button secondary" data-work="balances" data-id="${r.id}">\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0434\u043E\u043B\u0433 \u043F\u043E \u0434\u0435\u043B\u0430\u043C</button>` : ""}${r.disputed ? `<label><input id="disputeResolved" type="checkbox"> \u0412\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B, \u0441\u0443\u043C\u043C\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430</label>` : ""}<label>\u041E\u0442\u0432\u0435\u0442 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0430<textarea id="reviewResult"></textarea></label>`, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u0435", "resolve");
    }
    if (kind === "balances") {
      if (getRole() !== "accountant") throw Error("\u041E\u0441\u0442\u0430\u0442\u043A\u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A");
      return form("\u041E\u0441\u0442\u0430\u0442\u043A\u0438 \u043F\u043E \u0434\u0435\u043B\u0430\u043C", r, `<p>\u0421\u0430\u043B\u044C\u0434\u043E \u041B\u0421: ${money(total(r))}. \u041D\u0435\u043E\u0442\u043D\u0435\u0441\u0451\u043D\u043D\u0430\u044F \u0447\u0430\u0441\u0442\u044C \u043E\u0441\u0442\u0430\u043D\u0435\u0442\u0441\u044F \u0432\u043D\u0435 \u0434\u0435\u043B.</p>${r.cases.map((c2, i) => `<h3>${esc(c2.id)} \xB7 ${esc(ownerLabel(c2))} \xB7 ${esc(c2.period)}</h3><div class="form-grid">${fields(`case${i}`, c2.remaining)}</div>`).join("")}`, "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043A\u0438", "balances");
    }
    if (kind === "newCase") return form("\u041D\u043E\u0432\u043E\u0435 \u0434\u0435\u043B\u043E \u043F\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u043C\u0443 \u0434\u043E\u043B\u0433\u0443", r, `<p>\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0432\u043D\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0445 \u0434\u0435\u043B: ${money(amount(unassigned(r)))}. \u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F.</p><label>\u041F\u0435\u0440\u0438\u043E\u0434${r.billing ? " \u0438\u0437 \u043D\u0435\u043F\u043E\u0433\u0430\u0448\u0435\u043D\u043D\u044B\u0445 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u0439" : ""}<input id="newPeriod" value="${esc(r.billing ? billingPeriod(billingLines(r)) : r.period)}" ${r.billing ? "readonly" : ""}></label><div class="form-grid">${fields("new", unassigned(r))}</div>`, "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0434\u0435\u043B\u043E", "newCase");
    if (kind === "closeCase") return form("\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0435 \u0434\u0435\u043B\u043E", r, `<p>${esc(c?.id)} \xB7 \u043E\u0441\u0442\u0430\u0442\u043E\u043A ${money(amount(c?.remaining))}. \u0414\u0440\u0443\u0433\u0438\u0435 \u0434\u043E\u043B\u0433\u0438 \u041B\u0421 \u043D\u0435 \u0437\u0430\u043A\u0440\u044B\u0432\u0430\u044E\u0442\u0441\u044F.</p><label>\u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435<textarea id="closeReason">\u041F\u043E\u0433\u0430\u0448\u0435\u043D\u0438\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u043F\u043E \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F\u043C \u0434\u0435\u043B\u0430</textarea></label>`, "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0434\u0435\u043B\u043E", "closeCase");
    if (kind === "legal") {
      if (!c) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0434\u0435\u043B\u043E");
      const statuses = LEGAL_RESULTS[c.stage] || {}, status = packageReady(r) && ["\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430", "\u0418\u0441\u043A \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D", void 0].includes(c.legal.status) ? "\u041F\u043E\u0434\u0430\u043D\u043E" : Object.hasOwn(statuses, c.legal.status) ? c.legal.status : Object.keys(statuses)[0];
      return form(`${c.stage}: \u0447\u0442\u043E \u043F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u043E`, r, `<div class="form-grid"><label>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442<select id="legalStatus">${choose(Object.keys(statuses), status)}</select></label><label>\u041D\u043E\u043C\u0435\u0440 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430 / \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F<input id="legalNumber" value="${esc(c.legal.number || "")}"></label><label>\u0414\u0430\u0442\u0430 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430<input type="date" id="legalDate" max="${TODAY}" value="${TODAY}"></label><label>\u0414\u0430\u0442\u0430 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044F<input type="date" id="legalDue" min="${TODAY}" value="${c.legal.nextDate || TODAY}"></label></div><label>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442, \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u0441\u0443\u0434\u0430 \u0438\u043B\u0438 \u043F\u0440\u0438\u0447\u0438\u043D\u0430 \u043E\u0442\u043A\u0430\u0437\u0430<textarea id="legalNote"></textarea></label><p id="legalNext">\u0414\u0430\u043B\u0435\u0435: ${esc(statuses[status] || "")}</p><label id="receivedDemoLabel" ${["\u041F\u043E\u043B\u0443\u0447\u0435\u043D \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442", "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u0435"].includes(status) ? "" : "hidden"}><input type="checkbox" id="receivedDemoDocument"> \u0412 \u0434\u0435\u043C\u043E: \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0443\u0447\u0435\u0431\u043D\u044B\u0439 \u044D\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u043E\u0433\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430</label><p>\u0421\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u0430 \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F \u043F\u043E\u0434\u0430\u0447\u0435\u0439. \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0444\u0438\u043A\u0441\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u043F\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0443 \u0438\u043B\u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044E \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u044F; \u0432\u043D\u0435\u0448\u043D\u0438\u0445 \u043E\u0442\u043F\u0440\u0430\u0432\u043E\u043A \u043D\u0435\u0442.</p>`, "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442", "legal");
    }
    if (kind === "agreement") {
      if (!c) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0434\u0435\u043B\u043E");
      const agreement = c.agreement || c.agreementProposal;
      if (c.agreementProposal && !c.agreement) return modal2("\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u044C \u043F\u043E \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044E", `\u041B\u0421 ${r.account} \xB7 ${c.id}`, `<p>\u0423\u0441\u043B\u043E\u0432\u0438\u044F \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\u044B: ${esc(c.agreementProposal.number)}. \u0413\u0440\u0430\u0444\u0438\u043A \u043D\u0430 ${money(amount(c.remaining))}.</p><div class="action-row"><button class="button secondary" data-work="templates" data-id="${r.id}">\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u0438 \u0433\u0440\u0430\u0444\u0438\u043A</button><button class="button" data-work="signDemoAgreement" data-id="${r.id}">\u0421\u043C\u043E\u0434\u0435\u043B\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u0438\u0435</button><button class="button secondary" data-work="uploadCase" data-id="${r.id}">\u041F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442</button><button class="button secondary" data-work="outcome" data-id="${r.id}">\u0414\u043E\u043B\u0436\u043D\u0438\u043A \u043E\u0442\u043A\u0430\u0437\u0430\u043B\u0441\u044F</button></div>`);
      return form("\u0423\u0441\u043B\u043E\u0432\u0438\u044F \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F", r, `<p>\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430: <strong>${money(amount(c.remaining))}</strong>. \u0420\u0430\u0441\u0447\u0451\u0442 \u043F\u043E\u043B\u0443\u0447\u0435\u043D \u0438\u0437 ${esc(r.source)} \u043D\u0430 ${esc(r.asOf)}.</p><label>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u0435\u0440\u0435\u0433\u043E\u0432\u043E\u0440\u043E\u0432<select id="agreementMode"><option value="proposal">\u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442\u044C \u0433\u0440\u0430\u0444\u0438\u043A, \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u0435\u0449\u0451 \u043D\u0435\u0442</option><option value="signed" ${c.agreement ? "selected" : ""}>\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043E</option></select></label><div class="form-grid"><label>\u041D\u043E\u043C\u0435\u0440 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 / \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044F<input id="agreementNumber" value="${esc(agreement?.number || "")}"></label><label>\u0414\u0430\u0442\u0430<input type="date" id="agreementDate" max="${TODAY}" value="${agreement?.date || TODAY}"></label></div><h3>\u0413\u0440\u0430\u0444\u0438\u043A \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439</h3><div id="scheduleRows">${(c.schedule.length ? c.schedule : [{ date: TODAY, amount: amount(c.remaining) }]).map(scheduleRow).join("")}</div><button class="button secondary small" data-add-payment>\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u043B\u0430\u0442\u0451\u0436</button><label id="agreementFileLabel" ${c.agreement ? "" : "hidden"}>\u041F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442${c.documents.some((d) => d.kind === "agreement" && !d.archived) ? "<small>\u0424\u0430\u0439\u043B \u0443\u0436\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D \u043A \u0434\u0435\u043B\u0443</small>" : '<input id="agreementFile" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg">'}</label><p>\u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442 \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u0434\u043B\u044F \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u043E\u0432. \u041F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u043E\u0435 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0444\u0430\u0439\u043B\u0430; \u043F\u043E\u0441\u043B\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439. \u041E\u043F\u043B\u0430\u0442\u0430 \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0437 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0439.</p>`, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u0435\u0440\u0435\u0433\u043E\u0432\u043E\u0440\u043E\u0432", "agreement");
    }
    if (kind === "installment") {
      if (!c?.agreement) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u0443\u0439\u0442\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u043E\u0435 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435");
      if (!Number.isInteger(index) || index < 0) index = c.schedule.findIndex((x) => !x.paid);
      if (!c.schedule[index]) return edit("follow", r);
      const payments = r.payments.map((p, i) => ({ p, i })).filter(({ p }) => p.caseId === c.id && !c.schedule.some((x) => x.paid && x.paymentIds?.includes(p.id)));
      if (!payments.length) return modal2("\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u043F\u043B\u0430\u0442\u0435\u0436\u0430", `\u041B\u0421 ${r.account} \xB7 ${c.id}`, `<p>\u041F\u043E \u0433\u0440\u0430\u0444\u0438\u043A\u0443: ${money(c.schedule[index].amount)} \u0434\u043E ${esc(c.schedule[index].date)}.</p><p>${c.schedule[index].date < TODAY ? "\u0421\u0440\u043E\u043A \u0438\u0441\u0442\u0451\u043A, \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u043D\u0435 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u044B." : "\u0421\u0440\u043E\u043A \u0435\u0449\u0451 \u043D\u0435 \u0438\u0441\u0442\u0451\u043A, \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u043F\u043E\u043A\u0430 \u043D\u0435 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u044B."}</p><div class="action-row"><button class="button" data-work="follow" data-id="${r.id}">\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043A\u043E\u043D\u0442\u0430\u043A\u0442 \u0438 \u0434\u0430\u0442\u0443 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044F</button><button class="button secondary" data-work="outcome" data-id="${r.id}">\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0435 \u0433\u0440\u0430\u0444\u0438\u043A\u0430: \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u0430\u043B\u044C\u043D\u0435\u0439\u0448\u0438\u0439 \u043F\u0443\u0442\u044C</button><button class="button secondary" data-work="review" data-id="${r.id}">\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u0443\u044E \u043E\u043F\u043B\u0430\u0442\u0443 \u0443 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0430</button></div>`);
      form("\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043F\u043B\u0430\u0442\u0451\u0436 \u0433\u0440\u0430\u0444\u0438\u043A\u0430", r, `<p>\u041F\u043B\u0430\u043D: ${money(c.schedule[index].amount)} \xB7 ${esc(c.schedule[index].date)}</p>${payments.map(({ p, i }) => `<label><input type="checkbox" data-pay-index="${i}"> ${esc(p.at)} \xB7 ${money(p.amount)}</label>`).join("") || "<p>\u041F\u043E \u044D\u0442\u043E\u043C\u0443 \u0434\u0435\u043B\u0443 \u043D\u0435\u0442 \u0440\u0430\u0437\u043D\u0435\u0441\u0451\u043D\u043D\u044B\u0445 \u043F\u043B\u0430\u0442\u0435\u0436\u0435\u0439. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0443\u0436\u043D\u0430 \u0431\u0443\u0445\u0433\u0430\u043B\u0442\u0435\u0440\u0441\u043A\u0430\u044F \u0441\u0432\u0435\u0440\u043A\u0430.</p>"}`, "\u0421\u0432\u044F\u0437\u0430\u0442\u044C \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F", "installment");
      context.index = index;
      return;
    }
    if (kind === "owners") return form("\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0438 \u0438 \u0434\u043E\u043B\u0438", r, `<label>\u0418\u043C\u044F; \u0434\u043E\u043B\u044F \u0432 \u043F\u0440\u043E\u0446\u0435\u043D\u0442\u0430\u0445<textarea id="owners" rows="5" placeholder="\u0414\u0435\u043C\u043E \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A;100">${r.owners.map((o) => `${o.name};${o.share}`).join("\n")}</textarea></label><p>\u041D\u0435 \u0432\u0432\u043E\u0434\u0438\u0442\u0435 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0445 \u0436\u0438\u0442\u0435\u043B\u0435\u0439 \u0432 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0435 \u0434\u0435\u043C\u043E.</p>`, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C", "owners");
    if (kind === "monthly") return form("\u041F\u043E\u043C\u0435\u0441\u044F\u0447\u043D\u044B\u0439 \u0440\u0430\u0441\u0447\u0451\u0442 \u0438\u0437 \u0431\u0438\u043B\u043B\u0438\u043D\u0433\u0430", r, `<p>\u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 CSV \u0441 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u043E\u043C: month;area;formula;opening;charges;payments;closing. \u0421\u0443\u043C\u043C\u044B \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0433\u043E \u0434\u043E\u043B\u0433\u0430 \u0432 \u0440\u0443\u0431\u043B\u044F\u0445. \u041F\u0435\u043D\u0438 \u0438 \u043F\u043E\u0448\u043B\u0438\u043D\u0430 \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E.</p><label>\u0414\u0430\u043D\u043D\u044B\u0435 \u0440\u0430\u0441\u0447\u0451\u0442\u0430<textarea id="monthly" rows="7" placeholder="month;area;formula;opening;charges;payments;closing"></textarea></label><p>\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0442\u0441\u044F \u0431\u0430\u043B\u0430\u043D\u0441 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u043C\u0435\u0441\u044F\u0446\u0430, \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043A\u043E\u0432 \u0438 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0441 \u043E\u0441\u043D\u043E\u0432\u043D\u044B\u043C \u0434\u043E\u043B\u0433\u043E\u043C \u041B\u0421.</p>`, "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C", "monthly");
    if (kind === "previous") return form("\u0421\u0432\u044F\u0437\u0430\u0442\u044C \u043F\u0440\u0435\u0436\u043D\u0438\u0439 \u043B\u0438\u0446\u0435\u0432\u043E\u0439 \u0441\u0447\u0451\u0442", r, `<label>\u041F\u0440\u0435\u0436\u043D\u0438\u0439 \u041B\u0421<select id="previousAccount">${getState().rows.filter((x) => x.id !== r.id && x.company === r.company).map((x) => `<option value="${x.id}">${esc(x.account)} \xB7 ${esc(x.building)} \xB7 \u043A\u0432. ${esc(x.flat)}</option>`).join("")}</select></label><label>\u041F\u0440\u0435\u0436\u043D\u0438\u0439 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A<input id="previousName"></label><label>\u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0441\u0432\u044F\u0437\u0438<input id="previousReason" placeholder="\u0421\u043C\u0435\u043D\u0430 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430, \u0434\u0430\u0442\u0430"></label><p>\u0421\u0432\u044F\u0437\u044C \u043D\u0435 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442 \u0434\u043E\u043B\u0433 \u043D\u0430 \u043D\u043E\u0432\u043E\u0433\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430. \u0421\u0443\u043C\u043C\u044B \u0438 \u0434\u0435\u043B\u0430 \u043F\u0440\u0435\u0436\u043D\u0435\u0433\u043E \u041B\u0421 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F.</p>`, "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0441\u0432\u044F\u0437\u044C", "previous");
    if (["uploadHouse", "uploadCase"].includes(kind)) {
      if (kind === "uploadCase" && !c) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0434\u0435\u043B\u043E");
      form("\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0434\u0435\u043C\u043E\u043D\u0441\u0442\u0440\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u0444\u0430\u0439\u043B", r, `<label>\u0412\u0438\u0434 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430<select id="fileKind">${kind === "uploadHouse" ? '<option value="contract">\u0414\u043E\u0433\u043E\u0432\u043E\u0440 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F</option>' : '<option value="order">\u0421\u0443\u0434\u0435\u0431\u043D\u044B\u0439 \u043F\u0440\u0438\u043A\u0430\u0437</option><option value="agreement">\u041F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u043E\u0435 \u0441\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435</option><option value="claim">\u0418\u0441\u043A</option><option value="enforcement">\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442</option><option value="other">\u0418\u043D\u043E\u0435</option>'}</select></label><label>\u0424\u0430\u0439\u043B<input id="caseFile" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg"></label><p>\u0414\u043E 500 \u041A\u0411 \u043D\u0430 \u0444\u0430\u0439\u043B. \u0422\u043E\u043B\u044C\u043A\u043E \u0441\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B. \u041E\u0431\u0449\u0438\u0439 \u0434\u043E\u0433\u043E\u0432\u043E\u0440 \u0431\u0443\u0434\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0432\u043E \u0432\u0441\u0435\u0445 \u0434\u0435\u043B\u0430\u0445 \u044D\u0442\u043E\u0433\u043E \u0434\u043E\u043C\u0430.</p>`, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0444\u0430\u0439\u043B", kind);
      if (kind === "uploadCase") $("#fileKind").value = c.stage === "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435" ? "agreement" : c.stage === "\u0418\u0441\u043A" ? "enforcement" : "order";
      return;
    }
    if (kind === "packet") {
      const docs = packetFiles(getState(), r);
      return modal2("\u0421\u043E\u0441\u0442\u0430\u0432 \u043F\u0430\u043A\u0435\u0442\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430", c?.id || "\u0414\u0435\u043B\u043E \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u043E", `<p>${r.owners.length ? "\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0438 \u0438 \u0434\u043E\u043B\u0438 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u044B" : "\u041D\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u043E\u0432 \u0438 \u0434\u043E\u043B\u0435\u0439"}</p><p>${r.charges.length ? "\u041F\u043E\u043C\u0435\u0441\u044F\u0447\u043D\u044B\u0439 \u0440\u0430\u0441\u0447\u0451\u0442 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D" : "\u041D\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u043F\u043E\u043C\u0435\u0441\u044F\u0447\u043D\u043E\u0433\u043E \u0440\u0430\u0441\u0447\u0451\u0442\u0430"}</p><p>${docs.some((d) => d.house) ? "\u0414\u043E\u0433\u043E\u0432\u043E\u0440 \u0434\u043E\u043C\u0430 \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438" : "\u041D\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0430 \u0434\u043E\u043C\u0430"}</p>${docs.map((d) => `<p>${esc(d.name)} <button class="icon-button" data-work="download" data-doc="${d.id}" data-id="${r.id}" aria-label="\u0421\u043A\u0430\u0447\u0430\u0442\u044C ${esc(d.name)}">${icon("download")}</button></p>`).join("")}<button class="button secondary" data-work="exportPacket" data-id="${r.id}">\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043E\u043F\u0438\u0441\u044C \u0438 \u0440\u0430\u0441\u0447\u0451\u0442</button><p>\u042D\u0442\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u043D\u043E\u0441\u0442\u0438, \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u0438 \u043A \u043F\u043E\u0434\u0430\u0447\u0435 \u0432 \u0441\u0443\u0434.</p>`);
    }
    if (kind === "taskDone") return form("\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443", r, `<p>${esc(r.task?.text)}</p><label>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442<textarea id="taskResult"></textarea></label>`, "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C", "taskDone");
    if (kind === "follow") return form("\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043E\u043F\u043B\u0430\u0442\u044B", r, `<p>\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0434\u0435\u043B\u0430 ${money(c ? amount(c.remaining) : total(r))} \u043D\u0430 ${esc(r.asOf)}. \u041D\u0435\u043B\u044C\u0437\u044F \u0443\u043C\u0435\u043D\u044C\u0448\u0438\u0442\u044C \u0434\u043E\u043B\u0433 \u0431\u0435\u0437 \u0440\u0430\u0437\u043D\u0435\u0441\u0435\u043D\u0438\u044F \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F.</p><label>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442<input id="followNote" placeholder="\u041E\u043F\u043B\u0430\u0442\u0430 \u043D\u0435 \u043F\u043E\u0441\u0442\u0443\u043F\u0438\u043B\u0430, \u0441\u0432\u044F\u0437\u0430\u0442\u044C\u0441\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E"></label><label>\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430<input id="followDate" type="date" min="${TODAY}" value="${TODAY}"></label>`, "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C", "follow");
    if (kind === "payment") return payment2(r.id);
    if (kind === "sources") return showSources();
    if (kind === "history" || kind === "documents") return openDrawer2(r.id, kind === "history" ? "history" : "documents");
    return bulk2("task", [r.id]);
  }
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-add-payment]")) {
      $("#scheduleRows").insertAdjacentHTML("beforeend", scheduleRow());
      window.lucide?.createIcons();
      return;
    }
    if (e.target.closest("[data-remove-payment]")) {
      e.target.closest(".schedule-row").remove();
      return;
    }
    const el = e.target.closest("[data-work],[data-work-save]");
    if (!el) return;
    try {
      if (el.dataset.work) {
        const r2 = getRow(el.dataset.id), kind2 = el.dataset.work;
        if (kind2.startsWith("createDocx:")) {
          if (getRole() !== "lawyer") throw Error("\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0433\u043E\u0442\u043E\u0432\u0438\u0442 \u044E\u0440\u0438\u0441\u0442");
          const d = ensureDocument(r2, kind2.split(":")[1]);
          save2();
          downloadBytes(`demo-${r2.account}-${d.kind}.docx`, renderDocx(d, docxDeps(), getState().documentTemplates?.[d.kind]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
          openDrawer2(r2.id, "documents");
          return;
        }
        if (kind2 === "baseDocx") {
          downloadBytes("demo-template.docx", templateBytes(window.PizZip), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
          return;
        }
        if (kind2.startsWith("docx:")) {
          const d = currentCase(r2)?.drafts?.find((x) => x.id === kind2.split(":")[1]);
          if (!d || d.archived) throw Error("\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
          downloadBytes(`demo-${r2.account}-${d.kind}.docx`, renderDocx(d, docxDeps(), getState().documentTemplates?.[d.kind]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
          return;
        }
        if (/^(downloadDraft|archiveDraft|restoreDraft):/.test(kind2)) {
          const [action, id] = kind2.split(":"), d = currentCase(r2)?.drafts?.find((d2) => d2.id === id);
          if (!d) throw Error("\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
          if (action === "downloadDraft") {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([documentText(r2, id)], { type: "text/plain;charset=utf-8" }));
            a.download = `demo-${r2.account}-${d.kind}.txt`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
            return;
          }
          if (getRole() !== "lawyer") throw Error("\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0432\u0435\u0434\u0451\u0442 \u044E\u0440\u0438\u0441\u0442");
          d.archived = action === "archiveDraft";
          audit(r2, d.archived ? "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0430\u0440\u0445\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u043D" : "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D", d.title);
          save2();
          openDrawer2(r2.id, "documents");
          return;
        }
        if (kind2 === "download") {
          const d = packetFiles(getState(), r2).find((d2) => d2.id === el.dataset.doc);
          if (!d) throw Error("\u0424\u0430\u0439\u043B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
          const a = document.createElement("a");
          a.href = d.data;
          a.download = d.name;
          a.click();
          return;
        }
        if (kind2 === "exportPacket") {
          const c2 = currentCase(r2);
          if (!c2) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0435\u043B\u043E");
          const zip = new window.PizZip();
          const calc = draftDocument(r2, "calculation");
          zip.file("\u0420\u0430\u0441\u0447\u0451\u0442 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438.docx", renderDocx(calc, docxDeps()));
          for (const d of c2.drafts || []) if (!d.archived) zip.file(`${d.id}-${d.kind}.docx`, renderDocx(d, docxDeps(), getState().documentTemplates?.[d.kind]));
          for (const d of packetFiles(getState(), r2)) {
            const data = d.data.split(",");
            zip.file(`${d.id}-${d.name}`, /;base64/.test(data[0]) ? data[1] : decodeURIComponent(data.slice(1).join(",")), { base64: /;base64/.test(data[0]) });
          }
          zip.file("\u0421\u043E\u0441\u0442\u0430\u0432.txt", `\u0423\u0427\u0415\u0411\u041D\u042B\u0419 \u041F\u0410\u041A\u0415\u0422. \u0414\u0435\u043B\u043E ${c2.id}. \u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u044E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u043D\u043E\u0441\u0442\u044C \u043F\u0435\u0440\u0435\u0434 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u0435\u043C.
${packetFiles(getState(), r2).map((d) => d.name).join("\n")}`);
          downloadBytes(`demo-case-${r2.account}.zip`, zip.generate({ type: "uint8array", compression: "DEFLATE" }), "application/zip");
          return;
        }
        return edit(kind2, r2, Number(el.dataset.index));
      }
      const r = getRow(context.id), kind = context.kind, c = currentCase(r);
      if (kind === "demo") demoEvent(getState(), r, context.event);
      if (kind === "signDemoAgreement") {
        if (!$("#signedDemoAgreement").checked) throw Error("\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0443\u0447\u0435\u0431\u043D\u043E\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u0438\u0435");
        signDemoAgreement(r);
      }
      if (kind === "receiveExecution") {
        if (!$("#receivedDemoExecution").checked) throw Error("\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u0432 \u0434\u0435\u043C\u043E \u0438\u043B\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u0435 \u0444\u0430\u0439\u043B");
        if (c.stage !== "\u0418\u0441\u043A" || c.legal?.status !== "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u0435") throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u0443\u0439\u0442\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u0441\u0443\u0434\u0430");
        demoReceivedDocument(r, "enforcement", "\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442");
        audit(r, "\u041F\u043E\u043B\u0443\u0447\u0435\u043D \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442", "\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u044D\u043A\u0437\u0435\u043C\u043F\u043B\u044F\u0440");
      }
      if (kind === "reworkPackage") reworkCasePackage(r, $("#reworkNote").value);
      if (kind === "docxTemplate") {
        if (getRole() !== "lawyer") throw Error("\u041D\u0443\u0436\u043D\u0430 \u0440\u043E\u043B\u044C \u044E\u0440\u0438\u0441\u0442\u0430");
        const f = $("#docxFile").files[0], key = $("#docxKind").value;
        if (!f || !f.name.endsWith(".docx") || f.size > 500 * 1024) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 DOCX \u0434\u043E 500 \u041A\u0411");
        const bytes = new Uint8Array(await f.arrayBuffer());
        renderDocx(draftDocument(r, key), docxDeps(), bytes);
        let binary = "";
        for (const b of bytes) binary += String.fromCharCode(b);
        getState().documentTemplates ||= {};
        getState().documentTemplates[key] = btoa(binary);
        audit(r, "\u0428\u0430\u0431\u043B\u043E\u043D DOCX \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D", key);
      }
      if (kind === "draft") {
        if (context.draft.status === "sent") {
          close();
          return;
        }
        saveDraft(r, context.draft, $("#draftText").value, context.draftId);
        audit(r, "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D", context.draft.title);
      }
      if (kind === "review") requestReview(r, $("#reviewDue").value, $("#reviewReason").value);
      if (kind === "resolve") {
        if (getRole() !== "accountant") throw Error("\u041D\u0443\u0436\u043D\u0430 \u0440\u043E\u043B\u044C \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0430");
        const note = $("#reviewResult").value.trim();
        if (!note) throw Error("\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442");
        if (r.caseBalanceConflict || r.unallocated > 0 || days(r.asOf) > 7) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u0441\u0442\u0440\u0430\u043D\u0438\u0442\u0435 \u0440\u0430\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u0434\u0430\u043D\u043D\u044B\u0445");
        if (r.disputed && !$("#disputeResolved")?.checked) throw Error("\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0439");
        r.disputed = false;
        if (r.reviewTask?.status === "open") resolveReview(r, note);
        else audit(r, "\u0421\u0432\u0435\u0440\u043A\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430", note);
      }
      if (kind === "balances") reconcileCases(r, r.cases.map((c2, i) => ({ id: c2.id, ...readParts(`case${i}`) })));
      if (kind === "newCase") {
        const c2 = createCase(r, $("#newPeriod").value, readParts("new"));
        audit(r, "\u0421\u043E\u0437\u0434\u0430\u043D\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0435 \u0434\u0435\u043B\u043E", `${c2.id} \xB7 ${c2.period}`);
      }
      if (kind === "closeCase") {
        changeStage(r, "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E", $("#closeReason").value);
        ensureDocument(r, "closure");
        ensureDocument(r, "paymentStatement");
      }
      if (kind === "transition") transitionCase(r, $("#nextStage").value, $("#transitionReason").value);
      if (kind === "outcome") recordContactResult(r, $("#contactResult").value, $("#contactNote").value, $("#contactDue").value);
      if (kind === "legal") recordLegalResult(r, { number: $("#legalNumber").value, date: $("#legalDate").value, status: $("#legalStatus").value, note: $("#legalNote").value, nextDate: $("#legalDue").value }, { simulateDocument: $("#receivedDemoDocument").checked });
      if (kind === "agreement") {
        if (c.schedule.some((x) => x.paid)) throw Error("\u0413\u0440\u0430\u0444\u0438\u043A \u0441 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u043C\u0438 \u043F\u043B\u0430\u0442\u0435\u0436\u0430\u043C\u0438 \u043D\u0435\u043B\u044C\u0437\u044F \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C");
        const number = $("#agreementNumber").value, date2 = $("#agreementDate").value, schedule = [...document.querySelectorAll(".schedule-row")].map((el2) => ({ date: el2.querySelector("[data-schedule-date]").value, amount: cents(el2.querySelector("[data-schedule-amount]").value) }));
        const backup = structuredClone(r);
        try {
          if ($("#agreementMode").value === "proposal") {
            saveAgreementProposal(r, number, date2, schedule);
            prepareCasePackage(r);
          } else {
            const file2 = $("#agreementFile")?.files[0];
            if (file2) {
              if (file2.size > 500 * 1024 || !["application/pdf", "text/plain", "image/png", "image/jpeg"].includes(file2.type)) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 PDF, TXT, PNG \u0438\u043B\u0438 JPEG \u0434\u043E 500 \u041A\u0411");
              const data = await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(fr.result);
                fr.onerror = reject;
                fr.readAsDataURL(file2);
              });
              c.documents.push({ id: crypto.randomUUID(), kind: "agreement", name: file2.name, size: file2.size, data });
            }
            saveAgreement(r, number, date2, schedule);
          }
        } catch (err) {
          Object.assign(r, backup);
          throw err;
        }
      }
      if (kind === "installment") markInstallment(r, context.index, [...document.querySelectorAll("[data-pay-index]:checked")].map((x) => Number(x.dataset.payIndex)));
      if (kind === "owners") saveOwners(r, $("#owners").value.trim().split("\n").map((line) => {
        const [name, share] = line.split(";");
        return { name: name?.trim(), share: Number(share) };
      }));
      if (kind === "monthly") {
        const parsed = window.Papa.parse($("#monthly").value, { header: true, delimiter: ";", skipEmptyLines: true });
        if (parsed.errors.length) throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 CSV");
        saveMonthly(r, parsed.data);
      }
      if (kind === "previous") {
        const old = getRow($("#previousAccount").value), name = $("#previousName").value.trim(), reason = $("#previousReason").value.trim();
        if (!old || !name || !reason || old.building !== r.building || String(old.flat) !== String(r.flat)) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0440\u0435\u0436\u043D\u0438\u0439 \u041B\u0421 \u0442\u043E\u0433\u043E \u0436\u0435 \u043F\u043E\u043C\u0435\u0449\u0435\u043D\u0438\u044F, \u0438\u043C\u044F \u0438 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435");
        if (r.ownerHistory.some((x) => x.account === old.account)) throw Error("\u0421\u0432\u044F\u0437\u044C \u0443\u0436\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430");
        r.ownerHistory.push({ account: old.account, name, reason });
        audit(r, "\u041F\u0440\u0435\u0436\u043D\u0438\u0439 \u041B\u0421 \u0441\u0432\u044F\u0437\u0430\u043D", old.account);
      }
      if (["uploadHouse", "uploadCase"].includes(kind)) {
        const file2 = $("#caseFile").files[0], fileKind = $("#fileKind").value;
        if (!file2 || file2.size > 500 * 1024 || !["application/pdf", "text/plain", "image/png", "image/jpeg"].includes(file2.type)) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 PDF, TXT, PNG \u0438\u043B\u0438 JPEG \u0434\u043E 500 \u041A\u0411");
        const data = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = reject;
          fr.readAsDataURL(file2);
        });
        const doc = { id: crypto.randomUUID(), name: file2.name, size: file2.size, kind: fileKind, data };
        if (kind === "uploadHouse") {
          getState().houseDocuments ||= {};
          const key = JSON.stringify([r.company, r.building]);
          (getState().houseDocuments[key] ||= []).push({ ...doc, house: true });
        } else c.documents.push(doc);
        if (kind === "uploadCase" && fileKind === "agreement" && c.agreementProposal && !c.agreement) saveAgreement(r, c.agreementProposal.number, c.agreementProposal.date, c.schedule);
        audit(r, "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D", file2.name);
      }
      if (kind === "taskDone") {
        if (!$("#taskResult").value.trim()) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442");
        r.task.status = "done";
        audit(r, "\u0417\u0430\u0434\u0430\u0447\u0430 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430", $("#taskResult").value);
      }
      if (kind === "follow") {
        const note = $("#followNote").value.trim(), due = $("#followDate").value;
        if (!note || !due || due < TODAY) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438 \u0434\u0430\u0442\u0443");
        r.promise = null;
        r.task = { text: note, due, owner: r.owner, status: "open" };
        audit(r, "\u041E\u043F\u043B\u0430\u0442\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u0430", note);
      }
      save2();
      close();
      render2();
      openDrawer2(r.id, kind === "draft" ? "documents" : "overview");
      toast2("\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u0432 \u0434\u0435\u043C\u043E");
    } catch (err) {
      const host = $("#workError");
      if (host) host.innerHTML = `<div class="error" role="alert">${esc(err.message)}</div>`;
      else toast2(err.message);
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.dataset.caseSelect) {
      const r = getRow(e.target.dataset.caseSelect);
      selectCase(r, e.target.value);
      save2();
      render2();
      openDrawer2(r.id);
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "legalStatus") {
      $("#legalNext").textContent = "\u0414\u0430\u043B\u0435\u0435: " + (LEGAL_RESULTS[currentCase(getRow(context.id)).stage]?.[e.target.value] || "");
      $("#receivedDemoLabel").hidden = !["\u041F\u043E\u043B\u0443\u0447\u0435\u043D \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442", "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u0435"].includes(e.target.value);
      $("#receivedDemoDocument").checked = false;
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "agreementMode") $("#agreementFileLabel").hidden = e.target.value !== "signed";
  });
  return { open: (kind, id, index) => edit(kind, getRow(id), index) };
}

// dist/interaction-flow.mjs
var NOTIFICATION_CHANNELS = { app: "\u041C\u043E\u0431\u0438\u043B\u044C\u043D\u043E\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435", email: "Email", max: "MAX", robot: "\u0413\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0439 \u0440\u043E\u0431\u043E\u0442", notice: "\u041F\u0435\u0447\u0430\u0442\u044C", receipt: "\u0412 \u043A\u0432\u0438\u0442\u0430\u043D\u0446\u0438\u0438" };
function notificationMessage(item, channel) {
  if (!item.doc) return "";
  if (["notice", "receipt"].includes(channel)) return item.doc.text;
  const d = item.doc.data;
  const text = `${d.company}. \u041B\u0438\u0446\u0435\u0432\u043E\u0439 \u0441\u0447\u0451\u0442 ${d.account}. \u041F\u043E \u0434\u0430\u043D\u043D\u044B\u043C \u043D\u0430 ${d.date} \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0437\u0430 ${d.period}: ${money(d.remaining)}. \u0417\u0430 \u0443\u0441\u043B\u0443\u0433\u0438 ${money(d.principal)}, \u043F\u0435\u043D\u0438 ${money(d.penalty)}, \u0433\u043E\u0441\u043F\u043E\u0448\u043B\u0438\u043D\u0430 ${money(d.fee)}. \u0415\u0441\u043B\u0438 \u0443\u0436\u0435 \u043E\u043F\u043B\u0430\u0442\u0438\u043B\u0438 \u0438\u043B\u0438 \u043D\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u043D\u044B \u0441 \u0440\u0430\u0441\u0447\u0451\u0442\u043E\u043C, \u0441\u043E\u043E\u0431\u0449\u0438\u0442\u0435 \u0432 \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0449\u0443\u044E \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044E.`;
  return channel === "robot" ? `\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0439: \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u0431\u0435\u0434\u0438\u0442\u044C\u0441\u044F, \u0447\u0442\u043E \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u0442 \u0432\u043B\u0430\u0434\u0435\u043B\u0435\u0446 \u043B\u0438\u0446\u0435\u0432\u043E\u0433\u043E \u0441\u0447\u0451\u0442\u0430.
\u041F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F: ${text}
\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C, \u043A\u043E\u0433\u0434\u0430 \u043F\u043B\u0430\u043D\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u043E\u043F\u043B\u0430\u0442\u0430 \u0438\u043B\u0438 \u043D\u0443\u0436\u043D\u0430 \u043B\u0438 \u0441\u0432\u044F\u0437\u044C \u0441 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u043C.` : text;
}
function previewNotifications(rows, targets, channel = "app") {
  if (!NOTIFICATION_CHANNELS[channel]) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u0430\u043D\u0430\u043B \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F");
  const originals = {}, copies = {}, items = [];
  for (const key of [...new Set(targets.map((t) => JSON.stringify(t)))]) {
    const [id, caseId] = JSON.parse(key), source = rows.find((r2) => r2.id === id);
    if (!source) throw Error("\u041B\u0438\u0446\u0435\u0432\u043E\u0439 \u0441\u0447\u0451\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    originals[id] ??= JSON.stringify(source);
    copies[id] ??= structuredClone(source);
    const r = structuredClone(copies[id]);
    let reason = "", doc;
    try {
      selectCase(r, caseId || null);
      if (caseId && currentCase(r).stage !== "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435") throw Error("\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043E \u0434\u043E\u043B\u0433\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043D\u0430 \u0434\u043E\u0441\u0443\u0434\u0435\u0431\u043D\u043E\u043C \u044D\u0442\u0430\u043F\u0435");
      const matching = r.events.filter((e) => e.caseId === caseId && e.status !== "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)");
      reason = eligible({ ...r, events: matching }, channel);
      if (reason) throw Error(reason);
      if (!caseId) createCase(r, r.billing ? billingPeriod(billingLines(r)) : r.period, unassigned(r));
      if (amount(currentCase(r).remaining) <= 0) throw Error("\u041F\u043E \u0434\u0435\u043B\u0443 \u043D\u0435\u0442 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438");
      doc = ensureDocument(r, channel === "receipt" ? "demand" : "notice");
      if (doc.missing.length) throw Error("\u041D\u0443\u0436\u043D\u043E \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u044C: " + doc.missing.join("; "));
    } catch (error) {
      reason = error.message;
    }
    if (!reason) copies[id] = r;
    items.push({ id, caseId: currentCase(r)?.id || null, account: r.account, address: `${r.building}, \u043A\u0432. ${r.flat}`, reason, doc });
  }
  return { channel, items, originals, copies };
}
function previewNotificationBatch(rows, targets, channels) {
  const selected2 = [...new Set(channels)];
  if (selected2.some((c) => !NOTIFICATION_CHANNELS[c])) throw Error("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u043A\u0430\u043D\u0430\u043B");
  const copies = structuredClone(rows), originals = {}, items = [], resolved = /* @__PURE__ */ new Map();
  for (const [id] of targets) {
    const r = rows.find((r2) => r2.id === id);
    if (!r) throw Error("\u041B\u0438\u0446\u0435\u0432\u043E\u0439 \u0441\u0447\u0451\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    originals[id] = JSON.stringify(r);
  }
  for (const channel of selected2) {
    const actual = targets.map(([id, cid]) => [id, cid || resolved.get(id) || null]);
    const p = previewNotifications(copies, actual, channel);
    confirmNotifications(copies, p);
    for (const item of p.items) {
      items.push({ ...item, channel });
      if (!item.reason) resolved.set(item.id, item.caseId);
    }
  }
  return { channels: selected2, items, originals, copies };
}
function confirmNotificationBatch(rows, p) {
  for (const [id, snapshot] of Object.entries(p.originals)) if (JSON.stringify(rows.find((r) => r.id === id)) !== snapshot) throw Error("\u0414\u0430\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0437\u0430\u043D\u043E\u0432\u043E.");
  const allowed = p.items.filter((x) => !x.reason);
  for (const id of new Set(allowed.map((x) => x.id))) Object.assign(rows.find((r) => r.id === id), p.copies.find((r) => r.id === id));
  return allowed.length;
}
function confirmNotifications(rows, preview2) {
  for (const [id, snapshot] of Object.entries(preview2.originals)) if (JSON.stringify(rows.find((r) => r.id === id)) !== snapshot) throw Error("\u0414\u0430\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0437\u0430\u043D\u043E\u0432\u043E.");
  const changed = /* @__PURE__ */ new Set();
  let n = 0;
  for (const item of preview2.items.filter((x) => !x.reason)) {
    const r = preview2.copies[item.id];
    selectCase(r, item.caseId);
    const d = currentCase(r).drafts.find((d2) => d2.id === item.doc.id);
    if (d.status !== "sent") {
      documentStatus(r, d.id, "prepared");
      documentStatus(r, d.id, "sent");
    }
    for (const e of r.events) if (e.caseId === item.caseId && e.action === preview2.channel && e.status === "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)") e.status = "\u0417\u0430\u043C\u0435\u043D\u0435\u043D\u043E \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u043E\u0439 (\u0434\u0435\u043C\u043E)";
    const print = ["notice", "receipt"].includes(preview2.channel);
    r.events.unshift({ id: crypto.randomUUID(), caseId: item.caseId, documentId: d.id, action: preview2.channel, label: ACTIONS[preview2.channel], scope: noticeScope(r), at: `${TODAY}T12:00:00`, date: TODAY, status: print ? "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0434\u043B\u044F \u043F\u0435\u0447\u0430\u0442\u0438 (\u0434\u0435\u043C\u043E)" : "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", amount: amount(currentCase(r).remaining), message: notificationMessage(item, preview2.channel), note: "\u0423\u0447\u0435\u0431\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435. \u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u0438 \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B." });
    r.next = print ? "\u0420\u0430\u0441\u043F\u0435\u0447\u0430\u0442\u0430\u0442\u044C \u0438 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u0435" : "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0443 \u0438 \u043E\u043F\u043B\u0430\u0442\u0443";
    r.nextDate = TODAY;
    currentCase(r).communicationNextDate = TODAY;
    changed.add(item.id);
    n++;
  }
  for (const id of changed) Object.assign(rows.find((r) => r.id === id), preview2.copies[id]);
  return n;
}
function previewEnforcement(r, recipient = "bank") {
  if (!["bank", "fssp"].includes(recipient)) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0431\u0430\u043D\u043A \u0438\u043B\u0438 \u0424\u0421\u0421\u041F");
  const c = currentCase(r);
  if (c?.legal?.status === "\u041E\u0442\u043C\u0435\u043D\u0451\u043D \u043F\u0440\u0438\u043A\u0430\u0437") throw Error("\u041E\u0442\u043C\u0435\u043D\u0451\u043D\u043D\u044B\u0439 \u043F\u0440\u0438\u043A\u0430\u0437 \u043D\u0435\u043B\u044C\u0437\u044F \u043F\u0440\u0435\u0434\u044A\u044F\u0432\u0438\u0442\u044C \u043A \u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044E");
  if (!["\u041F\u0440\u0438\u043A\u0430\u0437", "\u0418\u0441\u043A", "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B"].includes(c?.stage) || !c.documents.some((d) => !d.archived && (c.stage === "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B" ? ["order", "enforcement"].includes(d.kind) : d.kind === (c.stage === "\u041F\u0440\u0438\u043A\u0430\u0437" ? "order" : "enforcement")))) throw Error("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u0438\u043B\u043E\u0436\u0438\u0442\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u044B\u0439 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442");
  if (c.stage === "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B" && c.legal?.status !== "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0451\u043D \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442") throw Error("\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0443\u0436\u0435 \u043F\u0440\u0435\u0434\u044A\u044F\u0432\u043B\u0435\u043D; \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u0443\u0439\u0442\u0435 \u0435\u0433\u043E \u0432\u043E\u0437\u0432\u0440\u0430\u0442");
  const blocked = eligible({ ...r, events: [] }, "court");
  if (blocked) throw Error(blocked);
  if (amount(c.remaining) <= 0) throw Error("\u0414\u043E\u043B\u0433 \u043F\u043E \u0434\u0435\u043B\u0443 \u043F\u043E\u0433\u0430\u0448\u0435\u043D");
  const draft = draftDocument(r, "enforcementApplication");
  draft.data.recipient = recipient;
  draft.text = draft.text.replace("\u0410\u0434\u0440\u0435\u0441\u0430\u0442: \u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0431\u0430\u043D\u043A.", `\u0410\u0434\u0440\u0435\u0441\u0430\u0442: ${recipient === "bank" ? "\u0423\u0447\u0435\u0431\u043D\u044B\u0439 \u0431\u0430\u043D\u043A" : "\u0423\u0447\u0435\u0431\u043D\u043E\u0435 \u043E\u0442\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0424\u0421\u0421\u041F"}.`);
  if (draft.missing.length) throw Error("\u041D\u0443\u0436\u043D\u043E \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u044C: " + draft.missing.join("; "));
  return { id: r.id, caseId: c.id, recipient, snapshot: JSON.stringify(r), draft };
}
function confirmEnforcement(r, p) {
  if (JSON.stringify(r) !== p.snapshot) throw Error("\u0414\u0430\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440.");
  const copy = structuredClone(r), c = currentCase(copy), doc = saveDraft(copy, p.draft, p.draft.text);
  documentStatus(copy, doc.id, "prepared");
  documentStatus(copy, doc.id, "sent");
  if (c.legal?.status) (c.legalHistory ??= []).push({ ...c.legal, stage: c.stage });
  changeStage(copy, "\u041F\u0440\u0438\u0441\u0442\u0430\u0432\u044B");
  c.legal = { ...c.legal, note: "\u041F\u0440\u0438\u043D\u044F\u0442\u0438\u0435 \u0430\u0434\u0440\u0435\u0441\u0430\u0442\u043E\u043C \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E.", recipient: p.recipient, status: `\u041F\u0440\u0435\u0434\u044A\u044F\u0432\u043B\u0435\u043D\u043E ${p.recipient === "bank" ? "\u0432 \u0431\u0430\u043D\u043A" : "\u0432 \u0424\u0421\u0421\u041F"} (\u0434\u0435\u043C\u043E)`, next: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0440\u0438\u043D\u044F\u0442\u0438\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430", nextDate: TODAY };
  copy.task = null;
  copy.next = c.legal.next;
  copy.nextDate = TODAY;
  copy.events.unshift({ id: crypto.randomUUID(), at: `${TODAY}T12:00:00`, action: "court", caseId: c.id, documentId: doc.id, label: c.legal.status, status: "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", note: "\u0417\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0438\u0437 \u0434\u0430\u043D\u043D\u044B\u0445 \u0434\u0435\u043B\u0430. \u0412\u043D\u0435\u0448\u043D\u044F\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0430." });
  Object.assign(r, copy);
  return doc;
}

// dist/interaction-ui.mjs
function installInteractions({ getState, getRole, modal: modal2, save: save2, render: render2, close, toast: toast2, openDrawer: openDrawer2 }) {
  let pending = null, targets = [], index = 0;
  const $3 = (s) => document.querySelector(s);
  function notify(nextTargets, channels = ["app"], selectedIndex = 0) {
    if (getRole() !== "lawyer") throw Error("\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442");
    targets = nextTargets;
    index = selectedIndex;
    const p = previewNotificationBatch(getState().rows, targets, channels);
    pending = { kind: "notification", p };
    const allowed = p.items.filter((x) => !x.reason), item = p.items[index] || p.items[0];
    const selectedRow = item && p.copies.find((r) => r.id === item.id), selectedCase = selectedRow?.cases.find((c) => c.id === item.caseId);
    modal2(
      "\u0423\u0432\u0435\u0434\u043E\u043C\u0438\u0442\u044C \u043E \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438",
      `\u041A \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 / \u043F\u0435\u0447\u0430\u0442\u0438: ${allowed.length} \xB7 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E: ${p.items.length - allowed.length}`,
      `<fieldset class="channel-choices"><legend>\u041A\u0430\u043D\u0430\u043B\u044B \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F</legend><label><input type="checkbox" id="allNotificationChannels" ${channels.length === Object.keys(NOTIFICATION_CHANNELS).length ? "checked" : ""}> \u0412\u0441\u0435 \u043A\u0430\u043D\u0430\u043B\u044B</label>${Object.entries(NOTIFICATION_CHANNELS).map(([k, l]) => `<label><input type="checkbox" data-notification-channel="${k}" ${channels.includes(k) ? "checked" : ""}> ${l}</label>`).join("")}</fieldset>
      <div class="delivery-list">${p.items.map((x, i) => `<button class="delivery-item ${i === index ? "active" : ""}" data-flow-preview="${i}"><strong>${esc(NOTIFICATION_CHANNELS[x.channel])} \xB7 \u041B\u0421 ${esc(x.account)}</strong><small>${esc(x.address)} \xB7 ${esc(x.reason || "\u0413\u043E\u0442\u043E\u0432\u043E \u043A \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0435 / \u043F\u0435\u0447\u0430\u0442\u0438")}</small></button>`).join("")}</div>
      ${item?.doc ? `<h3>${item.channel === "robot" ? "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0439 \u043E\u0431\u0437\u0432\u043E\u043D\u0430" : item.channel === "notice" || item.channel === "receipt" ? "\u041F\u0435\u0447\u0430\u0442\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442" : "\u0422\u0435\u043A\u0441\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F"} \xB7 \u041B\u0421 ${esc(item.account)}</h3><pre class="document-preview">${esc(notificationMessage(item, item.channel))}</pre>` : "<p>\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u0430\u043D\u0430\u043B\u044B. \u041D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u044B \u0441 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u043E\u0439 \u043F\u0440\u0438\u0447\u0438\u043D\u043E\u0439.</p>"}
      ${item?.channel === "receipt" && selectedCase ? receiptPages({ ...selectedRow, ...selectedCase.remaining, period: selectedCase.period }) : ""}
      <p class="form-note">\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043E \u0434\u043E\u043B\u0433\u0435, \u043D\u0435 \u0432\u0435\u0441\u044C \u043F\u0430\u043A\u0435\u0442 \u0434\u0435\u043B\u0430. \u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430, \u043F\u0435\u0447\u0430\u0442\u044C \u0438 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u0443\u0447\u0438\u0442\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E. \u0422\u043E\u043B\u044C\u043A\u043E \u0442\u0435\u0441\u0442\u043E\u0432\u044B\u0435 \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u0438.</p><div id="flowError"></div>`,
      `<button class="button" data-flow-confirm ${!allowed.length ? "disabled" : ""}>\u0412\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0432 \u0434\u0435\u043C\u043E: ${allowed.length}</button>`
    );
  }
  function enforcement(id, recipient = "bank") {
    if (getRole() !== "lawyer") throw Error("\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442 \u044E\u0440\u0438\u0441\u0442");
    const r = getState().rows.find((r2) => r2.id === id), p = previewEnforcement(r, recipient);
    pending = { kind: "enforcement", p };
    modal2(
      "\u041F\u0440\u0435\u0434\u044A\u044F\u0432\u0438\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
      `\u041B\u0421 ${r.account} \xB7 ${p.caseId}`,
      `<label>\u041A\u0443\u0434\u0430 \u043F\u0440\u0435\u0434\u044A\u044F\u0432\u0438\u0442\u044C<select id="enforcementRecipient"><option value="bank" ${recipient === "bank" ? "selected" : ""}>\u0411\u0430\u043D\u043A (\u0434\u0435\u043C\u043E)</option><option value="fssp" ${recipient === "fssp" ? "selected" : ""}>\u0424\u0421\u0421\u041F (\u0434\u0435\u043C\u043E)</option></select></label><h3>\u0413\u043E\u0442\u043E\u0432\u043E\u0435 \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435</h3><pre class="document-preview">${esc(p.draft.text)}</pre><p>\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u044B\u0439 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u0443\u0436\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D \u043A \u0434\u0435\u043B\u0443. \u0415\u0433\u043E \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442 \u0441\u0438\u0441\u0442\u0435\u043C\u0430. \u041F\u0440\u0438\u043D\u044F\u0442\u0438\u0435 \u0430\u0434\u0440\u0435\u0441\u0430\u0442\u043E\u043C \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E.</p><div id="flowError"></div>`,
      '<button class="button" data-flow-confirm>\u041F\u0440\u0435\u0434\u044A\u044F\u0432\u0438\u0442\u044C \u0432 \u0434\u0435\u043C\u043E</button>'
    );
  }
  document.addEventListener("change", (e) => {
    try {
      if (e.target.dataset.notificationChannel || e.target.id === "allNotificationChannels") {
        const channels = e.target.id === "allNotificationChannels" ? e.target.checked ? Object.keys(NOTIFICATION_CHANNELS) : [] : [...document.querySelectorAll("[data-notification-channel]:checked")].map((el) => el.dataset.notificationChannel);
        notify(targets, channels, 0);
      }
      if (e.target.id === "enforcementRecipient") enforcement(pending.p.id, e.target.value);
    } catch (err) {
      toast2(err.message);
    }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="close"]')) {
      pending = null;
      targets = [];
      return;
    }
    const b = e.target.closest("[data-flow-confirm],[data-flow-preview]");
    if (!b) return;
    try {
      if (!pending) return;
      if (b.dataset.flowPreview !== void 0) return notify(targets, pending.p.channels, Number(b.dataset.flowPreview));
      if (getRole() !== "lawyer") throw Error("\u041D\u0443\u0436\u043D\u0430 \u0440\u043E\u043B\u044C \u044E\u0440\u0438\u0441\u0442\u0430");
      if (pending.kind === "notification") {
        const first = pending.p.items.find((x) => !x.reason), n = confirmNotificationBatch(getState().rows, pending.p);
        save2();
        close();
        render2();
        if (first) openDrawer2(first.id);
        toast2(`\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u0432 \u0434\u0435\u043C\u043E: ${n}. \u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430.`);
      } else {
        const r = getState().rows.find((r2) => r2.id === pending.p.id);
        confirmEnforcement(r, pending.p);
        save2();
        close();
        render2();
        openDrawer2(r.id);
        toast2("\u0417\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E. \u0414\u0435\u043B\u043E \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043E \u043D\u0430 \u044D\u0442\u0430\u043F \u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F (\u0434\u0435\u043C\u043E).");
      }
      pending = null;
    } catch (err) {
      $3("#flowError").innerHTML = `<div class="error" role="alert">${esc(err.message)}</div>`;
    }
  });
  return { notify, enforcement };
}

// dist/app.mjs
var $2 = (s) => document.querySelector(s);
var KEY = "mdo-debt-demo-v1";
var esc2 = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var icon2 = (n) => `<i data-lucide="${n}"></i>`;
var date = (s) => s ? (/* @__PURE__ */ new Date(s.slice(0, 10) + "T12:00:00")).toLocaleDateString("ru-RU") : "";
var state = seed();
var storageWarning = "";
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved?.version === 1 && Array.isArray(saved.rows) && saved.rows.every((r) => Array.isArray(r.events) && Array.isArray(r.payments) && ["principal", "penalty", "fee"].every((k) => Number.isSafeInteger(r[k]) && r[k] >= 0))) state = saved;
  else if (saved) storageWarning = "\u0421\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0434\u0435\u043C\u043E-\u0434\u0430\u043D\u043D\u044B\u0435 \u043D\u0435\u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C\u044B. \u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u043F\u0440\u0438\u043C\u0435\u0440.";
} catch {
  storageWarning = "\u0425\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044E\u0442 \u0434\u043E \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u044F \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B.";
}
state = migrate(state);
upgradeUntouchedSampleDetails(state);
if (installDemoBilling(state)) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    storageWarning = "\u0423\u0447\u0435\u0431\u043D\u044B\u0435 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B, \u043D\u043E \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E.";
  }
}
var view = "overview";
var filters = {};
var selected = /* @__PURE__ */ new Set();
var advanced = false;
var drawerId = null;
var drawerTab = "overview";
var returnFocus = null;
var preview = [];
if (installOwnerExample(state)) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    storageWarning = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0440\u0438\u043C\u0435\u0440 \u0434\u043E\u043B\u0435\u0439";
  }
}
var reportFrom = "2026-10-01";
var reportTo = TODAY;
var role = "lawyer";
var overviewScope = { company: DEMO_COMPANY, building: "", houseStatus: "" };
var STAGES2 = STAGES;
var recommendation2 = (r) => roleRecommendation(r, role);
var caseProgress2 = (c, r) => roleCaseProgress(c, r, role);
var selectedCases = /* @__PURE__ */ new Set();
var views = [["overview", "\u0421\u0432\u043E\u0434\u043A\u0430", "chart-no-axes-combined"], ["accounts", "\u0420\u0435\u0435\u0441\u0442\u0440 \u0434\u043E\u043B\u0436\u043D\u0438\u043A\u043E\u0432", "users"], ["registry", "\u0414\u0435\u043B\u0430", "folders"], ["payments", "\u041E\u043F\u043B\u0430\u0442\u044B", "wallet"]];
var workspaceViews = ["registry", "cases", "board", "communications"];
state.display ||= { notices: true, stages: true };
var options = (arr, current, empty) => `${empty ? `<option value="">${esc2(empty)}</option>` : ""}${arr.map((v) => `<option value="${esc2(v)}" ${current === v ? "selected" : ""}>${esc2(v)}</option>`).join("")}`;
var badge = (text, tone = "") => `<span class="badge ${tone}">${esc2(text)}</span>`;
var visible = () => workRows(filterRows(state.rows, { ...filters, stage: "" }), { ...filters, debtOnly: view === "accounts" || filters.debtOnly }).filter((r) => (!filters.houseStatus || (r.houseStatus || "unknown") === filters.houseStatus) && (!filters.stage || stagePortions(r).some((p) => p.stage === filters.stage && (p.id || p.amount > 0))) && (view !== "work" || queueFor(r)));
var row = (id) => state.rows.find((r) => r.id === id);
var initIcons = () => window.lucide?.createIcons();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    throw Error("\u0425\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E; \u043D\u0435 \u0437\u0430\u043A\u0440\u044B\u0432\u0430\u0439\u0442\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443.");
  }
}
function toast(text) {
  $2("#toast").textContent = text;
  $2("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $2("#toast").classList.remove("show"), 4500);
}
function render() {
  $2("#sideNav").innerHTML = [...views, ...role === "accountant" ? [["sources", "\u0418\u043C\u043F\u043E\u0440\u0442 \u0434\u0430\u043D\u043D\u044B\u0445", "database"]] : []].map(([v, label, i]) => `<button data-view="${v}" class="side-nav ${v === view || v === "registry" && workspaceViews.includes(view) ? "active" : ""}">${icon2(i)}${label}</button>`).join("");
  $2("#tabs").innerHTML = [...views, ...role === "accountant" ? [["sources", "\u0418\u043C\u043F\u043E\u0440\u0442 \u0434\u0430\u043D\u043D\u044B\u0445", "database"]] : []].map(([v, label, i]) => `<button data-view="${v}" class="tab ${v === view || v === "registry" && workspaceViews.includes(view) ? "active" : ""}">${icon2(i)}${label}</button>`).join("");
  $2("#importTop").hidden = role !== "accountant";
  $2("#metrics").hidden = true;
  $2("#roleHost").innerHTML = `<label>\u0420\u043E\u043B\u044C \u0432 \u0434\u0435\u043C\u043E<select id="roleSelect"><option value="lawyer" ${role === "lawyer" ? "selected" : ""}>\u042E\u0440\u0438\u0441\u0442</option><option value="accountant" ${role === "accountant" ? "selected" : ""}>\u0420\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A</option></select></label>`;
  $2(".side-bottom").textContent = role === "lawyer" ? "\u042E\u0440\u0438\u0441\u0442 \xB7 \u0440\u0430\u0431\u043E\u0442\u0430 \u0441 \u0434\u0435\u043B\u0430\u043C\u0438" : "\u0420\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A \xB7 \u0443\u0447\u0451\u0442 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0439";
  renderContent();
  initIcons();
}
function filterBar() {
  return `<div class="filters"><div class="search">${icon2("search")}<input id="search" aria-label="\u041F\u043E\u0438\u0441\u043A \u0434\u043E\u043B\u0436\u043D\u0438\u043A\u0430" placeholder="\u0410\u0434\u0440\u0435\u0441, \u041B\u0421 \u0438\u043B\u0438 \u0434\u0435\u043B\u043E" value="${esc2(filters.search || "")}"></div><select data-filter="building" aria-label="\u0414\u043E\u043C">${options([...new Set(state.rows.map((r) => r.building))], filters.building, "\u0412\u0441\u0435 \u0434\u043E\u043C\u0430")}</select><select data-filter="stage" aria-label="\u0421\u0442\u0430\u0434\u0438\u044F">${options(STAGES2, filters.stage, "\u0412\u0441\u0435 \u044D\u0442\u0430\u043F\u044B")}</select><select data-filter="company" aria-label="\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0449\u0430\u044F \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044F">${options([...new Set(state.rows.map((r) => r.company))], filters.company, "\u0412\u0441\u0435 \u0423\u041A")}</select><button class="icon-button" data-action="filters" title="\u0421\u0443\u043C\u043C\u0430, \u0441\u0440\u043E\u043A, \u043F\u043E\u0434\u044A\u0435\u0437\u0434 \u0438 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0430" aria-label="\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u044B" aria-expanded="${advanced}">${icon2("sliders-horizontal")}</button></div>${advanced ? `<div class="advanced"><label>\u041F\u043E\u0434\u044A\u0435\u0437\u0434<select data-filter="entrance">${options([...new Set(state.rows.map((r) => r.entrance).filter(Boolean))], filters.entrance, "\u0412\u0441\u0435")}</select></label><label>\u0414\u043E\u043B\u0433 \u043E\u0442, \u20BD<input type="number" min="0" data-filter="minDebt" value="${esc2(filters.minDebt || "")}"></label><label>\u0414\u043E\u043B\u0433 \u0434\u043E, \u20BD<input type="number" min="0" data-filter="maxDebt" value="${esc2(filters.maxDebt || "")}"></label><label>\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430 \u043E\u0442, \u0434\u043D\u0435\u0439<input type="number" min="0" data-filter="minAge" value="${esc2(filters.minAge || "")}"></label><label>\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435<select data-filter="notice"><option value="">\u0412\u0441\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B</option>${Object.entries(NOTICE_LABELS).map(([v, l]) => `<option value="${v}" ${filters.notice === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label>\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439<select data-filter="owner">${options([...new Set(state.rows.map((r) => r.owner))], filters.owner, "\u0412\u0441\u0435")}</select></label><label>\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F<select data-filter="category">${options(CATEGORIES, filters.category, "\u0412\u0441\u0435")}</select></label></div>` : ""}${Object.values(filters).some(Boolean) ? `<div class="filter-summary"><span>${filters.queue === "notify" ? "\u041A \u043F\u0435\u0440\u0432\u043E\u043C\u0443 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044E \xB7 " : filters.queue === "check" ? "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u0432\u0435\u0440\u043A\u0430 \xB7 " : filters.queue === "paid" ? "\u041F\u043E\u0433\u0430\u0448\u0435\u043D\u043D\u044B\u0435 \xB7 " : ""}${filters.notice ? NOTICE_LABELS[filters.notice] + " \xB7 " : ""}${filters.stage ? esc2(filters.stage) + " \xB7 " : ""}\u0412\u044B\u0431\u0440\u0430\u043D\u043E \u043F\u043E \u0443\u0441\u043B\u043E\u0432\u0438\u044F\u043C: ${visible().length} \u041B\u0421</span><button class="button ghost small" data-action="clearFilters">\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C</button></div>` : ""}`;
}
function segments() {
  const scope = filterRows(state.rows, { company: filters.company, building: filters.building });
  return `<div class="segments">${STAGES2.map((stage) => `<button class="segment ${filters.stage === stage ? "active" : ""}" data-stage-link="${stage}">${stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" ? "\u0415\u0449\u0451 \u0431\u0435\u0437 \u0434\u0435\u043B\u0430" : stage} \xB7 ${stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" ? scope.filter((r) => amount(unassigned(r)) > 0).length : scope.reduce((n, r) => n + r.cases.filter((c) => c.stage === stage).length, 0)}</button>`).join("")}</div>`;
}
function selectedBar() {
  return selected.size ? `<div class="selection-bar"><strong>\u0412\u044B\u0431\u0440\u0430\u043D\u043E: ${selected.size}</strong>${role === "lawyer" ? `<button class="button small" data-action="chooseChannel">${icon2("send")} \u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435</button>` : ""}<button class="icon-button" data-action="clearSelection" title="\u0421\u043D\u044F\u0442\u044C \u0432\u044B\u0431\u043E\u0440" aria-label="\u0421\u043D\u044F\u0442\u044C \u0432\u044B\u0431\u043E\u0440">${icon2("x")}</button></div>` : "";
}
function renderContent() {
  STAGES2 = visibleStages(filterRows(state.rows, { company: filters.company, building: filters.building }));
  if (filters.stage === "\u0421\u0443\u0434: \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C" && !STAGES2.includes(filters.stage)) {
    filters.stage = "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430";
    if (workspaceViews.includes(view)) view = "registry";
  }
  if (workspaceViews.includes(view) && !filters.stage) {
    filters.stage = "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430";
    view = "registry";
  }
  $2(".heading h1").textContent = workspaceViews.includes(view) ? STAGE_INFO[filters.stage]?.title || "\u0414\u0435\u043B\u0430" : view === "accounts" ? "\u0420\u0435\u0435\u0441\u0442\u0440 \u0434\u043E\u043B\u0436\u043D\u0438\u043A\u043E\u0432" : view === "overview" ? "\u0421\u0432\u043E\u0434\u043A\u0430" : view === "payments" ? "\u041E\u043F\u043B\u0430\u0442\u044B" : "\u0418\u043C\u043F\u043E\u0440\u0442 \u0434\u0430\u043D\u043D\u044B\u0445";
  if (view === "overview") $2("#content").innerHTML = overview(state.rows, reportFrom, reportTo, overviewScope);
  if (view === "overview") {
    const notices = $2("#content .notification-strip");
    if (notices) notices.closest(".overview-section").remove();
  }
  if (view === "work") {
    renderRegistry();
    $2("#content").insertAdjacentHTML("afterbegin", queueOverview(state.rows));
  }
  if (view === "registry") renderRegistry();
  if (view === "cases") renderCaseList();
  if (view === "board") renderBoard();
  if (view === "communications") renderCommunications();
  if (view === "payments") renderPayments();
  if (view === "sources") renderSources();
  if (view === "accounts") {
    renderRegistry();
    $2("#content .segments")?.remove();
    $2("#content .section-head h2").textContent = "\u0414\u043E\u043B\u0436\u043D\u0438\u043A\u0438";
    $2('#content [data-view="board"]')?.remove();
    [...$2("#content tbody").rows].forEach((tr, i) => {
      const r = visible()[i], w = workRecord(r), c = filters.stage ? r.cases.find((c2) => c2.stage === filters.stage) : currentCase(w), p = caseProgress2(c, r);
      tr.cells[3].innerHTML = [...new Set(stagePortions(r).map((x) => x.stage))].map((s) => badge(s)).join("") || "\u0414\u0435\u043B \u043D\u0435\u0442";
      const action = tr.cells[4].querySelector("button");
      action.innerHTML = `${esc2(p.next)}<small>${esc2(p.label)}</small>`;
      if (c) action.dataset.caseId = c.id;
    });
    $2("#content .table-end span").textContent = `\u0412 \u0432\u044B\u0431\u043E\u0440\u043A\u0435 ${visible().length} \u041B\u0421 \xB7 \u043E\u0441\u0442\u0430\u0442\u043E\u043A ${money(visible().reduce((s, r) => s + total(r), 0))}`;
  }
  if (view === "sources" && role !== "accountant") {
    for (const el of $2("#content").querySelectorAll('#importFile,[data-action="sampleImport"]')) el.disabled = true;
    $2("#content").insertAdjacentHTML("afterbegin", '<div class="notice">\u042E\u0440\u0438\u0441\u0442 \u043F\u0440\u043E\u0441\u043C\u0430\u0442\u0440\u0438\u0432\u0430\u0435\u0442 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438. \u0420\u0435\u0435\u0441\u0442\u0440\u044B \u0438 \u0440\u0430\u0441\u0447\u0451\u0442\u044B \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u0442 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A.</div>');
  }
  if (["registry", "work", "cases", "board"].includes(view)) $2("#content .filters")?.insertAdjacentHTML("beforeend", `<select data-filter="houseStatus" aria-label="\u0421\u0442\u0430\u0442\u0443\u0441 \u0434\u043E\u043C\u0430"><option value="">\u0412\u0441\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u044B \u0434\u043E\u043C\u043E\u0432</option><option value="active" ${filters.houseStatus === "active" ? "selected" : ""}>\u0412 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0438</option><option value="departed" ${filters.houseStatus === "departed" ? "selected" : ""}>\u0412\u044B\u0431\u044B\u0432\u0448\u0438\u0435 \u0434\u043E\u043C\u0430</option><option value="unknown" ${filters.houseStatus === "unknown" ? "selected" : ""}>\u0421\u0442\u0430\u0442\u0443\u0441 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D</option></select>`);
  $2("#content .advanced")?.insertAdjacentHTML("beforeend", `<label>\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430 \u0434\u043E, \u0434\u043D\u0435\u0439<input type="number" min="0" data-filter="maxAge" value="${esc2(filters.maxAge ?? "")}"></label>`);
  if (view === "work") $2("#content .segments")?.remove();
  if (view === "registry" || view === "work") {
    for (const [i, tr] of [...$2("#content tbody").rows].entries()) {
      const r = visible()[i];
      tr.cells[3].innerHTML = [...new Set(stagePortions(r).map((x) => x.stage))].map((s) => badge(s, s === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" ? "green" : "pink")).join("") + noticeBadge(r);
    }
    const caption = $2("#content .filter-summary span");
    if (caption && filters.queue) caption.textContent = `${QUEUES[filters.queue]} \xB7 \u041F\u043E \u0443\u0441\u043B\u043E\u0432\u0438\u044F\u043C: ${visible().length} \u041B\u0421`;
    if (filters.stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430") {
      $2("#content th:nth-child(3)").textContent = "\u0414\u043E\u043B\u0433 \u0432\u043D\u0435 \u0434\u0435\u043B";
      [...$2("#content tbody").rows].forEach((tr, i) => {
        const r = visible()[i];
        tr.cells[2].innerHTML = `${money(amount(unassigned(r)))}<small>\u0412\u0441\u0435\u0433\u043E \u043F\u043E \u041B\u0421: ${money(total(r))}</small><small>\u041D\u0430 ${date(r.asOf)}</small>`;
      });
      $2("#content .table-end span").textContent = `${visible().length} \u041B\u0421 \xB7 \u0434\u043E\u043B\u0433 \u0432\u043D\u0435 \u0434\u0435\u043B ${money(visible().reduce((s, r) => s + amount(unassigned(r)), 0))}`;
      $2("#content .stage-context")?.remove();
      [...$2("#content tbody").rows].forEach((tr, i) => {
        const r = visible()[i], rec = recommendation2({ ...r, caseId: null, claim: null, stage: "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430", _caseView: true });
        tr.cells[3].innerHTML = badge("\u0411\u0435\u0437 \u0434\u0435\u043B\u0430");
        tr.cells[4].querySelector("button").innerHTML = `${esc2(rec.label)}<small>${esc2(rec.detail)}</small>`;
      });
    }
  }
  if (workspaceViews.includes(view)) {
    $2("#content .section-head")?.remove();
    $2('#content [data-filter="stage"]')?.remove();
    if (!$2("#content .segments")) $2("#content").insertAdjacentHTML("afterbegin", segments());
    const index = STAGES2.indexOf(filters.stage);
    $2("#content .segments").insertAdjacentHTML("afterend", `<div class="stage-navigation"><span>${esc2(STAGE_INFO[filters.stage].meaning)}</span><div>${index > 0 ? `<button class="icon-button" data-stage-link="${STAGES2[index - 1]}" title="\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C: ${esc2(STAGE_INFO[STAGES2[index - 1]].title)}" aria-label="\u041F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0430\u044F \u0441\u0442\u0430\u0434\u0438\u044F \u0441\u043F\u0438\u0441\u043A\u0430">${icon2("arrow-left")}</button>` : ""}${index < STAGES2.length - 1 ? `<button class="icon-button" data-stage-link="${STAGES2[index + 1]}" title="\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C: ${esc2(STAGE_INFO[STAGES2[index + 1]].title)}" aria-label="\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u0441\u0442\u0430\u0434\u0438\u044F \u0441\u043F\u0438\u0441\u043A\u0430">${icon2("arrow-right")}</button>` : ""}</div></div>`);
  }
  if (["registry", "cases", "board"].includes(view)) $2("#content .filters")?.insertAdjacentHTML("beforeend", `<select data-filter="queue" aria-label="\u0427\u0442\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C"><option value="">\u0412\u0441\u0435 \u0437\u0430\u0434\u0430\u0447\u0438</option>${Object.entries(QUEUES).map(([k, l]) => `<option value="${k}" ${filters.queue === k ? "selected" : ""}>${l}</option>`).join("")}</select>`);
  if (["registry", "accounts", "work"].includes(view)) {
    [...$2("#content tbody").rows].forEach((tr, i) => tr.querySelector(".debtor-link").insertAdjacentHTML("beforeend", `<small>${esc2(ownersSummary(visible()[i]))}</small>`));
  }
  initIcons();
}
function renderCaseList() {
  const list = visible().flatMap((r) => r.cases.filter((c) => !filters.stage || c.stage === filters.stage).map((c) => ({ r, c })));
  $2("#content").innerHTML = `<div class="section-head"><h2>${esc2(filters.stage ? STAGE_INFO[filters.stage].title : "\u0414\u0435\u043B\u0430 \u043F\u043E \u0432\u0437\u044B\u0441\u043A\u0430\u043D\u0438\u044E")}</h2><button class="button secondary small" data-view="registry">\u0412\u0441\u0435 \u0434\u043E\u043B\u0436\u043D\u0438\u043A\u0438</button></div>${filterBar()}<div class="table-frame"><table><thead><tr><th>\u0414\u0435\u043B\u043E / \u0430\u0434\u0440\u0435\u0441</th><th>\u041F\u0435\u0440\u0438\u043E\u0434</th><th>\u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0433\u0430\u0441\u0438\u0442\u044C</th><th>\u0427\u0442\u043E \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043E</th><th>\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435</th></tr></thead><tbody>${list.map(({ r, c }) => {
    const p = caseProgress2(c);
    return `<tr><td><button class="debtor-link" data-open="${r.id}" data-case-id="${esc2(c.id)}">${esc2(r.building)}, \u043A\u0432. ${esc2(r.flat)}<small>\u041B\u0421 ${esc2(r.account)} \xB7 ${esc2(c.id)}</small><small>${esc2(ownerLabel(c))}</small></button></td><td>${esc2(c.period)}</td><td>${money(amount(c.remaining))}${!c.balanceConfirmed ? "<small>\u0421\u0443\u043C\u043C\u0430 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u044F</small>" : ""}</td><td>${esc2(p.label)}<small>${esc2(c.legal?.number || c.agreement?.number || "")}</small></td><td><button class="button ghost small" data-open="${r.id}" data-case-id="${esc2(c.id)}">${esc2(p.next)}</button></td></tr>`;
  }).join("")}</tbody></table>${!list.length ? '<div class="empty">\u041D\u0435\u0442 \u0434\u0435\u043B \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u043C \u0443\u0441\u043B\u043E\u0432\u0438\u044F\u043C</div>' : ""}</div>`;
  const table = $2("#content table");
  table.classList.add("case-table");
  [...table.tBodies[0].rows].forEach((tr) => [...tr.cells].forEach((td, i) => td.dataset.label = ["\u0414\u0435\u043B\u043E / \u0430\u0434\u0440\u0435\u0441", "\u041F\u0435\u0440\u0438\u043E\u0434", "\u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0433\u0430\u0441\u0438\u0442\u044C", "\u0427\u0442\u043E \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043E", "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435"][i]));
  [...table.tBodies[0].rows].forEach((tr, i) => {
    const { r, c } = list[i], p = caseProgress2(c, r);
    tr.querySelector(".debtor-link").insertAdjacentHTML("beforeend", `<small>${esc2(ownersSummary(r))}</small>`);
    tr.cells[1].insertAdjacentHTML("beforeend", `<small class="stage-age">${esc2(stageAge(c))}</small>`);
    tr.cells[3].innerHTML = `${esc2(p.label)}${c.stage !== "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" && (c.legal?.note || ["\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435", "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435"].includes(c.stage) && c.contactResult?.note) ? `<small>${esc2(c.legal?.note || c.contactResult.note)}</small>` : ""}<button class="document-link" data-open="${r.id}" data-case-id="${esc2(c.id)}" data-case-work="documents">${icon2("files")} \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0434\u0435\u043B\u0430: ${[...c.drafts || [], ...c.documents || []].filter((d) => !d.archived).length}</button>${p.dataIssue ? `<small class="data-warning">\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0441\u0443\u043C\u043C\u044B: ${esc2(p.dataIssue)}</small>` : ""}`;
    tr.cells[4].querySelector("button").textContent = p.next;
    tr.cells[4].querySelector("button").dataset.caseWork = p.work;
    tr.cells[4].querySelector("button").dataset.index = c.schedule?.findIndex((x) => !x.paid) ?? -1;
    const due = c.stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" ? null : c.stage === "\u0421\u043E\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u0435" ? c.schedule?.filter((x) => !x.paid).sort((a, b) => a.date.localeCompare(b.date))[0]?.date : c.legal?.nextDate || c.communicationNextDate;
    tr.cells[4].insertAdjacentHTML("beforeend", `<small>${c.stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" ? "\u0414\u0435\u043B\u043E \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" : due ? "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C: " + esc2(due) : "\u0421\u0440\u043E\u043A \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044F \u043D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D"}</small>`);
  });
  if (filters.stage === "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435") {
    table.tHead.rows[0].cells[3].textContent = "\u0421\u0442\u0430\u0442\u0443\u0441 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F";
    table.tHead.rows[0].cells[3].insertAdjacentHTML("afterend", "<th>\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435: \u043A\u0430\u043D\u0430\u043B\u044B \u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442</th>");
    [...table.tBodies[0].rows].forEach((tr, i) => {
      const { r, c } = list[i], events = caseNotices(r, c);
      tr.cells[3].insertAdjacentHTML("afterend", `<td data-label="\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435: \u043A\u0430\u043D\u0430\u043B\u044B \u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442">${events.map((e) => `<small><strong>${esc2(ACTIONS[e.action])}</strong> \xB7 ${esc2(e.status)} \xB7 ${date(e.at)}</small>`).join("") || "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u043B\u043E\u0441\u044C"}${events.length ? `<button class="document-link" data-open="${r.id}" data-case-id="${esc2(c.id)}" data-case-work="history">\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043E\u043A</button>` : ""}</td>`);
    });
  }
}
function renderRegistry() {
  const rows = visible();
  selected = new Set([...selected].filter((id) => rows.some((r) => r.id === id)));
  $2("#content").innerHTML = `<div class="section-head"><h2>\u0414\u043E\u043B\u0436\u043D\u0438\u043A\u0438 \u0438 \u0434\u0435\u043B\u0430</h2><div class="split"><button class="icon-button" data-view="board" title="\u0414\u043E\u0441\u043A\u0430 \u0434\u0435\u043B" aria-label="\u0414\u043E\u0441\u043A\u0430 \u0434\u0435\u043B">${icon2("columns-3")}</button><button class="icon-button" data-action="export" title="\u0412\u044B\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0432\u044B\u0431\u043E\u0440\u043A\u0443" aria-label="\u0412\u044B\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0432\u044B\u0431\u043E\u0440\u043A\u0443">${icon2("download")}</button></div></div>
    ${segments()}${filterBar()}${stageContext(filters.stage)}${selectedBar()}
    <div class="table-frame"><table class="debt-table"><thead><tr><th><input type="checkbox" aria-label="\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0432\u0441\u0435 \u043E\u0442\u0444\u0438\u043B\u044C\u0442\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435" id="selectAll" ${rows.length && rows.every((r) => selected.has(r.id)) ? "checked" : ""}></th><th>\u041B\u0438\u0446\u0435\u0432\u043E\u0439 \u0441\u0447\u0451\u0442 / \u0430\u0434\u0440\u0435\u0441</th><th>\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0434\u043E\u043B\u0433\u0430</th><th>\u042D\u0442\u0430\u043F / \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435</th><th>\u041F\u0440\u0435\u0434\u043B\u0430\u0433\u0430\u0435\u043C\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435</th><th>\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439</th><th></th></tr></thead><tbody>${rows.map((r) => {
    const rec = recommendation2(r);
    return `<tr><td><input type="checkbox" data-select="${r.id}" aria-label="\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u041B\u0421 ${esc2(r.account)}" ${selected.has(r.id) ? "checked" : ""}></td><td><button class="debtor-link" data-open="${r.id}">${esc2(r.building)}, \u043A\u0432. ${esc2(r.flat)}<small>\u041B\u0421 ${esc2(r.account)} \xB7 \u043F\u043E\u0434\u044A\u0435\u0437\u0434 ${esc2(r.entrance || "\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D")}</small></button><small>${esc2(r.company)}</small></td><td class="money">${money(total(r))}<small>${r.age ? r.age + " \u0434\u043D. \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0438" : "\u041D\u0435\u0442 \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0438"}</small><small>\u041D\u0430 ${date(r.asOf)}</small></td><td>${badge(r.stage, r.stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" ? "" : r.stage === "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E" ? "green" : "pink")}${r.stageNeedsReview ? badge("\u0412\u0438\u0434 \u0441\u0443\u0434\u0430 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C", "amber") : ""}${noticeBadge(r)}</td><td><button class="recommend ${rec.tone}" data-open="${r.id}">${esc2(rec.label)}<small>${esc2(rec.detail)}</small></button></td><td>${esc2(r.owner)}<small>${esc2(r.source)}</small></td><td><button class="icon-button" data-open="${r.id}" title="\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043B\u0438\u0446\u0435\u0432\u043E\u0439 \u0441\u0447\u0451\u0442" aria-label="\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u041B\u0421 ${esc2(r.account)}">${icon2("chevron-right")}</button></td></tr>`;
  }).join("")}</tbody></table>${!rows.length ? '<div class="empty">\u041D\u0435\u0442 \u041B\u0421 \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u043C \u0443\u0441\u043B\u043E\u0432\u0438\u044F\u043C</div>' : ""}</div><div class="table-end"><span>${rows.length} \u0438\u0437 ${state.rows.length} \u041B\u0421 \xB7 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u0432\u044B\u0431\u043E\u0440\u043A\u0438 ${money(rows.reduce((s, r) => s + total(r), 0))}</span><span>\u0414\u0435\u043C\u043E \u043D\u0430 ${date(TODAY)}</span></div>`;
}
function renderBoard() {
  const rows = visible(), cases = rows.flatMap((r) => r.cases.map((c) => ({ r, c })));
  $2("#content").innerHTML = `<div class="section-head"><h2>\u0414\u0435\u043B\u0430 \u043F\u043E \u044D\u0442\u0430\u043F\u0430\u043C \u0432\u0437\u044B\u0441\u043A\u0430\u043D\u0438\u044F</h2><button class="button secondary small" data-view="registry">\u0420\u0435\u0435\u0441\u0442\u0440 \u0434\u043E\u043B\u0436\u043D\u0438\u043A\u043E\u0432</button></div>${filterBar()}<div class="board">${STAGES2.slice(1).map((stage) => {
    const list = cases.filter(({ c }) => c.stage === stage && (!filters.stage || c.stage === filters.stage));
    return `<section class="column"><h3>${esc2(stage)} \xB7 ${list.length}</h3><div class="column-total">${money(list.reduce((sum2, { c }) => sum2 + amount(c.remaining), 0))}</div>${list.map(({ r, c }) => {
      const progress = caseProgress2(c, r), rec = { label: progress.next, detail: progress.label };
      return `<article class="case-card" role="button" tabindex="0" data-open="${r.id}" data-case-id="${esc2(c.id)}" aria-label="\u0414\u0435\u043B\u043E ${esc2(c.id)}"><small>${esc2(c.id)} \xB7 ${esc2(ownerLabel(c))} \xB7 ${esc2(c.period)}</small><h4>${esc2(r.building)}, \u043A\u0432. ${esc2(r.flat)}</h4><small>\u041B\u0421 ${esc2(r.account)}</small><div class="case-amount">${money(amount(c.remaining))}</div><div class="next"><strong>${esc2(rec.label)}</strong><small>${esc2(rec.detail)}</small></div><small>${esc2(r.owner)}</small></article>`;
    }).join("") || '<p class="empty compact">\u041D\u0435\u0442 \u0434\u0435\u043B</p>'}</section>`;
  }).join("")}</div>`;
}
var commFilter = "";
var commStatus = "";
function renderCommunications() {
  const records = filterRows(state.rows, { company: filters.company, building: filters.building }).flatMap((r) => r.events.filter((e) => [...CHANNELS, "court"].includes(e.action)).map((e) => ({ r, e }))).filter(({ e }) => (!commFilter || e.action === commFilter) && (!commStatus || e.status === commStatus)).sort((a, b) => b.e.at.localeCompare(a.e.at));
  $2("#content").innerHTML = `<div class="section-head"><div><h2>\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043A\u043E\u043C\u043C\u0443\u043D\u0438\u043A\u0430\u0446\u0438\u0439</h2><p>\u0410\u0434\u0440\u0435\u0441\u0430\u0442, \u043A\u0430\u043D\u0430\u043B, \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433 \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u0432 \u043E\u0434\u043D\u043E\u043C \u043C\u0435\u0441\u0442\u0435</p></div><button class="button secondary small" data-view="registry">${icon2("users")} \u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u043E\u043B\u0436\u043D\u0438\u043A\u043E\u0432</button></div><div class="split" style="margin-bottom:18px"><select id="commFilter" aria-label="\u041A\u0430\u043D\u0430\u043B">${options(["", ...CHANNELS, "court"].map((x) => x), commFilter).replace('<option value="" >', '<option value="" >')}</select><select id="commStatus" aria-label="\u0421\u0442\u0430\u0442\u0443\u0441 \u043A\u043E\u043C\u043C\u0443\u043D\u0438\u043A\u0430\u0446\u0438\u0438">${options(["\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E: \u0434\u043E\u043B\u0433 \u043F\u043E\u0433\u0430\u0448\u0435\u043D"], commStatus, "\u0412\u0441\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B")}</select><span class="compact">${records.length} \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439</span></div><div class="table-frame"><table><thead><tr><th>\u0414\u0430\u0442\u0430 / \u043A\u0430\u043D\u0430\u043B</th><th>\u041B\u0438\u0446\u0435\u0432\u043E\u0439 \u0441\u0447\u0451\u0442</th><th>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442</th><th>\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435</th></tr></thead><tbody>${records.map(({ r, e }) => `<tr><td>${date(e.at)}<small>${esc2(e.label)}</small></td><td><button class="debtor-link" data-open="${r.id}">${esc2(r.building)}, \u043A\u0432. ${esc2(r.flat)}<small>\u041B\u0421 ${esc2(r.account)}</small></button></td><td>${badge(e.status, e.status.includes("\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E") ? "" : e.status.includes("\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E") ? "green" : "amber")}<small>${esc2(e.note)}</small></td><td>${esc2(r.next)}<small>${date(r.nextDate)} \xB7 ${esc2(r.owner)}</small></td></tr>`).join("")}</tbody></table>${!records.length ? '<div class="empty">\u041D\u0435\u0442 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u043C \u0443\u0441\u043B\u043E\u0432\u0438\u044F\u043C</div>' : ""}</div>`;
  [...$2("#commFilter").options].forEach((o) => o.textContent = ACTIONS[o.value] || "\u0412\u0441\u0435 \u043A\u0430\u043D\u0430\u043B\u044B");
  $2("#commStatus").innerHTML = options([.../* @__PURE__ */ new Set([...OUTCOMES, ...state.rows.flatMap((r) => r.events.filter((e) => [...CHANNELS, "court"].includes(e.action)).map((e) => e.status))])], commStatus, "\u0412\u0441\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B");
  [...$2("#content tbody").rows].forEach((tr, i) => {
    const { r, e } = records[i];
    const c = r.cases.find((c2) => c2.id === e.caseId), progress = caseProgress2(c, r), rec = { label: progress.next, detail: progress.label };
    tr.cells[3].innerHTML = `${esc2(rec.label)}<small>${esc2(rec.detail)}</small>`;
    if (c) tr.cells[1].querySelector("button").dataset.caseId = c.id;
    if (e.date) tr.cells[0].insertAdjacentHTML("beforeend", `<small>\u041F\u043B\u0430\u043D: ${date(e.date)}</small>`);
    if (CHANNELS.includes(e.action) && ["\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0434\u043B\u044F \u043F\u0435\u0447\u0430\u0442\u0438 (\u0434\u0435\u043C\u043E)"].includes(e.status)) tr.cells[2].insertAdjacentHTML("beforeend", `<button class="button ghost small" data-result="${esc2(e.id)}" data-id="${r.id}">\u041E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442</button>`);
  });
}
function renderPayments() {
  const scoped = filterRows(state.rows, { company: filters.company, building: filters.building }), pending = scoped.filter((r) => r.unallocated);
  const payments = scoped.flatMap((r) => r.payments.filter((p) => p.at.slice(0, 10) >= reportFrom && p.at.slice(0, 10) <= reportTo).map((p) => ({ r, p }))).sort((a, b) => b.p.at.localeCompare(a.p.at));
  $2("#content").innerHTML = `<div class="section-head"><h2>\u041E\u043F\u043B\u0430\u0442\u044B</h2></div><div class="filters"><select data-filter="company" aria-label="\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0449\u0430\u044F \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u044F">${options([...new Set(state.rows.map((r) => r.company))], filters.company, "\u0412\u0441\u0435 \u0423\u041A")}</select><select data-filter="building" aria-label="\u0414\u043E\u043C">${options([...new Set(scoped.map((r) => r.building))], filters.building, "\u0412\u0441\u0435 \u0434\u043E\u043C\u0430")}</select><label>\u0421 <input type="date" id="reportFrom" value="${reportFrom}" max="${TODAY}"></label><label>\u041F\u043E <input type="date" id="reportTo" value="${reportTo}" max="${TODAY}"></label></div>
  <h3>\u041F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434: ${money(payments.reduce((s, { p }) => s + p.amount, 0))}</h3><div class="table-frame"><table><thead><tr><th>\u0414\u0430\u0442\u0430 / \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A</th><th>\u041B\u0438\u0446\u0435\u0432\u043E\u0439 \u0441\u0447\u0451\u0442 / \u0434\u0435\u043B\u043E</th><th>\u0412\u0441\u0435\u0433\u043E</th><th>\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0434\u043E\u043B\u0433</th><th>\u041F\u0435\u043D\u0438</th><th>\u041F\u043E\u0448\u043B\u0438\u043D\u0430</th></tr></thead><tbody>${payments.map(({ r, p }) => `<tr><td>${date(p.at)}<small>${esc2(p.source || "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043D\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D")} \xB7 ${esc2(p.reference || "\u0411\u0435\u0437 \u043D\u043E\u043C\u0435\u0440\u0430")}</small></td><td><button class="debtor-link" data-open="${r.id}" ${p.caseId ? `data-case-id="${esc2(p.caseId)}"` : ""}>${esc2(r.building)}, \u043A\u0432. ${esc2(r.flat)}<small>\u041B\u0421 ${esc2(r.account)} \xB7 ${esc2(p.caseId || "\u0412\u043D\u0435 \u0434\u0435\u043B\u0430")} \xB7 ${esc2(p.ownerName || "\u041E\u0431\u0449\u0438\u0439 \u0434\u043E\u043B\u0433 \u041B\u0421")}</small></button></td><td class="money">${money(p.amount)}</td><td>${money(p.principal)}</td><td>${money(p.penalty)}</td><td>${money(p.fee)}</td></tr>`).join("")}</tbody></table>${!payments.length ? '<div class="empty">\u0417\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0439 \u043D\u0435\u0442</div>' : ""}</div>`;
}
function renderSources() {
  $2("#content").innerHTML = `<div class="section-head"><div><h2>\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438</h2><p>\u041E\u0431\u0449\u0438\u0439 \u0440\u0435\u0435\u0441\u0442\u0440 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E \u043E\u0442 \u0442\u043E\u0433\u043E, \u043A\u0442\u043E \u0432\u0435\u0434\u0451\u0442 \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F</p></div></div><div class="source-grid"><section><h3>\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u0432 \u0434\u0435\u043C\u043E</h3><div class="source-list">${[...new Set(state.rows.map((r) => r.source))].map((s) => {
    const rows = state.rows.filter((r) => r.source === s), stale = rows.some((r) => days(r.asOf) > 7);
    return `<div class="source-row">${icon2(s === "\u0420\u0426 \u041C\u0414\u041E" ? "database" : "file-spreadsheet")}<div><strong>${esc2(s)}</strong><small>${rows.length} \u041B\u0421 \xB7 ${money(rows.reduce((t, r) => t + total(r), 0))}</small><small>\u0414\u043E\u043B\u0433 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D \u043D\u0430: ${[...new Set(rows.map((r) => date(r.asOf)))].join(", ")}</small></div>${badge(stale ? "\u041D\u0443\u0436\u043D\u044B \u0441\u0432\u0435\u0436\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0435" : "\u0422\u0435\u0441\u0442\u043E\u0432\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435", stale ? "amber" : "")}</div>`;
  }).join("")}</div><div class="notice">\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0445 \u0438\u0437 \u0420\u0426 \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E. \u0421\u0435\u0439\u0447\u0430\u0441 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0444\u0430\u0439\u043B\u0430 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438.</div></section><section class="source-block"><h3>\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438 \u043F\u043E \u043B\u0438\u0446\u0435\u0432\u044B\u043C \u0441\u0447\u0435\u0442\u0430\u043C</h3><p>CSV \u0432 UTF-8, \u0440\u0430\u0437\u0434\u0435\u043B\u0438\u0442\u0435\u043B\u044C \xAB;\xBB. \u0421\u0443\u043C\u043C\u044B \u0432 \u0440\u0443\u0431\u043B\u044F\u0445. \u041A\u043B\u044E\u0447: \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A + \u0423\u041A + \u043B\u0438\u0446\u0435\u0432\u043E\u0439 \u0441\u0447\u0451\u0442. \u0412 \u0444\u0430\u0439\u043B\u0435 \u0443\u043A\u0430\u0437\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u0434\u043E\u043B\u0433, \u043F\u0435\u043D\u0438 \u0438 \u0433\u043E\u0441\u043F\u043E\u0448\u043B\u0438\u043D\u0430 \u043D\u0430 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u0443\u044E \u0434\u0430\u0442\u0443. \u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u0442 \u044D\u0442\u0438 \u0441\u0443\u043C\u043C\u044B, \u0430 \u043D\u0435 \u043F\u0440\u0438\u0431\u0430\u0432\u043B\u044F\u0435\u0442 \u0438\u0445 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E.</p><div class="split"><button class="button secondary small" data-action="template">${icon2("download")} \u0428\u0430\u0431\u043B\u043E\u043D CSV</button><button class="button secondary small" data-action="sampleImport">\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0440\u0438\u043C\u0435\u0440</button></div><div class="upload-zone">${icon2("upload")}<label>\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0440\u0435\u0435\u0441\u0442\u0440<input type="file" id="importFile" accept=".csv,text/csv"></label><small>\u0422\u043E\u043B\u044C\u043A\u043E \u0441\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \xB7 \u0434\u043E 2 \u041C\u0411</small></div><p>\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0442\u0441\u044F \u0434\u0430\u0442\u044B \u0440\u0430\u0441\u0447\u0451\u0442\u0430, \u0434\u0443\u0431\u043B\u0438, \u0441\u0443\u043C\u043C\u044B \u0438 \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442 \u0441 \u0443\u0436\u0435 \u0440\u0430\u0437\u043D\u0435\u0441\u0451\u043D\u043D\u043E\u0439 \u043E\u043F\u043B\u0430\u0442\u043E\u0439. \u0421\u0443\u0434\u0435\u0431\u043D\u043E\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043D\u0435\u0438\u0437\u043C\u0435\u043D\u043D\u044B\u043C.</p></section></div>${state.imports.length ? `<h3>\u0416\u0443\u0440\u043D\u0430\u043B \u0438\u043C\u043F\u043E\u0440\u0442\u043E\u0432</h3><div class="source-list">${state.imports.map((i) => `<div class="source-row"><div>${date(i.at)}<small>\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E / \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E: ${i.changed} \xB7 \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439: ${i.skipped}</small></div>${badge("\u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E \u0432 \u0434\u0435\u043C\u043E", "green")}</div>`).join("")}</div>` : ""}`;
}
function lockBackground(lock) {
  $2(".shell").inert = lock;
  $2(".sidebar").inert = lock;
  document.body.style.overflow = lock ? "hidden" : "";
}
function showOverlay(html) {
  if (!$2("#overlay").innerHTML) returnFocus = document.activeElement;
  $2("#overlay").innerHTML = html;
  lockBackground(true);
  initIcons();
  $2("#overlay").querySelector("button,input,select,textarea")?.focus();
}
function closeOverlay() {
  drawerId = null;
  $2("#overlay").innerHTML = "";
  lockBackground(false);
  returnFocus?.focus();
}
function openDrawer(id, tab = "overview", keepCase = false) {
  drawerId = id;
  drawerTab = tab;
  const r = row(id);
  if (!keepCase) {
    const w = workRecord(r);
    selectCase(r, filters.stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" ? null : w.caseId);
  }
  const rec = recommendation2({ ...r, _caseView: true }), info = STAGE_INFO[r.stage], legal = role === "lawyer";
  const tabs = [["overview", "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430"], ["documents", `\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0434\u0435\u043B\u0430 (${[...currentCase(r)?.drafts || [], ...currentCase(r)?.documents || []].filter((d) => !d.archived).length})`], ["data", "\u0414\u0430\u043D\u043D\u044B\u0435 \u0438 \u0440\u0430\u0441\u0447\u0451\u0442"], ["history", "\u0418\u0441\u0442\u043E\u0440\u0438\u044F"]];
  let body = "";
  if (tab === "overview") {
    const balance = currentCase(r)?.remaining || unassigned(r);
    body = `<div class="drawer-total">${money(amount(balance))}</div><small>\u041B\u0421 ${esc2(r.account)} \xB7 ${esc2(ownerLabel(currentCase(r)))} \xB7 ${currentCase(r) ? "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u043B\u0430" : "\u0414\u043E\u043B\u0433 \u0432\u043D\u0435 \u0434\u0435\u043B"} \xB7 \u0434\u0430\u043D\u043D\u044B\u0435 \u043D\u0430 ${date(r.asOf)}</small>
      ${ownershipPanel(r)}
      <div class="money-breakdown"><div><small>\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0434\u043E\u043B\u0433</small><strong>${money(balance.principal)}</strong></div><div><small>\u041F\u0435\u043D\u0438</small><strong>${money(balance.penalty)}</strong></div><div><small>\u0413\u043E\u0441\u043F\u043E\u0448\u043B\u0438\u043D\u0430</small><strong>${money(balance.fee)}</strong></div></div>
      ${legal && currentCase(r) ? legalPanel(r) : nextAction(r, role)}
      ${role === "accountant" && total(r) > 0 ? `<button class="button secondary" data-payment="${r.id}">${icon2("wallet")} \u0420\u0430\u0437\u043D\u0435\u0441\u0442\u0438 \u043E\u043F\u043B\u0430\u0442\u0443</button>` : ""}
      ${r.cases.length ? `<details class="case-section"><summary>\u0414\u0440\u0443\u0433\u0438\u0435 \u0434\u043E\u043B\u0433\u0438 \u0438 \u0434\u0435\u043B\u0430 \u044D\u0442\u043E\u0433\u043E \u041B\u0421</summary>${casesPanel(r)}</details>` : ""}
      <details class="case-section"><summary>\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0438 \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043F\u043E \u0434\u0435\u043B\u0443</summary><div class="detail-grid"><div><small>\u042D\u0442\u0430\u043F \u0434\u0435\u043B\u0430</small><strong>${esc2(r.stage)}</strong></div>
      <label>\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439<select id="ownerChange" ${!legal ? "disabled" : ""}>${options([.../* @__PURE__ */ new Set([r.owner, "\u0410. \u0421\u043E\u043A\u043E\u043B\u043E\u0432\u0430", "\u041C. \u041E\u0440\u043B\u043E\u0432\u0430", "\u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D"])], r.owner)}</select></label>
      <label>\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F<select id="categoryChange" ${!legal ? "disabled" : ""}>${options(CATEGORIES, r.category)}</select></label><div><small>\u041F\u0435\u0440\u0438\u043E\u0434 \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438</small><strong>${esc2(currentCase(r)?.period || r.period)}</strong><small>${r.age} \u0434\u043D. \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0438</small></div></div></details>
      ${r.stageNeedsReview ? '<div class="notice">\u0412 \u043F\u0440\u0435\u0436\u043D\u0435\u0439 \u0432\u0435\u0440\u0441\u0438\u0438 \u0431\u044B\u043B \u043E\u0431\u0449\u0438\u0439 \u044D\u0442\u0430\u043F \xAB\u0421\u0443\u0434\xBB. \u0423\u0442\u043E\u0447\u043D\u0438\u0442\u0435: \u043F\u0440\u0438\u043A\u0430\u0437 \u0438\u043B\u0438 \u0438\u0441\u043A.</div>' : ""}
      <p class="form-note">${esc2(info.meaning)}</p>
      ${r.claim ? `<h3>\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E \u0434\u0435\u043B\u0443 ${esc2(r.caseId)}</h3><div class="component-table"><table><tbody><tr><td>\u041F\u0435\u0440\u0432\u043E\u043D\u0430\u0447\u0430\u043B\u044C\u043D\u043E\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435</td><td>${money(r.claim.amount)}</td></tr><tr><td>\u041F\u0435\u0440\u0438\u043E\u0434</td><td>${esc2(r.claim.period)}</td></tr></tbody></table></div><small>\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E. \u041E\u043F\u043B\u0430\u0442\u044B \u043C\u0435\u043D\u044F\u044E\u0442 \u043E\u0441\u0442\u0430\u0442\u043E\u043A, \u0430 \u043D\u0435 \u0441\u0443\u043C\u043C\u0443 \u043F\u0435\u0440\u0432\u043E\u043D\u0430\u0447\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430.</small>` : ""}
      ${r.payments.some((p) => !r.caseId || p.caseId === r.caseId) ? `<h3>\u0423\u0447\u0442\u0451\u043D\u043D\u044B\u0435 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F</h3>${r.payments.filter((p) => !r.caseId || p.caseId === r.caseId).map((p) => `<div class="source-row"><div><strong>${money(p.amount)} \xB7 ${date(p.at)}</strong><small>\u0414\u043E\u043B\u0433 ${money(p.principal)} \xB7 \u043F\u0435\u043D\u0438 ${money(p.penalty)} \xB7 \u043F\u043E\u0448\u043B\u0438\u043D\u0430 ${money(p.fee)}</small><small>${esc2(p.ownerName || "\u041E\u0431\u0449\u0438\u0439 \u0434\u043E\u043B\u0433 \u041B\u0421")} \xB7 ${esc2(p.caseId || "\u0412\u043D\u0435 \u0434\u0435\u043B\u0430")}</small><small>\u042D\u0442\u0430\u043F \u043F\u0440\u0438 \u043E\u043F\u043B\u0430\u0442\u0435: ${esc2(p.stage || "\u043D\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D")}</small></div></div>`).join("")}` : ""}
      <p class="form-note">${esc2(r.source)} \xB7 ${date(r.asOf)}. \u041E\u043F\u043B\u0430\u0442\u044B \u0440\u0430\u0437\u043D\u043E\u0441\u0438\u0442 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A, \u0434\u0435\u043B\u043E \u0432\u0435\u0434\u0451\u0442 \u044E\u0440\u0438\u0441\u0442.</p>
      ${r.billing ? `<details class="scenario-tools"><summary>\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u044F \u043D\u0430 \u0442\u0435\u0441\u0442\u043E\u0432\u044B\u0445 \u0434\u0430\u043D\u043D\u044B\u0445</summary>${demoControls(r, role)}</details>` : ""}`;
  } else if (tab === "data") {
    body = dataPanel(r);
  } else if (tab === "history") {
    body = `<ul class="timeline">${r.events.filter((e) => !e.caseId || !r.caseId || e.caseId === r.caseId).map((e) => `<li><strong>${esc2(e.label)}</strong><small>${date(e.at)} \xB7 ${esc2(e.status)}</small><p>${e.amount !== void 0 ? money(e.amount) + " \xB7 " : ""}${esc2(e.note)}</p>${CHANNELS.includes(e.action) && ["\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E (\u0434\u0435\u043C\u043E)", "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0434\u043B\u044F \u043F\u0435\u0447\u0430\u0442\u0438 (\u0434\u0435\u043C\u043E)"].includes(e.status) ? `<button class="button ghost small" data-result="${esc2(e.id)}" data-id="${r.id}">\u041E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442</button>` : ""}</li>`).join("") || "<li>\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442</li>"}</ul>`;
  } else {
    body = documentsPanel(state, r);
  }
  showOverlay(`<div class="drawer-shade" data-action="close"></div><section class="drawer" role="dialog" aria-modal="true" aria-label="\u041B\u0438\u0446\u0435\u0432\u043E\u0439 \u0441\u0447\u0451\u0442 ${esc2(r.account)}"><header class="drawer-head"><div><small>${esc2(r.company)} \xB7 \u041B\u0421 ${esc2(r.account)}</small><h2>${esc2(r.building)}, \u043A\u0432. ${esc2(r.flat)}</h2>${badge(r.stage, "pink")}</div><button class="icon-button" data-action="close" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">${icon2("x")}</button></header><div class="drawer-body"><nav class="drawer-tabs">${tabs.map(([v, l]) => `<button data-drawer-tab="${v}" class="${tab === v ? "active" : ""}">${l}</button>`).join("")}</nav>${body}</div></section>`);
  if (role === "accountant") for (const el of $2("#overlay").querySelectorAll('[data-work="newCase"],[data-work="legal"],[data-work="agreement"],[data-work="transition"],[data-work="closeCase"],[data-work="uploadHouse"],[data-work="uploadCase"],[data-work="installment"],[data-work="taskDone"],[data-single-action="task"]')) {
    el.disabled = true;
    el.title = "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u044E\u0440\u0438\u0441\u0442\u0430";
  }
  if (role === "lawyer") for (const el of $2("#overlay").querySelectorAll('[data-work="monthly"],[data-work="owners"],[data-work="previous"]')) {
    el.disabled = true;
    el.title = "\u0421\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A";
  }
}
function modal(title, subtitle, body, footer) {
  showOverlay(`<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc2(title)}"><header class="modal-head"><div><h2>${esc2(title)}</h2><small>${esc2(subtitle)}</small></div><button class="icon-button" data-action="close" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C">${icon2("x")}</button></header><div class="modal-body">${body}</div><div class="modal-foot"><button class="button secondary" data-action="close">${footer ? "\u041E\u0442\u043C\u0435\u043D\u0430" : "\u0417\u0430\u043A\u0440\u044B\u0442\u044C"}</button>${footer || ""}</div></section></div>`);
}
function chooseChannel() {
  interactions.notify([...selected].map((id) => [id, filters.stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" ? null : workRecord(row(id)).caseId]));
}
var bulkContext = null;
var resultContext = null;
function recordResult(id, eventId) {
  resultContext = { id, eventId };
  const r = row(id);
  modal("\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0432\u0437\u0430\u0438\u043C\u043E\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F", `\u0414\u0435\u043C\u043E-\u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0439 \xB7 \u041B\u0421 ${r.account}`, `<div class="notice">\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0432\u0432\u043E\u0434\u0438\u0442\u0441\u044F \u0432\u0440\u0443\u0447\u043D\u0443\u044E \u0434\u043B\u044F \u0434\u0435\u043C\u043E\u043D\u0441\u0442\u0440\u0430\u0446\u0438\u0438. \u041D\u0438\u043A\u0430\u043A\u043E\u0439 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0439 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u0438\u043B\u0438 \u0437\u0432\u043E\u043D\u043A\u0430 \u043D\u0435 \u0431\u044B\u043B\u043E.</div><div class="form-grid"><label>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442<select id="interactionResult">${options(OUTCOMES, OUTCOMES[0])}</select></label><label>\u0414\u0430\u0442\u0430 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F<input type="date" id="resultDate" min="${TODAY}" value="2026-10-29"></label></div><div id="formError"></div><p class="form-note">\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433 \u0438 \u043E\u0431\u0435\u0449\u0430\u043D\u0438\u0435 \u043E\u043F\u043B\u0430\u0442\u044B \u043E\u0431\u043D\u043E\u0432\u044F\u0442\u0441\u044F \u0432 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0435. \u0421\u0442\u0430\u0434\u0438\u044F \u044E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0434\u0435\u043B\u0430 \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u0441\u044F.</p>`, `<button class="button" id="confirmResult">\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0432 \u0434\u0435\u043C\u043E</button>`);
}
function bulk(action, ids = [...selected]) {
  if (CHANNELS.includes(action)) {
    try {
      interactions.notify(ids.map((id) => [id, ids.length === 1 ? row(id).caseId : workRecord(row(id)).caseId]), action);
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (role === "accountant" && ["case", "court", "task"].includes(action)) {
    toast("\u0414\u0435\u043B\u0430 \u0438 \u0437\u0430\u0434\u0430\u0447\u0438 \u0432\u0437\u044B\u0441\u043A\u0430\u043D\u0438\u044F \u0432\u0435\u0434\u0451\u0442 \u044E\u0440\u0438\u0441\u0442. \u0421\u043C\u0435\u043D\u0438\u0442\u0435 \u0440\u043E\u043B\u044C \u0432 \u0434\u0435\u043C\u043E.");
    return;
  }
  bulkContext = { action, ids };
  const list = plan(state.rows, ids, action), allowed = list.filter((p) => !p.reason);
  modal(ACTIONS[action], `${allowed.length} \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \xB7 ${list.length - allowed.length} \u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u043E`, `${action === "court" ? '<div class="notice">\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0443 \u0438\u043B\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443 \u043A\u043E\u043F\u0438\u0438 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430. \u042D\u0442\u043E \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0439 \u043F\u043E\u0432\u0435\u0441\u0442\u043A\u0438 \u0438 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u044E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0432\u0440\u0443\u0447\u0435\u043D\u0438\u044F.</div>' : ""}<div class="form-grid"><label>${action === "task" ? "\u0417\u0430\u0434\u0430\u0447\u0430" : "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 / \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430"}<input id="actionNote" value="${action === "task" ? esc2(ids.length === 1 ? STAGE_INFO[row(ids[0]).stage].next : "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043A\u0438 \u0438 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u0442\u044C \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433") : action === "court" ? "\u041A\u043E\u043F\u0438\u044F \u0441\u0443\u0434\u0435\u0431\u043D\u043E\u0433\u043E \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430" : "\u041D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435 \u043E \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u0438"}"></label><label>${action === "task" ? "\u0421\u0440\u043E\u043A \u0437\u0430\u0434\u0430\u0447\u0438" : "\u0414\u0430\u0442\u0430 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F"}<input type="date" id="actionDate" value="${TODAY}" min="${TODAY}"></label>${action === "task" ? `<label>\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439<select id="actionOwner">${options(["\u0410. \u0421\u043E\u043A\u043E\u043B\u043E\u0432\u0430", "\u041C. \u041E\u0440\u043B\u043E\u0432\u0430"], "\u0410. \u0421\u043E\u043A\u043E\u043B\u043E\u0432\u0430")}</select></label>` : ""}</div><div class="table-frame"><table><thead><tr><th>\u0410\u0434\u0440\u0435\u0441 / \u041B\u0421</th><th>\u041E\u0441\u0442\u0430\u0442\u043E\u043A</th><th>\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430</th></tr></thead><tbody>${list.map((p) => {
    const r = row(p.id);
    return `<tr><td>${esc2(r.building)}, \u043A\u0432. ${esc2(r.flat)}<small>\u041B\u0421 ${esc2(r.account)}</small></td><td>${money(p.amount)}</td><td>${badge(p.reason || "\u041C\u043E\u0436\u043D\u043E \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C", p.reason ? "amber" : "green")}</td></tr>`;
  }).join("")}</tbody></table></div><div id="formError"></div><p class="form-note">\u0414\u0435\u043C\u043E: \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043E\u0442\u043E\u0432\u044F\u0442\u0441\u044F. \u0421\u0442\u0430\u0442\u0443\u0441 \xAB\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E\xBB \u0438 \u043F\u0435\u0440\u0435\u0445\u043E\u0434 \u0432 \u0441\u0443\u0434\u0435\u0431\u043D\u0443\u044E \u0441\u0442\u0430\u0434\u0438\u044E \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0435 \u0432\u044B\u0441\u0442\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F.</p>`, `<button class="button" id="confirmBulk" ${!allowed.length ? "disabled" : ""}>${action === "task" ? "\u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C" : action === "case" ? "\u0421\u043E\u0437\u0434\u0430\u0442\u044C" : "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C"}: ${allowed.length}</button>`);
  if (action === "receipt" && allowed.length) {
    $2("#formError").insertAdjacentHTML("beforebegin", `<details class="receipt-details"><summary>\u041F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0434\u0432\u0443\u0445 \u043B\u0438\u0441\u0442\u043E\u0432 \xB7 \u041B\u0421 ${esc2(row(allowed[0].id).account)}</summary>${receiptPages(row(allowed[0].id))}</details>`);
  }
}
function payment(id) {
  if (role !== "accountant") {
    toast("\u0420\u0430\u0437\u043D\u0435\u0441\u0435\u043D\u0438\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0435\u0433\u043E \u0440\u043E\u043B\u044C \u0432 \u0434\u0435\u043C\u043E.");
    return;
  }
  const r = row(id);
  drawerId = id;
  modal("\u0420\u0430\u0437\u043D\u0435\u0441\u0442\u0438 \u043E\u043F\u043B\u0430\u0442\u0443", `\u041B\u0421 ${r.account} \xB7 ${r.building}, \u043A\u0432. ${r.flat}`, `<div class="notice">${r.unallocated ? "\u041F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0432 \u0440\u0435\u0435\u0441\u0442\u0440\u0435. \u0423\u0442\u043E\u0447\u043D\u0438\u0442\u0435, \u043D\u0430 \u043A\u0430\u043A\u0438\u0435 \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u044E\u0449\u0438\u0435 \u0435\u0433\u043E \u043E\u0442\u043D\u0435\u0441\u0442\u0438." : "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u0435 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435 \u0438 \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u0435 \u043F\u043E \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u044E \u043F\u043B\u0430\u0442\u0435\u0436\u0430."}</div><div class="form-grid"><label>\u0421\u0443\u043C\u043C\u0430 \u043F\u043E\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u044F, \u20BD<input id="paymentAmount" inputmode="decimal" value="${r.unallocated ? r.unallocated / 100 : ""}" ${r.unallocated ? "readonly" : ""} placeholder="0.00"></label><label>\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0434\u043E\u043B\u0433, \u20BD<input id="payPrincipal" inputmode="decimal" value="0"></label><label>\u041F\u0435\u043D\u0438, \u20BD<input id="payPenalty" inputmode="decimal" value="0"></label><label>\u0413\u043E\u0441\u043F\u043E\u0448\u043B\u0438\u043D\u0430, \u20BD<input id="payFee" inputmode="decimal" value="0"></label></div><small>\u041E\u0441\u0442\u0430\u0442\u043E\u043A: \u0434\u043E\u043B\u0433 ${money(r.principal)} \xB7 \u043F\u0435\u043D\u0438 ${money(r.penalty)} \xB7 \u043F\u043E\u0448\u043B\u0438\u043D\u0430 ${money(r.fee)}</small><div class="balance-check"><span>\u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C</span><strong id="payRemaining">${money(r.unallocated || 0)}</strong></div><div id="formError"></div><p class="form-note">\u041F\u043E\u0433\u0430\u0448\u0435\u043D\u0438\u0435 \u0432\u0441\u0435\u0439 \u0441\u0443\u043C\u043C\u044B \u043E\u0442\u043C\u0435\u043D\u0438\u0442 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u044F. \u0421\u0443\u0434\u0435\u0431\u043D\u043E\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u0432 \u0438\u0441\u0442\u043E\u0440\u0438\u0438.</p>`, `<button class="button" id="confirmPayment">\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0440\u0430\u0437\u043D\u0435\u0441\u0435\u043D\u0438\u0435</button>`);
  $2(".modal-body").insertAdjacentHTML("afterbegin", `<div class="form-grid"><label>\u0414\u0430\u0442\u0430 \u043E\u043F\u043B\u0430\u0442\u044B<input id="paymentDate" type="date" value="${TODAY}" max="${TODAY}"></label><label>\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A<select id="paymentSource"><option>\u0411\u0430\u043D\u043A</option><option>\u041A\u0430\u0441\u0441\u0430</option><option>\u041C\u043E\u0431\u0438\u043B\u044C\u043D\u043E\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435</option><option>\u0412\u043D\u0435\u0448\u043D\u0438\u0439 \u0440\u0435\u0435\u0441\u0442\u0440</option></select></label><label>\u041D\u043E\u043C\u0435\u0440 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438<input id="paymentReference" placeholder="\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, \u041F\u041B-1042" required></label></div><label>\u041E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043B\u0430\u0442\u0435\u0436\u0430<select id="paymentCase"><option value="">\u0414\u043E\u043B\u0433 \u0432\u043D\u0435 \u0434\u0435\u043B \xB7 ${money(amount(unassigned(r)))}</option>${r.cases.filter((c) => c.stage !== "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E").map((c) => `<option value="${esc2(c.id)}" ${r.caseId === c.id ? "selected" : ""}>${esc2(c.id)} \xB7 ${esc2(ownerLabel(c))} \xB7 ${esc2(c.period)} \xB7 ${money(amount(c.remaining))}</option>`).join("")}</select></label>`);
  $2(".modal-body").insertAdjacentHTML("afterbegin", `<section class="payment-context"><h3>\u0412\u0437\u044B\u0441\u043A\u0430\u043D\u0438\u044F \u043F\u043E \u043B\u0438\u0446\u0435\u0432\u043E\u043C\u0443 \u0441\u0447\u0451\u0442\u0443</h3>${accountingContext(r).map((c) => `<p>${esc2(c.id)} \xB7 ${esc2(c.stage)} \xB7 ${esc2(c.number)}<small>${esc2(c.period)} \xB7 \u043E\u0441\u0442\u0430\u0442\u043E\u043A ${money(c.remaining)} \xB7 \u043F\u043E\u0448\u043B\u0438\u043D\u0430 ${money(c.fee)}</small></p>`).join("") || "<p>\u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0445 \u0434\u0435\u043B \u043D\u0435\u0442</p>"}</section>`);
  $2(".modal-body").insertAdjacentHTML("beforeend", '<p class="form-note">\u041B\u044C\u0433\u043E\u0442\u0430 \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u0440\u0430\u0441\u0447\u0451\u0442 \u043D\u0435 \u044F\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u043E\u043F\u043B\u0430\u0442\u043E\u0439. \u0418\u0437\u043C\u0435\u043D\u0451\u043D\u043D\u0443\u044E \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u043F\u0435\u0440\u0435\u0434\u0430\u0451\u0442 \u0431\u0438\u043B\u043B\u0438\u043D\u0433 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435\u043C; \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u043A\u0438\u0434\u043A\u0430 \u0437\u0434\u0435\u0441\u044C \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F.</p>');
  $2(".modal-body").insertAdjacentHTML("beforeend", '<label id="paymentOwnerField"></label>');
  refreshPaymentOwner(r);
}
function ownershipPanel(r) {
  const c = currentCase(r), owners = c?.ownerBalances;
  return `<section class="case-section"><h3>\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0438 \u0438 \u043F\u043E\u0433\u0430\u0448\u0435\u043D\u0438\u0435 \u0434\u043E\u043B\u0435\u0439</h3>${owners ? `<div class="table-frame"><table><thead><tr><th>\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A / \u0434\u043E\u043B\u044F</th><th>\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u043E</th><th>\u041F\u043E\u0433\u0430\u0448\u0435\u043D\u043E</th><th>\u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C</th></tr></thead><tbody>${owners.map((o) => `<tr><td>${esc2(o.name)}<small>${o.share}%</small></td><td>${money(amount(o.initial))}</td><td>${money(amount(o.initial) - amount(o.remaining))}</td><td>${money(amount(o.remaining))}<small>${amount(o.remaining) === 0 ? "\u0414\u043E\u043B\u044F \u043F\u043E\u0433\u0430\u0448\u0435\u043D\u0430" : "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435"}</small></td></tr>`).join("")}</tbody></table></div>` : `<p>${r.owners.map((o) => `${esc2(o.name)} \xB7 ${o.share}%`).join("<br>") || "\u0421\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0438 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u044B"}</p>${r.owners.length ? `<button class="button secondary small" data-ownership="${c ? "assign" : "create"}" data-id="${r.id}">${c ? "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u043F\u043E \u0434\u043E\u043B\u044F\u043C" : "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u0434\u0435\u043B\u0430 \u043F\u043E \u0434\u043E\u043B\u044F\u043C"}</button>` : ""}`}<small>\u0414\u043E\u043B\u0438 \u0438 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0435 \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A. \u041E\u043F\u043B\u0430\u0442\u0430 \u043E\u0434\u043D\u043E\u0433\u043E \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430 \u043D\u0435 \u043F\u043E\u0433\u0430\u0448\u0430\u0435\u0442 \u0434\u043E\u043B\u0433 \u0434\u0440\u0443\u0433\u043E\u0433\u043E.</small></section>`;
}
function refreshPaymentOwner(r) {
  const c = r.cases.find((c2) => c2.id === $2("#paymentCase").value);
  $2("#paymentOwnerField").innerHTML = c?.ownerBalances ? `\u0427\u0435\u0439 \u0434\u043E\u043B\u0433 \u043F\u043E\u0433\u0430\u0448\u0430\u0435\u0442\u0441\u044F<select id="paymentOwner"><option value="">\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430</option>${c.ownerBalances.map((o) => `<option value="${esc2(o.id)}" ${c.ownerBalances.length === 1 ? "selected" : ""}>${esc2(o.name)} \xB7 ${o.share}% \xB7 \u043E\u0441\u0442\u0430\u0442\u043E\u043A ${money(amount(o.remaining))}</option>`).join("")}</select>` : "\u041E\u0431\u0449\u0438\u0439 \u0434\u043E\u043B\u0433 \u041B\u0421: \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043F\u043E \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430\u043C \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u043E";
}
function download(name, text, type = "text/plain;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}
function csv(rows) {
  return "\uFEFF" + window.Papa.unparse(rows, { delimiter: ";", escapeFormulae: true });
}
var sample = () => [{ source_id: "\u0412\u043D\u0435\u0448\u043D\u0438\u0439 \u0431\u0438\u043B\u043B\u0438\u043D\u0433 (\u0434\u0435\u043C\u043E)", company: "\u0423\u041A \xAB\u0414\u0435\u043C\u043E-\u043F\u0430\u0440\u043A\xBB", account: "5001", building: "\u041B\u0435\u0441\u043D\u0430\u044F, 8", flat: "14", as_of: TODAY, period: "01.08.2026 \u2014 30.09.2026", principal: "12000.00", penalty: "250.00", fee: "0", age_days: "60" }];
function importPreview(data) {
  if (role !== "accountant") {
    toast("\u0418\u043C\u043F\u043E\u0440\u0442 \u043E\u0441\u0442\u0430\u0442\u043A\u043E\u0432 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A. \u042E\u0440\u0438\u0441\u0442 \u043F\u0435\u0440\u0435\u0434\u0430\u0451\u0442 \u0437\u0430\u043F\u0440\u043E\u0441 \u043D\u0430 \u0441\u0432\u0435\u0440\u043A\u0443.");
    return;
  }
  preview = previewImport(state, data);
  const invalid = preview.filter((p) => p.errors.length).length;
  modal("\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0440\u0435\u0435\u0441\u0442\u0440\u0430", `${preview.length} \u0441\u0442\u0440\u043E\u043A \xB7 \u043E\u0448\u0438\u0431\u043E\u043A: ${invalid}`, `<div class="table-frame"><table><thead><tr><th>\u0421\u0442\u0440\u043E\u043A\u0430 / \u041B\u0421</th><th>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442</th><th>\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430</th></tr></thead><tbody>${preview.map((p) => `<tr><td>${p.row} \xB7 ${esc2(p.input.account)}</td><td>${badge({ new: "\u041D\u043E\u0432\u044B\u0439 \u041B\u0421", update: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043E\u043A", skip: "\u0411\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439", error: "\u041E\u0448\u0438\u0431\u043A\u0430" }[p.status], p.status === "error" ? "red" : "green")}</td><td>${esc2(p.errors.join("; ") || "\u041A\u043B\u044E\u0447, \u0441\u0443\u043C\u043C\u044B \u0438 \u0434\u0430\u0442\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B")}</td></tr>`).join("")}</tbody></table></div><p class="form-note">\u0415\u0441\u043B\u0438 \u0432 \u0444\u0430\u0439\u043B\u0435 \u0435\u0441\u0442\u044C \u043E\u0448\u0438\u0431\u043A\u0430, \u0432\u0435\u0441\u044C \u0438\u043C\u043F\u043E\u0440\u0442 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D. \u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0442\u043E\u0433\u043E \u0436\u0435 \u0441\u0440\u0435\u0437\u0430 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442 \u0434\u0443\u0431\u043B\u0438.</p>`, `<button class="button" id="confirmImport" ${invalid || !preview.length ? "disabled" : ""}>\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C \u0440\u0435\u0435\u0441\u0442\u0440</button>`);
}
function formError(err) {
  $2("#formError").innerHTML = `<div class="error" role="alert">${esc2(err.message || err)}</div>`;
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("button,[data-open],[data-action]");
  if (!el) return;
  if (el.dataset.ownership) {
    const r = row(el.dataset.id);
    try {
      if (el.dataset.ownership === "create") createOwnerCases(r);
      else assignOwners(r, currentCase(r));
      save();
      render();
      openDrawer(r.id, "overview", true);
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (el.dataset.workspaceView) {
    view = el.dataset.workspaceView;
    selected.clear();
    selectedCases.clear();
    render();
    return;
  }
  if (el.dataset.view) {
    view = el.dataset.view;
    selected.clear();
    selectedCases.clear();
    filters = { ...view === "overview" ? {} : overviewScope, ...view === "registry" ? { stage: "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" } : {}, ...view === "accounts" ? { debtOnly: true } : {} };
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.stageLink) {
    filters = { ...view === "overview" ? overviewScope : { company: filters.company, building: filters.building, houseStatus: filters.houseStatus }, stage: el.dataset.stageLink };
    view = filters.stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" ? "registry" : "cases";
    selected.clear();
    selectedCases.clear();
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.noticeLink) {
    filters = { ...view === "overview" ? overviewScope : {}, notice: el.dataset.noticeLink, debtOnly: true };
    view = "registry";
    selected.clear();
    advanced = true;
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.queue !== void 0) {
    filters = { ...view === "overview" ? overviewScope : {}, queue: el.dataset.queue };
    view = "registry";
    selected.clear();
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.receipt) {
    modal("\u041A\u0432\u0438\u0442\u0430\u043D\u0446\u0438\u044F \u0438 \u043F\u0440\u0435\u0442\u0435\u043D\u0437\u0438\u044F", "\u0414\u0432\u0430 \u043B\u0438\u0441\u0442\u0430 \xB7 \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043C\u0430\u043A\u0435\u0442", receiptPages(row(el.dataset.receipt)));
    return;
  }
  if (el.dataset.caseWork) {
    try {
      const r = row(el.dataset.open);
      selectCase(r, el.dataset.caseId);
      workbench.open(el.dataset.caseWork, r.id, Number(el.dataset.index));
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (el.dataset.open) {
    if (el.dataset.caseId) {
      selectCase(row(el.dataset.open), el.dataset.caseId);
      openDrawer(el.dataset.open, "overview", true);
    } else openDrawer(el.dataset.open);
    return;
  }
  if (el.dataset.segment !== void 0) {
    filters.segment = el.dataset.segment;
    selected.clear();
    renderContent();
    return;
  }
  if (el.dataset.drawerTab) {
    openDrawer(drawerId, el.dataset.drawerTab, true);
    return;
  }
  if (el.dataset.bulk) {
    bulk(el.dataset.bulk);
    return;
  }
  if (el.dataset.singleAction) {
    bulk(el.dataset.singleAction, [el.dataset.id]);
    return;
  }
  if (el.dataset.payment) {
    payment(el.dataset.payment);
    return;
  }
  if (el.dataset.result) {
    recordResult(el.dataset.id, el.dataset.result);
    return;
  }
  if (el.dataset.document) {
    const r = row(el.dataset.document);
    download(`demo-debt-${r.account}.txt`, `\u0414\u0415\u041C\u041E. \u041D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u043C \u0434\u043B\u044F \u0441\u0443\u0434\u0430.
${r.company}
\u041B\u0421 ${r.account}, ${r.building}, \u043A\u0432. ${r.flat}
\u0414\u0430\u043D\u043D\u044B\u0435 \u043D\u0430 ${date(r.asOf)}
\u041F\u0435\u0440\u0438\u043E\u0434: ${r.period}
\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0434\u043E\u043B\u0433: ${money(r.principal)}
\u041F\u0435\u043D\u0438: ${money(r.penalty)}
\u0413\u043E\u0441\u043F\u043E\u0448\u043B\u0438\u043D\u0430: ${money(r.fee)}
\u0418\u0442\u043E\u0433\u043E: ${money(total(r))}
\u0414\u0435\u043B\u043E: ${r.caseId || "\u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u043E"}
${r.claim ? `\u0421\u0443\u0434\u0435\u0431\u043D\u043E\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435: ${money(r.claim.amount)}; \u043F\u0435\u0440\u0438\u043E\u0434 ${r.claim.period}` : ""}`);
    return;
  }
  const action = el.dataset.action;
  if (action === "stageHelp") {
    modal("\u042D\u0442\u0430\u043F\u044B \u0432\u0437\u044B\u0441\u043A\u0430\u043D\u0438\u044F", "\u0421\u043C\u044B\u0441\u043B \u0438 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433", stageGuide());
    return;
  }
  if (action === "close") {
    closeOverlay();
    return;
  }
  if (action === "openSources") {
    closeOverlay();
    view = "sources";
    render();
    return;
  }
  if (action === "filters") {
    advanced = !advanced;
    renderContent();
    return;
  }
  if (action === "clearFilters") {
    filters = { stage: filters.stage };
    selected.clear();
    renderContent();
    return;
  }
  if (action === "clearSelection") {
    selected.clear();
    renderContent();
    return;
  }
  if (action === "clearCaseSelection") {
    selectedCases.clear();
    renderContent();
    return;
  }
  if (action === "chooseChannel") {
    try {
      chooseChannel();
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (action === "template") {
    download("mdo-debt-template.csv", csv([CSV_FIELDS, ...sample().map((r) => CSV_FIELDS.map((k) => r[k]))]), "text/csv;charset=utf-8");
    return;
  }
  if (action === "sampleImport") {
    importPreview(sample());
    return;
  }
  if (action === "export") {
    download("mdo-debt-registry.csv", csv(visible().map((r) => ({ "\u0423\u041A": r.company, "\u0414\u043E\u043C": r.building, "\u041A\u0432\u0430\u0440\u0442\u0438\u0440\u0430": r.flat, "\u041B\u0421": r.account, "\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0434\u043E\u043B\u0433": r.principal / 100, "\u041F\u0435\u043D\u0438": r.penalty / 100, "\u041F\u043E\u0448\u043B\u0438\u043D\u0430": r.fee / 100, "\u041E\u0441\u0442\u0430\u0442\u043E\u043A": total(r) / 100, "\u0421\u0442\u0430\u0434\u0438\u044F": r.stage, "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F": r.category, "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435": recommendation2(r).label, "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A": r.source, "\u041D\u0430 \u0434\u0430\u0442\u0443": r.asOf }))), "text/csv;charset=utf-8");
    return;
  }
  if (el.id === "importTop") {
    view = "sources";
    render();
    return;
  }
  if (el.id === "reset") {
    modal("\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0434\u0435\u043C\u043E?", "\u0422\u043E\u043B\u044C\u043A\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0442\u0435\u0441\u0442\u043E\u0432\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435", '<p class="form-note">\u0412\u0441\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0432 \u044D\u0442\u043E\u043C \u043F\u0440\u043E\u0442\u043E\u0442\u0438\u043F\u0435 \u0431\u0443\u0434\u0443\u0442 \u0437\u0430\u043C\u0435\u043D\u0435\u043D\u044B \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C \u043D\u0430\u0431\u043E\u0440\u043E\u043C. \u0420\u0430\u0431\u043E\u0447\u0430\u044F \u0434\u0438\u0441\u043F\u0435\u0442\u0447\u0435\u0440\u0441\u043A\u0430\u044F \u0438 \u0435\u0451 \u0434\u0430\u043D\u043D\u044B\u0435 \u043D\u0435 \u0437\u0430\u0442\u0440\u0430\u0433\u0438\u0432\u0430\u044E\u0442\u0441\u044F.</p>', '<button class="button" id="confirmReset">\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0434\u0435\u043C\u043E</button>');
    return;
  }
  if (el.id === "confirmReset") {
    state = seed();
    installDemoBilling(state);
    state.display = { notices: true, stages: true };
    filters = {};
    selected.clear();
    selectedCases.clear();
    save();
    closeOverlay();
    render();
    toast("\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u0434\u0435\u043C\u043E-\u0434\u0430\u043D\u043D\u044B\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B");
    return;
  }
  if (el.id === "confirmBulk") {
    try {
      const note = $2("#actionNote").value.trim(), dateValue = $2("#actionDate").value;
      if (!note || !dateValue || dateValue < TODAY) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0438 \u0434\u0430\u0442\u0443 \u043D\u0435 \u0440\u0430\u043D\u0435\u0435 \u0434\u0430\u0442\u044B \u0434\u0435\u043C\u043E");
      const results = execute(state, bulkContext.ids, bulkContext.action, { note, date: dateValue, owner: $2("#actionOwner")?.value });
      save();
      selected.clear();
      closeOverlay();
      render();
      toast(`\u0413\u043E\u0442\u043E\u0432\u043E \u0432 \u0434\u0435\u043C\u043E: ${results.filter((p) => !p.reason).length}. \u0412\u043D\u0435\u0448\u043D\u0438\u0445 \u043E\u0442\u043F\u0440\u0430\u0432\u043E\u043A \u043D\u0435\u0442.`);
    } catch (err) {
      formError(err);
    }
    return;
  }
  if (el.id === "confirmPayment") {
    try {
      if (role !== "accountant") throw Error("\u041D\u0443\u0436\u043D\u0430 \u0440\u043E\u043B\u044C \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0430");
      const reference = $2("#paymentReference").value.trim();
      if (!reference) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u043E\u043C\u0435\u0440 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438 \u0434\u043B\u044F \u0437\u0430\u0449\u0438\u0442\u044B \u043E\u0442 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0433\u043E \u0443\u0447\u0451\u0442\u0430");
      const r = row(drawerId);
      allocate(r, cents($2("#paymentAmount").value), { principal: cents($2("#payPrincipal").value), penalty: cents($2("#payPenalty").value), fee: cents($2("#payFee").value) }, $2("#paymentCase").value || null, { date: $2("#paymentDate").value, source: $2("#paymentSource").value, reference, ownerId: $2("#paymentOwner")?.value });
      save();
      closeOverlay();
      render();
      openDrawer(r.id);
      toast("\u041E\u043F\u043B\u0430\u0442\u0430 \u0440\u0430\u0437\u043D\u0435\u0441\u0435\u043D\u0430 \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C\u0443 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u044E.");
    } catch (err) {
      formError(err);
    }
    return;
  }
  if (el.id === "confirmImport") {
    try {
      if (role !== "accountant") throw Error("\u041D\u0443\u0436\u043D\u0430 \u0440\u043E\u043B\u044C \u0440\u0430\u0441\u0447\u0451\u0442\u0447\u0438\u043A\u0430");
      const n = applyImport(state, preview);
      save();
      closeOverlay();
      render();
      toast(`\u0418\u043C\u043F\u043E\u0440\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D: ${n} \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439, ${preview.length - n} \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439`);
    } catch (err) {
      formError(err);
    }
    return;
  }
  if (el.id === "confirmResult") {
    try {
      completeCommunication(row(resultContext.id), resultContext.eventId, $2("#interactionResult").value, $2("#resultDate").value);
      save();
      closeOverlay();
      render();
      toast("\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B");
    } catch (err) {
      formError(err);
    }
    return;
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "paymentCase") {
    refreshPaymentOwner(row(drawerId));
    return;
  }
  const el = e.target;
  if (el.dataset.display) {
    state.display[el.dataset.display] = el.checked;
    save();
    renderContent();
    return;
  }
  if (el.dataset.caseChoice) {
    el.checked ? selectedCases.add(el.dataset.caseChoice) : selectedCases.delete(el.dataset.caseChoice);
    renderContent();
    return;
  }
  if (el.id === "selectAllCases") {
    visible().forEach((r) => r.cases.filter((c) => !filters.stage || c.stage === filters.stage).forEach((c) => {
      const k = JSON.stringify([r.id, c.id]);
      el.checked ? selectedCases.add(k) : selectedCases.delete(k);
    }));
    renderContent();
    return;
  }
  if (el.id === "roleSelect") {
    role = el.value;
    selected.clear();
    closeOverlay();
    render();
    return;
  }
  if (el.id === "workspaceContext") {
    toast("\u0422\u043E\u0442 \u0436\u0435 \u0440\u0435\u0435\u0441\u0442\u0440 \u0438 \u0434\u0435\u043B\u0430. \u041C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u0442\u043E\u0447\u043A\u0430 \u0432\u0445\u043E\u0434\u0430, \u043D\u0435 \u0434\u0430\u043D\u043D\u044B\u0435.");
    return;
  }
  if (el.dataset.overviewFilter) {
    overviewScope[el.dataset.overviewFilter] = el.value;
    if (el.dataset.overviewFilter === "company") overviewScope.building = "";
    renderContent();
    return;
  }
  if (["reportFrom", "reportTo"].includes(el.id)) {
    const from = $2("#reportFrom").value, to = $2("#reportTo").value;
    if (!from || !to || from > to || to > TODAY) {
      toast("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u0430\u0442\u044B \u043F\u0435\u0440\u0438\u043E\u0434\u0430");
      renderContent();
      return;
    }
    reportFrom = from;
    reportTo = to;
    renderContent();
    return;
  }
  if (el.id === "debtOnly") {
    filters.debtOnly = el.checked;
    selected.clear();
    renderContent();
    return;
  }
  if (el.dataset.filter) {
    filters[el.dataset.filter] = el.value;
    if (view === "cases" && filters.stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430") view = "registry";
    selected.clear();
    renderContent();
    return;
  }
  if (el.dataset.select) {
    el.checked ? selected.add(el.dataset.select) : selected.delete(el.dataset.select);
    renderContent();
    return;
  }
  if (el.id === "selectAll") {
    visible().forEach((r) => el.checked ? selected.add(r.id) : selected.delete(r.id));
    renderContent();
    return;
  }
  if (el.id === "commFilter") {
    commFilter = el.value;
    renderContent();
    return;
  }
  if (el.id === "commStatus") {
    commStatus = el.value;
    renderContent();
    return;
  }
  if (["categoryChange", "ownerChange", "stageChange"].includes(el.id)) {
    if (role === "accountant") {
      toast("\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0434\u0435\u043B\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u044E\u0440\u0438\u0441\u0442\u0443");
      openDrawer(drawerId);
      return;
    }
    const r = row(drawerId);
    try {
      if (el.id === "stageChange") changeStage(r, el.value);
      if (el.id === "categoryChange") {
        r.category = el.value;
        r.disputed = el.value === "\u041E\u0441\u043F\u0430\u0440\u0438\u0432\u0430\u0435\u0442 \u0434\u043E\u043B\u0433";
      }
      if (el.id === "ownerChange") r.owner = el.value;
      save();
      render();
      openDrawer(r.id);
      toast("\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u0432 \u0434\u0435\u043C\u043E");
    } catch (err) {
      toast(err.message);
      openDrawer(r.id);
    }
    return;
  }
  if (el.id === "importFile") {
    const file2 = el.files[0];
    if (!file2) return;
    if (file2.size > 2 * 1024 * 1024) {
      toast("\u0424\u0430\u0439\u043B \u0431\u043E\u043B\u044C\u0448\u0435 2 \u041C\u0411");
      return;
    }
    try {
      const result = window.Papa.parse(await file2.text(), { header: true, delimiter: ";", skipEmptyLines: "greedy" });
      if (result.errors.length) throw Error(result.errors[0].message);
      if (result.data.length > 1e3) throw Error("\u0412 \u0434\u0435\u043C\u043E \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0434\u043E 1000 \u0441\u0442\u0440\u043E\u043A \u0437\u0430 \u0438\u043C\u043F\u043E\u0440\u0442");
      importPreview(result.data);
    } catch (err) {
      toast(`\u0424\u0430\u0439\u043B \u043D\u0435 \u043F\u0440\u0438\u043D\u044F\u0442: ${err.message}`);
    }
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    const pos = e.target.selectionStart;
    filters.search = e.target.value;
    selected.clear();
    renderContent();
    $2("#search").focus();
    $2("#search").setSelectionRange(pos, pos);
  }
  if (["paymentAmount", "payPrincipal", "payPenalty", "payFee"].includes(e.target.id)) {
    try {
      $2("#payRemaining").textContent = money(cents($2("#paymentAmount").value || "0") - ["#payPrincipal", "#payPenalty", "#payFee"].reduce((s, k) => s + cents($2(k).value || "0"), 0));
    } catch {
      $2("#payRemaining").textContent = "\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u0443\u043C\u043C\u044B";
    }
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeOverlay();
  if (e.key === "Enter" && e.target.matches("[role=button][data-open]")) {
    if (e.target.dataset.caseId) selectCase(row(e.target.dataset.open), e.target.dataset.caseId);
    openDrawer(e.target.dataset.open, "overview", !!e.target.dataset.caseId);
  }
  if (e.key === "Tab" && $2("#overlay").innerHTML) {
    const all = [...$2("#overlay").querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,a[href]")].filter((x) => x.getClientRects().length), first = all[0], last = all.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});
function openCaseDrawer(id, tab = "overview") {
  if (workspaceViews.includes(view)) {
    filters.stage = currentCase(row(id))?.stage || "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430";
    view = filters.stage === "\u0411\u0435\u0437 \u0434\u0435\u043B\u0430" ? "registry" : "cases";
    render();
  }
  openDrawer(id, tab, true);
}
var interactions = installInteractions({ getState: () => state, getRole: () => role, save, render, modal, close: closeOverlay, toast, openDrawer: openCaseDrawer });
var workbench = installWorkbench({ getState: () => state, getRole: () => role, save, render, modal, openDrawer: openCaseDrawer, toast, close: closeOverlay, bulk, payment, notify: (r) => interactions.notify([[r.id, r.caseId]]), enforcement: (r) => interactions.enforcement(r.id), showSources: () => {
  closeOverlay();
  view = "sources";
  render();
}, recordResult });
render();
if (storageWarning) toast(storageWarning);
