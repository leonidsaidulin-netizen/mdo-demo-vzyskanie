import {TODAY,STAGES as ALL_STAGES,CATEGORIES,ACTIONS,OUTCOMES,money,total,days,seed,filterRows,plan,execute,allocate,changeStage,CSV_FIELDS,previewImport,applyImport,cents,completeCommunication,upgradeUntouchedSampleDetails} from './model.mjs';
import {CHANNELS,NOTICE_LABELS,STAGE_INFO,workRows,migrate,QUEUES,queueFor} from './workflow.mjs';
import {overview,stageGuide,stageContext,receiptPages,noticeBadge} from './workspace-views.mjs';
import {queueOverview,nextAction,casesPanel,legalPanel,dataPanel,documentsPanel,installWorkbench,demoControls} from './workbench.mjs';
import {currentCase,unassigned,amount,workRecord,selectCase,stagePortions,createOwnerCases} from './cases.mjs';
import {assignOwners,ownerLabel,ownersSummary} from './ownership.mjs';
import {accountingContext,stageDocumentEntries,stageAge} from './documents.mjs';
import {roleRecommendation,roleCaseProgress,visibleStages} from './role-actions.mjs';
import {installInteractions} from './interaction-ui.mjs';
import {installDemoBilling,installOwnerExample,DEMO_COMPANY} from './demo-billing.mjs';
import {caseNotices} from './lawyer-journey.mjs';
const $=s=>document.querySelector(s), KEY='mdo-debt-demo-v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<i data-lucide="${n}"></i>`;
const date=s=>s?new Date(s.slice(0,10)+'T12:00:00').toLocaleDateString('ru-RU'):'';
let state=seed(),storageWarning='';
try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved?.version===1&&Array.isArray(saved.rows)&&saved.rows.every(r=>Array.isArray(r.events)&&Array.isArray(r.payments)&&['principal','penalty','fee'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0)))state=saved;else if(saved)storageWarning='Сохранённые демо-данные несовместимы. Загружен исходный пример.';}catch{storageWarning='Хранилище браузера недоступно. Изменения действуют до закрытия страницы.';}
state=migrate(state);
upgradeUntouchedSampleDetails(state);
if(installDemoBilling(state)){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageWarning='Учебные сценарии доступны, но хранилище браузера заполнено.';}}
let view='overview',filters={},selected=new Set(),advanced=false,drawerId=null,drawerTab='overview',returnFocus=null,preview=[];
if(installOwnerExample(state)){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageWarning='Не удалось сохранить пример долей';}}
let reportFrom='2026-10-01',reportTo=TODAY,role='lawyer',overviewScope={company:DEMO_COMPANY,building:'',houseStatus:''};
let STAGES=ALL_STAGES;
const recommendation=r=>roleRecommendation(r,role);
const caseProgress=(c,r)=>roleCaseProgress(c,r,role);
let selectedCases=new Set();
const views=[['overview','Сводка','chart-no-axes-combined'],['accounts','Реестр должников','users'],['registry','Дела','folders'],['payments','Оплаты','wallet']];
const workspaceViews=['registry','cases','board','communications'];
state.display ||= {notices:true,stages:true};
const options=(arr,current,empty)=>`${empty?`<option value="">${esc(empty)}</option>`:''}${arr.map(v=>`<option value="${esc(v)}" ${current===v?'selected':''}>${esc(v)}</option>`).join('')}`;
const badge=(text,tone='')=>`<span class="badge ${tone}">${esc(text)}</span>`;
const visible=()=>workRows(filterRows(state.rows,{...filters,stage:''}),{...filters,debtOnly:view==='accounts'||filters.debtOnly}).filter(r=>(!filters.houseStatus||(r.houseStatus||'unknown')===filters.houseStatus)&&(!filters.stage||stagePortions(r).some(p=>p.stage===filters.stage&&(p.id||p.amount>0)))&&(view!=='work'||queueFor(r)));
const row=id=>state.rows.find(r=>r.id===id);
const initIcons=()=>window.lucide?.createIcons();
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{throw Error('Хранилище браузера заполнено или недоступно. Изменение не сохранено; не закрывайте страницу.');}}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function render(){
  $('#sideNav').innerHTML=[...views,...(role==='accountant'?[['sources','Импорт данных','database']]:[])].map(([v,label,i])=>`<button data-view="${v}" class="side-nav ${v===view||(v==='registry'&&workspaceViews.includes(view))?'active':''}">${icon(i)}${label}</button>`).join('');
  $('#tabs').innerHTML=[...views,...(role==='accountant'?[['sources','Импорт данных','database']]:[])].map(([v,label,i])=>`<button data-view="${v}" class="tab ${v===view||(v==='registry'&&workspaceViews.includes(view))?'active':''}">${icon(i)}${label}</button>`).join('');
  $('#importTop').hidden=role!=='accountant';
  $('#metrics').hidden=true;
  $('#roleHost').innerHTML=`<label>Роль в демо<select id="roleSelect"><option value="lawyer" ${role==='lawyer'?'selected':''}>Юрист</option><option value="accountant" ${role==='accountant'?'selected':''}>Расчётчик</option></select></label>`;
  $('.side-bottom').textContent=role==='lawyer'?'Юрист · работа с делами':'Расчётчик · учёт поступлений';
  renderContent();initIcons();
}
function filterBar(){return `<div class="filters"><div class="search">${icon('search')}<input id="search" aria-label="Поиск должника" placeholder="Адрес, ЛС или дело" value="${esc(filters.search||'')}"></div><select data-filter="building" aria-label="Дом">${options([...new Set(state.rows.map(r=>r.building))],filters.building,'Все дома')}</select><select data-filter="stage" aria-label="Стадия">${options(STAGES,filters.stage,'Все этапы')}</select><select data-filter="company" aria-label="Управляющая компания">${options([...new Set(state.rows.map(r=>r.company))],filters.company,'Все УК')}</select><button class="icon-button" data-action="filters" title="Сумма, срок, подъезд и доставка" aria-label="Дополнительные фильтры" aria-expanded="${advanced}">${icon('sliders-horizontal')}</button></div>${advanced?`<div class="advanced"><label>Подъезд<select data-filter="entrance">${options([...new Set(state.rows.map(r=>r.entrance).filter(Boolean))],filters.entrance,'Все')}</select></label><label>Долг от, ₽<input type="number" min="0" data-filter="minDebt" value="${esc(filters.minDebt||'')}"></label><label>Долг до, ₽<input type="number" min="0" data-filter="maxDebt" value="${esc(filters.maxDebt||'')}"></label><label>Просрочка от, дней<input type="number" min="0" data-filter="minAge" value="${esc(filters.minAge||'')}"></label><label>Уведомление<select data-filter="notice"><option value="">Все результаты</option>${Object.entries(NOTICE_LABELS).map(([v,l])=>`<option value="${v}" ${filters.notice===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Ответственный<select data-filter="owner">${options([...new Set(state.rows.map(r=>r.owner))],filters.owner,'Все')}</select></label><label>Категория<select data-filter="category">${options(CATEGORIES,filters.category,'Все')}</select></label></div>`:''}${Object.values(filters).some(Boolean)?`<div class="filter-summary"><span>${filters.queue==='notify'?'К первому уведомлению · ':filters.queue==='check'?'Сначала сверка · ':filters.queue==='paid'?'Погашенные · ':''}${filters.notice?NOTICE_LABELS[filters.notice]+' · ':''}${filters.stage?esc(filters.stage)+' · ':''}Выбрано по условиям: ${visible().length} ЛС</span><button class="button ghost small" data-action="clearFilters">Сбросить</button></div>`:''}`;}
function segments(){const scope=filterRows(state.rows,{company:filters.company,building:filters.building});return `<div class="segments">${STAGES.map(stage=>`<button class="segment ${filters.stage===stage?'active':''}" data-stage-link="${stage}">${stage==='Без дела'?'Ещё без дела':stage} · ${stage==='Без дела'?scope.filter(r=>amount(unassigned(r))>0).length:scope.reduce((n,r)=>n+r.cases.filter(c=>c.stage===stage).length,0)}</button>`).join('')}</div>`;}
function selectedBar(){return selected.size?`<div class="selection-bar"><strong>Выбрано: ${selected.size}</strong>${role==='lawyer'?`<button class="button small" data-action="chooseChannel">${icon('send')} Подготовить уведомление</button>`:''}<button class="icon-button" data-action="clearSelection" title="Снять выбор" aria-label="Снять выбор">${icon('x')}</button></div>`:'';}
function renderContent(){
  STAGES=visibleStages(filterRows(state.rows,{company:filters.company,building:filters.building}));
  if(filters.stage==='Суд: уточнить'&&!STAGES.includes(filters.stage)){filters.stage='Без дела';if(workspaceViews.includes(view))view='registry';}
  if(workspaceViews.includes(view)&&!filters.stage){filters.stage='Без дела';view='registry';}
  $('.heading h1').textContent=workspaceViews.includes(view)?STAGE_INFO[filters.stage]?.title||'Дела':view==='accounts'?'Реестр должников':view==='overview'?'Сводка':view==='payments'?'Оплаты':'Импорт данных';
  if(view==='overview')$('#content').innerHTML=overview(state.rows,reportFrom,reportTo,overviewScope);
  if(view==='overview'){
    const notices=$('#content .notification-strip');if(notices)notices.closest('.overview-section').remove();
  }
  if(view==='work'){renderRegistry();$('#content').insertAdjacentHTML('afterbegin',queueOverview(state.rows));}
  if(view==='registry')renderRegistry();if(view==='cases')renderCaseList();if(view==='board')renderBoard();if(view==='communications')renderCommunications();if(view==='payments')renderPayments();if(view==='sources')renderSources();
  if(view==='accounts'){
    renderRegistry();$('#content .segments')?.remove();$('#content .section-head h2').textContent='Должники';$('#content [data-view="board"]')?.remove();
    [...$('#content tbody').rows].forEach((tr,i)=>{const r=visible()[i],w=workRecord(r),c=filters.stage?r.cases.find(c=>c.stage===filters.stage):currentCase(w),p=caseProgress(c,r);tr.cells[3].innerHTML=[...new Set(stagePortions(r).map(x=>x.stage))].map(s=>badge(s)).join('')||'Дел нет';const action=tr.cells[4].querySelector('button');action.innerHTML=`${esc(p.next)}<small>${esc(p.label)}</small>`;if(c)action.dataset.caseId=c.id;});
    $('#content .table-end span').textContent=`В выборке ${visible().length} ЛС · остаток ${money(visible().reduce((s,r)=>s+total(r),0))}`;
  }
  if(view==='sources'&&role!=='accountant'){for(const el of $('#content').querySelectorAll('#importFile,[data-action="sampleImport"]'))el.disabled=true;$('#content').insertAdjacentHTML('afterbegin','<div class="notice">Юрист просматривает источники. Реестры и расчёты загружает расчётчик.</div>');}
  if(['registry','work','cases','board'].includes(view))$('#content .filters')?.insertAdjacentHTML('beforeend',`<select data-filter="houseStatus" aria-label="Статус дома"><option value="">Все статусы домов</option><option value="active" ${filters.houseStatus==='active'?'selected':''}>В управлении</option><option value="departed" ${filters.houseStatus==='departed'?'selected':''}>Выбывшие дома</option><option value="unknown" ${filters.houseStatus==='unknown'?'selected':''}>Статус не загружен</option></select>`);
  $('#content .advanced')?.insertAdjacentHTML('beforeend',`<label>Просрочка до, дней<input type="number" min="0" data-filter="maxAge" value="${esc(filters.maxAge??'')}"></label>`);
  if(view==='work')$('#content .segments')?.remove();
  if(view==='registry'||view==='work'){
    for(const [i,tr] of [...$('#content tbody').rows].entries()){const r=visible()[i];tr.cells[3].innerHTML=[...new Set(stagePortions(r).map(x=>x.stage))].map(s=>badge(s,s==='Завершено'?'green':'pink')).join('')+noticeBadge(r);}
    const caption=$('#content .filter-summary span');if(caption&&filters.queue)caption.textContent=`${QUEUES[filters.queue]} · По условиям: ${visible().length} ЛС`;
    if(filters.stage==='Без дела'){
      $('#content th:nth-child(3)').textContent='Долг вне дел';
      [...$('#content tbody').rows].forEach((tr,i)=>{const r=visible()[i];tr.cells[2].innerHTML=`${money(amount(unassigned(r)))}<small>Всего по ЛС: ${money(total(r))}</small><small>На ${date(r.asOf)}</small>`;});
      $('#content .table-end span').textContent=`${visible().length} ЛС · долг вне дел ${money(visible().reduce((s,r)=>s+amount(unassigned(r)),0))}`;
      $('#content .stage-context')?.remove();
      [...$('#content tbody').rows].forEach((tr,i)=>{const r=visible()[i],rec=recommendation({...r,caseId:null,claim:null,stage:'Без дела',_caseView:true});tr.cells[3].innerHTML=badge('Без дела');tr.cells[4].querySelector('button').innerHTML=`${esc(rec.label)}<small>${esc(rec.detail)}</small>`;});
    }
  }
  if(workspaceViews.includes(view)){
    $('#content .section-head')?.remove();
    $('#content [data-filter="stage"]')?.remove();
    if(!$('#content .segments'))$('#content').insertAdjacentHTML('afterbegin',segments());
    const index=STAGES.indexOf(filters.stage);
    $('#content .segments').insertAdjacentHTML('afterend',`<div class="stage-navigation"><span>${esc(STAGE_INFO[filters.stage].meaning)}</span><div>${index>0?`<button class="icon-button" data-stage-link="${STAGES[index-1]}" title="Посмотреть: ${esc(STAGE_INFO[STAGES[index-1]].title)}" aria-label="Предыдущая стадия списка">${icon('arrow-left')}</button>`:''}${index<STAGES.length-1?`<button class="icon-button" data-stage-link="${STAGES[index+1]}" title="Посмотреть: ${esc(STAGE_INFO[STAGES[index+1]].title)}" aria-label="Следующая стадия списка">${icon('arrow-right')}</button>`:''}</div></div>`);
  }
  if(['registry','cases','board'].includes(view))$('#content .filters')?.insertAdjacentHTML('beforeend',`<select data-filter="queue" aria-label="Что сделать"><option value="">Все задачи</option>${Object.entries(QUEUES).map(([k,l])=>`<option value="${k}" ${filters.queue===k?'selected':''}>${l}</option>`).join('')}</select>`);
  if(['registry','accounts','work'].includes(view)){
    [...$('#content tbody').rows].forEach((tr,i)=>tr.querySelector('.debtor-link').insertAdjacentHTML('beforeend',`<small>${esc(ownersSummary(visible()[i]))}</small>`));
  }
  initIcons();
}
function renderCaseList(){
  const list=visible().flatMap(r=>r.cases.filter(c=>!filters.stage||c.stage===filters.stage).map(c=>({r,c})));
  $('#content').innerHTML=`<div class="section-head"><h2>${esc(filters.stage?STAGE_INFO[filters.stage].title:'Дела по взысканию')}</h2><button class="button secondary small" data-view="registry">Все должники</button></div>${filterBar()}<div class="table-frame"><table><thead><tr><th>Дело / адрес</th><th>Период</th><th>Осталось погасить</th><th>Что зафиксировано</th><th>Следующее действие</th></tr></thead><tbody>${list.map(({r,c})=>{const p=caseProgress(c);return `<tr><td><button class="debtor-link" data-open="${r.id}" data-case-id="${esc(c.id)}">${esc(r.building)}, кв. ${esc(r.flat)}<small>ЛС ${esc(r.account)} · ${esc(c.id)}</small><small>${esc(ownerLabel(c))}</small></button></td><td>${esc(c.period)}</td><td>${money(amount(c.remaining))}${!c.balanceConfirmed?'<small>Сумма требует уточнения</small>':''}</td><td>${esc(p.label)}<small>${esc(c.legal?.number||c.agreement?.number||'')}</small></td><td><button class="button ghost small" data-open="${r.id}" data-case-id="${esc(c.id)}">${esc(p.next)}</button></td></tr>`;}).join('')}</tbody></table>${!list.length?'<div class="empty">Нет дел по выбранным условиям</div>':''}</div>`;
  const table=$('#content table');
  table.classList.add('case-table');
  [...table.tBodies[0].rows].forEach(tr=>[...tr.cells].forEach((td,i)=>td.dataset.label=['Дело / адрес','Период','Осталось погасить','Что зафиксировано','Следующее действие'][i]));
  [...table.tBodies[0].rows].forEach((tr,i)=>{const {r,c}=list[i],p=caseProgress(c,r);
    tr.querySelector('.debtor-link').insertAdjacentHTML('beforeend',`<small>${esc(ownersSummary(r))}</small>`);
    tr.cells[1].insertAdjacentHTML('beforeend',`<small class="stage-age">${esc(stageAge(c))}</small>`);
    tr.cells[3].innerHTML=`${esc(p.label)}${c.stage!=='Завершено'&&(c.legal?.note||(['Уведомление','Соглашение'].includes(c.stage)&&c.contactResult?.note))?`<small>${esc(c.legal?.note||c.contactResult.note)}</small>`:''}<button class="document-link" data-open="${r.id}" data-case-id="${esc(c.id)}" data-case-work="documents">${icon('files')} Документы дела: ${[...(c.drafts||[]),...(c.documents||[])].filter(d=>!d.archived).length}</button>${p.dataIssue?`<small class="data-warning">Проверка суммы: ${esc(p.dataIssue)}</small>`:''}`;
    tr.cells[4].querySelector('button').textContent=p.next;
    tr.cells[4].querySelector('button').dataset.caseWork=p.work;
    tr.cells[4].querySelector('button').dataset.index=c.schedule?.findIndex(x=>!x.paid)??-1;
    const due=c.stage==='Завершено'?null:c.stage==='Соглашение'?c.schedule?.filter(x=>!x.paid).sort((a,b)=>a.date.localeCompare(b.date))[0]?.date:c.legal?.nextDate||c.communicationNextDate;
    tr.cells[4].insertAdjacentHTML('beforeend',`<small>${c.stage==='Завершено'?'Дело завершено':due?'Контроль: '+esc(due):'Срок контроля не назначен'}</small>`);
  });
  if(filters.stage==='Уведомление'){
    table.tHead.rows[0].cells[3].textContent='Статус уведомления';
    table.tHead.rows[0].cells[3].insertAdjacentHTML('afterend','<th>Уведомление: каналы и результат</th>');
    [...table.tBodies[0].rows].forEach((tr,i)=>{const {r,c}=list[i],events=caseNotices(r,c);tr.cells[3].insertAdjacentHTML('afterend',`<td data-label="Уведомление: каналы и результат">${events.map(e=>`<small><strong>${esc(ACTIONS[e.action])}</strong> · ${esc(e.status)} · ${date(e.at)}</small>`).join('')||'Уведомление не отправлялось'}${events.length?`<button class="document-link" data-open="${r.id}" data-case-id="${esc(c.id)}" data-case-work="history">История отправок</button>`:''}</td>`);});
  }
}
function renderRegistry(){
  const rows=visible();
  selected=new Set([...selected].filter(id=>rows.some(r=>r.id===id)));
  $('#content').innerHTML=`<div class="section-head"><h2>Должники и дела</h2><div class="split"><button class="icon-button" data-view="board" title="Доска дел" aria-label="Доска дел">${icon('columns-3')}</button><button class="icon-button" data-action="export" title="Выгрузить выборку" aria-label="Выгрузить выборку">${icon('download')}</button></div></div>
    ${segments()}${filterBar()}${stageContext(filters.stage)}${selectedBar()}
    <div class="table-frame"><table class="debt-table"><thead><tr><th><input type="checkbox" aria-label="Выбрать все отфильтрованные" id="selectAll" ${rows.length&&rows.every(r=>selected.has(r.id))?'checked':''}></th><th>Лицевой счёт / адрес</th><th>Остаток долга</th><th>Этап / уведомление</th><th>Предлагаемое действие</th><th>Ответственный</th><th></th></tr></thead><tbody>${rows.map(r=>{const rec=recommendation(r);return `<tr><td><input type="checkbox" data-select="${r.id}" aria-label="Выбрать ЛС ${esc(r.account)}" ${selected.has(r.id)?'checked':''}></td><td><button class="debtor-link" data-open="${r.id}">${esc(r.building)}, кв. ${esc(r.flat)}<small>ЛС ${esc(r.account)} · подъезд ${esc(r.entrance||'не указан')}</small></button><small>${esc(r.company)}</small></td><td class="money">${money(total(r))}<small>${r.age?r.age+' дн. просрочки':'Нет просрочки'}</small><small>На ${date(r.asOf)}</small></td><td>${badge(r.stage,r.stage==='Без дела'?'':r.stage==='Завершено'?'green':'pink')}${r.stageNeedsReview?badge('Вид суда уточнить','amber'):''}${noticeBadge(r)}</td><td><button class="recommend ${rec.tone}" data-open="${r.id}">${esc(rec.label)}<small>${esc(rec.detail)}</small></button></td><td>${esc(r.owner)}<small>${esc(r.source)}</small></td><td><button class="icon-button" data-open="${r.id}" title="Открыть лицевой счёт" aria-label="Открыть ЛС ${esc(r.account)}">${icon('chevron-right')}</button></td></tr>`;}).join('')}</tbody></table>${!rows.length?'<div class="empty">Нет ЛС по выбранным условиям</div>':''}</div><div class="table-end"><span>${rows.length} из ${state.rows.length} ЛС · остаток выборки ${money(rows.reduce((s,r)=>s+total(r),0))}</span><span>Демо на ${date(TODAY)}</span></div>`;
}
function renderBoard(){
  const rows=visible(),cases=rows.flatMap(r=>r.cases.map(c=>({r,c})));
  $('#content').innerHTML=`<div class="section-head"><h2>Дела по этапам взыскания</h2><button class="button secondary small" data-view="registry">Реестр должников</button></div>${filterBar()}<div class="board">${STAGES.slice(1).map(stage=>{
    const list=cases.filter(({c})=>c.stage===stage&&(!filters.stage||c.stage===filters.stage));
    return `<section class="column"><h3>${esc(stage)} · ${list.length}</h3><div class="column-total">${money(list.reduce((sum,{c})=>sum+amount(c.remaining),0))}</div>${list.map(({r,c})=>{const progress=caseProgress(c,r),rec={label:progress.next,detail:progress.label};return `<article class="case-card" role="button" tabindex="0" data-open="${r.id}" data-case-id="${esc(c.id)}" aria-label="Дело ${esc(c.id)}"><small>${esc(c.id)} · ${esc(ownerLabel(c))} · ${esc(c.period)}</small><h4>${esc(r.building)}, кв. ${esc(r.flat)}</h4><small>ЛС ${esc(r.account)}</small><div class="case-amount">${money(amount(c.remaining))}</div><div class="next"><strong>${esc(rec.label)}</strong><small>${esc(rec.detail)}</small></div><small>${esc(r.owner)}</small></article>`;}).join('')||'<p class="empty compact">Нет дел</p>'}</section>`;
  }).join('')}</div>`;
}
let commFilter='',commStatus='';
function renderCommunications(){
  const records=filterRows(state.rows,{company:filters.company,building:filters.building}).flatMap(r=>r.events.filter(e=>[...CHANNELS,'court'].includes(e.action)).map(e=>({r,e}))).filter(({e})=>(!commFilter||e.action===commFilter)&&(!commStatus||e.status===commStatus)).sort((a,b)=>b.e.at.localeCompare(a.e.at));
  $('#content').innerHTML=`<div class="section-head"><div><h2>История коммуникаций</h2><p>Адресат, канал, результат и следующий шаг остаются в одном месте</p></div><button class="button secondary small" data-view="registry">${icon('users')} Выбрать должников</button></div><div class="split" style="margin-bottom:18px"><select id="commFilter" aria-label="Канал">${options(['',...CHANNELS,'court'].map(x=>x),commFilter).replace('<option value="" >','<option value="" >')}</select><select id="commStatus" aria-label="Статус коммуникации">${options(['Подготовлено (демо)','Доставлено (демо)','Отменено: долг погашен'],commStatus,'Все результаты')}</select><span class="compact">${records.length} действий</span></div><div class="table-frame"><table><thead><tr><th>Дата / канал</th><th>Лицевой счёт</th><th>Результат</th><th>Следующее действие</th></tr></thead><tbody>${records.map(({r,e})=>`<tr><td>${date(e.at)}<small>${esc(e.label)}</small></td><td><button class="debtor-link" data-open="${r.id}">${esc(r.building)}, кв. ${esc(r.flat)}<small>ЛС ${esc(r.account)}</small></button></td><td>${badge(e.status,e.status.includes('Отменено')?'':e.status.includes('Доставлено')?'green':'amber')}<small>${esc(e.note)}</small></td><td>${esc(r.next)}<small>${date(r.nextDate)} · ${esc(r.owner)}</small></td></tr>`).join('')}</tbody></table>${!records.length?'<div class="empty">Нет действий по выбранным условиям</div>':''}</div>`;
  [...$('#commFilter').options].forEach(o=>o.textContent=ACTIONS[o.value]||'Все каналы');
  $('#commStatus').innerHTML=options([...new Set([...OUTCOMES,...state.rows.flatMap(r=>r.events.filter(e=>[...CHANNELS,'court'].includes(e.action)).map(e=>e.status))])],commStatus,'Все результаты');
  [...$('#content tbody').rows].forEach((tr,i)=>{
    const {r,e}=records[i];
    const c=r.cases.find(c=>c.id===e.caseId),progress=caseProgress(c,r),rec={label:progress.next,detail:progress.label};tr.cells[3].innerHTML=`${esc(rec.label)}<small>${esc(rec.detail)}</small>`;
    if(c)tr.cells[1].querySelector('button').dataset.caseId=c.id;
    if(e.date)tr.cells[0].insertAdjacentHTML('beforeend',`<small>План: ${date(e.date)}</small>`);
    if(CHANNELS.includes(e.action)&&['Подготовлено (демо)','Отправлено (демо)','Сформировано для печати (демо)'].includes(e.status))tr.cells[2].insertAdjacentHTML('beforeend',`<button class="button ghost small" data-result="${esc(e.id)}" data-id="${r.id}">Отметить результат</button>`);
  });
}
function renderPayments(){
  const scoped=filterRows(state.rows,{company:filters.company,building:filters.building}),pending=scoped.filter(r=>r.unallocated);
  const payments=scoped.flatMap(r=>r.payments.filter(p=>p.at.slice(0,10)>=reportFrom&&p.at.slice(0,10)<=reportTo).map(p=>({r,p}))).sort((a,b)=>b.p.at.localeCompare(a.p.at));
  $('#content').innerHTML=`<div class="section-head"><h2>Оплаты</h2></div><div class="filters"><select data-filter="company" aria-label="Управляющая компания">${options([...new Set(state.rows.map(r=>r.company))],filters.company,'Все УК')}</select><select data-filter="building" aria-label="Дом">${options([...new Set(scoped.map(r=>r.building))],filters.building,'Все дома')}</select><label>С <input type="date" id="reportFrom" value="${reportFrom}" max="${TODAY}"></label><label>По <input type="date" id="reportTo" value="${reportTo}" max="${TODAY}"></label></div>
  <h3>Поступления за период: ${money(payments.reduce((s,{p})=>s+p.amount,0))}</h3><div class="table-frame"><table><thead><tr><th>Дата / источник</th><th>Лицевой счёт / дело</th><th>Всего</th><th>Основной долг</th><th>Пени</th><th>Пошлина</th></tr></thead><tbody>${payments.map(({r,p})=>`<tr><td>${date(p.at)}<small>${esc(p.source||'Источник не зафиксирован')} · ${esc(p.reference||'Без номера')}</small></td><td><button class="debtor-link" data-open="${r.id}" ${p.caseId?`data-case-id="${esc(p.caseId)}"`:''}>${esc(r.building)}, кв. ${esc(r.flat)}<small>ЛС ${esc(r.account)} · ${esc(p.caseId||'Вне дела')} · ${esc(p.ownerName||'Общий долг ЛС')}</small></button></td><td class="money">${money(p.amount)}</td><td>${money(p.principal)}</td><td>${money(p.penalty)}</td><td>${money(p.fee)}</td></tr>`).join('')}</tbody></table>${!payments.length?'<div class="empty">За выбранный период поступлений нет</div>':''}</div>`;
}
function renderSources(){
  $('#content').innerHTML=`<div class="section-head"><div><h2>Источники задолженности</h2><p>Общий реестр независимо от того, кто ведёт начисления</p></div></div><div class="source-grid"><section><h3>Источники в демо</h3><div class="source-list">${[...new Set(state.rows.map(r=>r.source))].map(s=>{const rows=state.rows.filter(r=>r.source===s),stale=rows.some(r=>days(r.asOf)>7);return `<div class="source-row">${icon(s==='РЦ МДО'?'database':'file-spreadsheet')}<div><strong>${esc(s)}</strong><small>${rows.length} ЛС · ${money(rows.reduce((t,r)=>t+total(r),0))}</small><small>Долг рассчитан на: ${[...new Set(rows.map(r=>date(r.asOf)))].join(', ')}</small></div>${badge(stale?'Нужны свежие данные':'Тестовые данные',stale?'amber':'')}</div>`;}).join('')}</div><div class="notice">Автоматическое получение данных из РЦ пока не подключено. Сейчас доступна загрузка файла задолженности.</div></section><section class="source-block"><h3>Загрузка задолженности по лицевым счетам</h3><p>CSV в UTF-8, разделитель «;». Суммы в рублях. Ключ: источник + УК + лицевой счёт. В файле указываются долг, пени и госпошлина на конкретную дату. Загрузка обновляет эти суммы, а не прибавляет их повторно.</p><div class="split"><button class="button secondary small" data-action="template">${icon('download')} Шаблон CSV</button><button class="button secondary small" data-action="sampleImport">Проверить пример</button></div><div class="upload-zone">${icon('upload')}<label>Выбрать реестр<input type="file" id="importFile" accept=".csv,text/csv"></label><small>Только синтетические данные · до 2 МБ</small></div><p>Проверяются даты расчёта, дубли, суммы и конфликт с уже разнесённой оплатой. Судебное требование остаётся неизменным.</p></section></div>${state.imports.length?`<h3>Журнал импортов</h3><div class="source-list">${state.imports.map(i=>`<div class="source-row"><div>${date(i.at)}<small>Обновлено / добавлено: ${i.changed} · без изменений: ${i.skipped}</small></div>${badge('Проверено в демо','green')}</div>`).join('')}</div>`:''}`;
}
function lockBackground(lock){$('.shell').inert=lock;$('.sidebar').inert=lock;document.body.style.overflow=lock?'hidden':'';}
function showOverlay(html){if(!$('#overlay').innerHTML)returnFocus=document.activeElement;$('#overlay').innerHTML=html;lockBackground(true);initIcons();$('#overlay').querySelector('button,input,select,textarea')?.focus();}
function closeOverlay(){drawerId=null;$('#overlay').innerHTML='';lockBackground(false);returnFocus?.focus();}
function openDrawer(id,tab='overview',keepCase=false){
  drawerId=id;drawerTab=tab;
  const r=row(id);if(!keepCase){const w=workRecord(r);selectCase(r,filters.stage==='Без дела'?null:w.caseId);}
  const rec=recommendation({...r,_caseView:true}),info=STAGE_INFO[r.stage],legal=role==='lawyer';
  const tabs=[['overview','Карточка'],['documents',`Документы дела (${[...(currentCase(r)?.drafts||[]),...(currentCase(r)?.documents||[])].filter(d=>!d.archived).length})`],['data','Данные и расчёт'],['history','История']];
  let body='';
  if(tab==='overview'){
    const balance=currentCase(r)?.remaining||unassigned(r);
    body=`<div class="drawer-total">${money(amount(balance))}</div><small>ЛС ${esc(r.account)} · ${esc(ownerLabel(currentCase(r)))} · ${currentCase(r)?'Остаток выбранного дела':'Долг вне дел'} · данные на ${date(r.asOf)}</small>
      ${ownershipPanel(r)}
      <div class="money-breakdown"><div><small>Основной долг</small><strong>${money(balance.principal)}</strong></div><div><small>Пени</small><strong>${money(balance.penalty)}</strong></div><div><small>Госпошлина</small><strong>${money(balance.fee)}</strong></div></div>
      ${legal&&currentCase(r)?legalPanel(r):nextAction(r,role)}
      ${role==='accountant'&&total(r)>0?`<button class="button secondary" data-payment="${r.id}">${icon('wallet')} Разнести оплату</button>`:''}
      ${r.cases.length?`<details class="case-section"><summary>Другие долги и дела этого ЛС</summary>${casesPanel(r)}</details>`:''}
      <details class="case-section"><summary>Ответственный и сведения по делу</summary><div class="detail-grid"><div><small>Этап дела</small><strong>${esc(r.stage)}</strong></div>
      <label>Ответственный<select id="ownerChange" ${!legal?'disabled':''}>${options([...new Set([r.owner,'А. Соколова','М. Орлова','Не назначен'])],r.owner)}</select></label>
      <label>Категория<select id="categoryChange" ${!legal?'disabled':''}>${options(CATEGORIES,r.category)}</select></label><div><small>Период задолженности</small><strong>${esc(currentCase(r)?.period||r.period)}</strong><small>${r.age} дн. просрочки</small></div></div></details>
      ${r.stageNeedsReview?'<div class="notice">В прежней версии был общий этап «Суд». Уточните: приказ или иск.</div>':''}
      <p class="form-note">${esc(info.meaning)}</p>
      ${r.claim?`<h3>Требование по делу ${esc(r.caseId)}</h3><div class="component-table"><table><tbody><tr><td>Первоначальное требование</td><td>${money(r.claim.amount)}</td></tr><tr><td>Период</td><td>${esc(r.claim.period)}</td></tr></tbody></table></div><small>Требование сохранено. Оплаты меняют остаток, а не сумму первоначального документа.</small>`:''}
      ${r.payments.some(p=>!r.caseId||p.caseId===r.caseId)?`<h3>Учтённые поступления</h3>${r.payments.filter(p=>!r.caseId||p.caseId===r.caseId).map(p=>`<div class="source-row"><div><strong>${money(p.amount)} · ${date(p.at)}</strong><small>Долг ${money(p.principal)} · пени ${money(p.penalty)} · пошлина ${money(p.fee)}</small><small>${esc(p.ownerName||'Общий долг ЛС')} · ${esc(p.caseId||'Вне дела')}</small><small>Этап при оплате: ${esc(p.stage||'не зафиксирован')}</small></div></div>`).join('')}`:''}
      <p class="form-note">${esc(r.source)} · ${date(r.asOf)}. Оплаты разносит расчётчик, дело ведёт юрист.</p>
      ${r.billing?`<details class="scenario-tools"><summary>Проверка сценария на тестовых данных</summary>${demoControls(r,role)}</details>`:''}`;
  }else if(tab==='data'){body=dataPanel(r);
  }else if(tab==='history'){
    body=`<ul class="timeline">${r.events.filter(e=>!e.caseId||!r.caseId||e.caseId===r.caseId).map(e=>`<li><strong>${esc(e.label)}</strong><small>${date(e.at)} · ${esc(e.status)}</small><p>${e.amount!==undefined?money(e.amount)+' · ':''}${esc(e.note)}</p>${CHANNELS.includes(e.action)&&['Подготовлено (демо)','Отправлено (демо)','Сформировано для печати (демо)'].includes(e.status)?`<button class="button ghost small" data-result="${esc(e.id)}" data-id="${r.id}">Отметить результат</button>`:''}</li>`).join('')||'<li>Действий пока нет</li>'}</ul>`;
  }else{
    body=documentsPanel(state,r);
  }
  showOverlay(`<div class="drawer-shade" data-action="close"></div><section class="drawer" role="dialog" aria-modal="true" aria-label="Лицевой счёт ${esc(r.account)}"><header class="drawer-head"><div><small>${esc(r.company)} · ЛС ${esc(r.account)}</small><h2>${esc(r.building)}, кв. ${esc(r.flat)}</h2>${badge(r.stage,'pink')}</div><button class="icon-button" data-action="close" aria-label="Закрыть">${icon('x')}</button></header><div class="drawer-body"><nav class="drawer-tabs">${tabs.map(([v,l])=>`<button data-drawer-tab="${v}" class="${tab===v?'active':''}">${l}</button>`).join('')}</nav>${body}</div></section>`);
  if(role==='accountant')for(const el of $('#overlay').querySelectorAll('[data-work="newCase"],[data-work="legal"],[data-work="agreement"],[data-work="transition"],[data-work="closeCase"],[data-work="uploadHouse"],[data-work="uploadCase"],[data-work="installment"],[data-work="taskDone"],[data-single-action="task"]')){el.disabled=true;el.title='Действие юриста';}
  if(role==='lawyer')for(const el of $('#overlay').querySelectorAll('[data-work="monthly"],[data-work="owners"],[data-work="previous"]')){el.disabled=true;el.title='Сведения заполняет расчётчик';}
}
function modal(title,subtitle,body,footer){showOverlay(`<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="modal-head"><div><h2>${esc(title)}</h2><small>${esc(subtitle)}</small></div><button class="icon-button" data-action="close" aria-label="Закрыть">${icon('x')}</button></header><div class="modal-body">${body}</div><div class="modal-foot"><button class="button secondary" data-action="close">${footer?'Отмена':'Закрыть'}</button>${footer||''}</div></section></div>`);}
function chooseChannel(){interactions.notify([...selected].map(id=>[id,filters.stage==='Без дела'?null:workRecord(row(id)).caseId]));}
let bulkContext=null;
let resultContext=null;
function recordResult(id,eventId){
  resultContext={id,eventId};const r=row(id);
  modal('Результат взаимодействия',`Демо-сценарий · ЛС ${r.account}`,`<div class="notice">Результат вводится вручную для демонстрации. Никакой реальной отправки или звонка не было.</div><div class="form-grid"><label>Результат<select id="interactionResult">${options(OUTCOMES,OUTCOMES[0])}</select></label><label>Дата следующего действия<input type="date" id="resultDate" min="${TODAY}" value="2026-10-29"></label></div><div id="formError"></div><p class="form-note">Следующий шаг и обещание оплаты обновятся в карточке. Стадия юридического дела не изменится.</p>`,`<button class="button" id="confirmResult">Сохранить результат в демо</button>`);
}
function bulk(action,ids=[...selected]){
  if(CHANNELS.includes(action)){try{interactions.notify(ids.map(id=>[id,ids.length===1?row(id).caseId:workRecord(row(id)).caseId]),action);}catch(err){toast(err.message);}return;}
  if(role==='accountant'&&['case','court','task'].includes(action)){toast('Дела и задачи взыскания ведёт юрист. Смените роль в демо.');return;}
  bulkContext={action,ids};const list=plan(state.rows,ids,action),allowed=list.filter(p=>!p.reason);
  modal(ACTIONS[action],`${allowed.length} доступно · ${list.length-allowed.length} исключено`,`${action==='court'?'<div class="notice">Зарегистрировать подготовку или отправку копии документа. Это не создание судебной повестки и не подтверждение юридического вручения.</div>':''}<div class="form-grid"><label>${action==='task'?'Задача':'Комментарий / название документа'}<input id="actionNote" value="${action==='task'?esc(ids.length===1?STAGE_INFO[row(ids[0]).stage].next:'Проверить остатки и согласовать следующий шаг'):action==='court'?'Копия судебного документа':'Напоминание о задолженности'}"></label><label>${action==='task'?'Срок задачи':'Дата действия'}<input type="date" id="actionDate" value="${TODAY}" min="${TODAY}"></label>${action==='task'?`<label>Ответственный<select id="actionOwner">${options(['А. Соколова','М. Орлова'],'А. Соколова')}</select></label>`:''}</div><div class="table-frame"><table><thead><tr><th>Адрес / ЛС</th><th>Остаток</th><th>Проверка</th></tr></thead><tbody>${list.map(p=>{const r=row(p.id);return `<tr><td>${esc(r.building)}, кв. ${esc(r.flat)}<small>ЛС ${esc(r.account)}</small></td><td>${money(p.amount)}</td><td>${badge(p.reason||'Можно подготовить',p.reason?'amber':'green')}</td></tr>`;}).join('')}</tbody></table></div><div id="formError"></div><p class="form-note">Демо: уведомления только готовятся. Статус «доставлено» и переход в судебную стадию автоматически не выставляются.</p>`,`<button class="button" id="confirmBulk" ${!allowed.length?'disabled':''}>${action==='task'?'Назначить':action==='case'?'Создать':'Подготовить'}: ${allowed.length}</button>`);
  if(action==='receipt'&&allowed.length){
    $('#formError').insertAdjacentHTML('beforebegin',`<details class="receipt-details"><summary>Предпросмотр двух листов · ЛС ${esc(row(allowed[0].id).account)}</summary>${receiptPages(row(allowed[0].id))}</details>`);
  }
}
function payment(id){
  if(role!=='accountant'){toast('Разнесение выполняет расчётчик. Выберите его роль в демо.');return;}
  const r=row(id);drawerId=id;
  modal('Разнести оплату',`ЛС ${r.account} · ${r.building}, кв. ${r.flat}`,`<div class="notice">${r.unallocated?'Поступление найдено в реестре. Уточните, на какие составляющие его отнести.':'Введите подтверждённое поступление и распределите по основанию платежа.'}</div><div class="form-grid"><label>Сумма поступления, ₽<input id="paymentAmount" inputmode="decimal" value="${r.unallocated?r.unallocated/100:''}" ${r.unallocated?'readonly':''} placeholder="0.00"></label><label>Основной долг, ₽<input id="payPrincipal" inputmode="decimal" value="0"></label><label>Пени, ₽<input id="payPenalty" inputmode="decimal" value="0"></label><label>Госпошлина, ₽<input id="payFee" inputmode="decimal" value="0"></label></div><small>Остаток: долг ${money(r.principal)} · пени ${money(r.penalty)} · пошлина ${money(r.fee)}</small><div class="balance-check"><span>Осталось распределить</span><strong id="payRemaining">${money(r.unallocated||0)}</strong></div><div id="formError"></div><p class="form-note">Погашение всей суммы отменит подготовленные напоминания. Судебное требование сохранится в истории.</p>`,`<button class="button" id="confirmPayment">Подтвердить разнесение</button>`);
  $('.modal-body').insertAdjacentHTML('afterbegin',`<div class="form-grid"><label>Дата оплаты<input id="paymentDate" type="date" value="${TODAY}" max="${TODAY}"></label><label>Источник<select id="paymentSource"><option>Банк</option><option>Касса</option><option>Мобильное приложение</option><option>Внешний реестр</option></select></label><label>Номер операции<input id="paymentReference" placeholder="Например, ПЛ-1042" required></label></div><label>Основание платежа<select id="paymentCase"><option value="">Долг вне дел · ${money(amount(unassigned(r)))}</option>${r.cases.filter(c=>c.stage!=='Завершено').map(c=>`<option value="${esc(c.id)}" ${r.caseId===c.id?'selected':''}>${esc(c.id)} · ${esc(ownerLabel(c))} · ${esc(c.period)} · ${money(amount(c.remaining))}</option>`).join('')}</select></label>`);
  $('.modal-body').insertAdjacentHTML('afterbegin',`<section class="payment-context"><h3>Взыскания по лицевому счёту</h3>${accountingContext(r).map(c=>`<p>${esc(c.id)} · ${esc(c.stage)} · ${esc(c.number)}<small>${esc(c.period)} · остаток ${money(c.remaining)} · пошлина ${money(c.fee)}</small></p>`).join('')||'<p>Открытых дел нет</p>'}</section>`);
  $('.modal-body').insertAdjacentHTML('beforeend','<p class="form-note">Льгота или перерасчёт не являются оплатой. Изменённую задолженность передаёт биллинг отдельным обновлением; произвольная скидка здесь не применяется.</p>');
  $('.modal-body').insertAdjacentHTML('beforeend','<label id="paymentOwnerField"></label>');refreshPaymentOwner(r);
}
function ownershipPanel(r){
  const c=currentCase(r),owners=c?.ownerBalances;
  return `<section class="case-section"><h3>Собственники и погашение долей</h3>${owners?`<div class="table-frame"><table><thead><tr><th>Собственник / доля</th><th>Распределено</th><th>Погашено</th><th>Осталось</th></tr></thead><tbody>${owners.map(o=>`<tr><td>${esc(o.name)}<small>${o.share}%</small></td><td>${money(amount(o.initial))}</td><td>${money(amount(o.initial)-amount(o.remaining))}</td><td>${money(amount(o.remaining))}<small>${amount(o.remaining)===0?'Доля погашена':'В работе'}</small></td></tr>`).join('')}</tbody></table></div>`:`<p>${r.owners.map(o=>`${esc(o.name)} · ${o.share}%`).join('<br>')||'Собственники не загружены'}</p>${r.owners.length?`<button class="button secondary small" data-ownership="${c?'assign':'create'}" data-id="${r.id}">${c?'Распределить остаток по долям':'Создать отдельные дела по долям'}</button>`:''}`}<small>Доли и основание распределения подтверждает сотрудник. Оплата одного собственника не погашает долг другого.</small></section>`;
}
function refreshPaymentOwner(r){const c=r.cases.find(c=>c.id===$('#paymentCase').value);$('#paymentOwnerField').innerHTML=c?.ownerBalances?`Чей долг погашается<select id="paymentOwner"><option value="">Выберите собственника</option>${c.ownerBalances.map(o=>`<option value="${esc(o.id)}" ${c.ownerBalances.length===1?'selected':''}>${esc(o.name)} · ${o.share}% · остаток ${money(amount(o.remaining))}</option>`).join('')}</select>`:'Общий долг ЛС: распределение по собственникам не задано';}
function download(name,text,type='text/plain;charset=utf-8'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
function csv(rows){return '\uFEFF'+window.Papa.unparse(rows,{delimiter:';',escapeFormulae:true});}
const sample=()=>[{source_id:'Внешний биллинг (демо)',company:'УК «Демо-парк»',account:'5001',building:'Лесная, 8',flat:'14',as_of:TODAY,period:'01.08.2026 — 30.09.2026',principal:'12000.00',penalty:'250.00',fee:'0',age_days:'60'}];
function importPreview(data){
  if(role!=='accountant'){toast('Импорт остатков выполняет расчётчик. Юрист передаёт запрос на сверку.');return;}
  preview=previewImport(state,data);const invalid=preview.filter(p=>p.errors.length).length;
  modal('Проверка реестра',`${preview.length} строк · ошибок: ${invalid}`,`<div class="table-frame"><table><thead><tr><th>Строка / ЛС</th><th>Результат</th><th>Проверка</th></tr></thead><tbody>${preview.map(p=>`<tr><td>${p.row} · ${esc(p.input.account)}</td><td>${badge({new:'Новый ЛС',update:'Обновить остаток',skip:'Без изменений',error:'Ошибка'}[p.status],p.status==='error'?'red':'green')}</td><td>${esc(p.errors.join('; ')||'Ключ, суммы и дата проверены')}</td></tr>`).join('')}</tbody></table></div><p class="form-note">Если в файле есть ошибка, весь импорт заблокирован. Повторная загрузка того же среза не создаёт дубли.</p>`,`<button class="button" id="confirmImport" ${invalid||!preview.length?'disabled':''}>Применить реестр</button>`);
}
function formError(err){$('#formError').innerHTML=`<div class="error" role="alert">${esc(err.message||err)}</div>`;}
document.addEventListener('click',e=>{
  const el=e.target.closest('button,[data-open],[data-action]');if(!el)return;
  if(el.dataset.ownership){const r=row(el.dataset.id);try{if(el.dataset.ownership==='create')createOwnerCases(r);else assignOwners(r,currentCase(r));save();render();openDrawer(r.id,'overview',true);}catch(err){toast(err.message);}return;}
  if(el.dataset.workspaceView){view=el.dataset.workspaceView;selected.clear();selectedCases.clear();render();return;}
  if(el.dataset.view){view=el.dataset.view;selected.clear();selectedCases.clear();filters={...(view==='overview'?{}:overviewScope),...(view==='registry'?{stage:'Без дела'}:{}),...(view==='accounts'?{debtOnly:true}:{})};render();window.scrollTo(0,0);return;}
  if(el.dataset.stageLink){filters={...(view==='overview'?overviewScope:{company:filters.company,building:filters.building,houseStatus:filters.houseStatus}),stage:el.dataset.stageLink};view=filters.stage==='Без дела'?'registry':'cases';selected.clear();selectedCases.clear();render();window.scrollTo(0,0);return;}
  if(el.dataset.noticeLink){filters={...(view==='overview'?overviewScope:{}),notice:el.dataset.noticeLink,debtOnly:true};view='registry';selected.clear();advanced=true;render();window.scrollTo(0,0);return;}
  if(el.dataset.queue!==undefined){filters={...(view==='overview'?overviewScope:{}),queue:el.dataset.queue};view='registry';selected.clear();render();window.scrollTo(0,0);return;}
  if(el.dataset.receipt){modal('Квитанция и претензия','Два листа · предварительный макет',receiptPages(row(el.dataset.receipt)));return;}
  if(el.dataset.caseWork){try{const r=row(el.dataset.open);selectCase(r,el.dataset.caseId);workbench.open(el.dataset.caseWork,r.id,Number(el.dataset.index));}catch(err){toast(err.message);}return;}
  if(el.dataset.open){if(el.dataset.caseId){selectCase(row(el.dataset.open),el.dataset.caseId);openDrawer(el.dataset.open,'overview',true);}else openDrawer(el.dataset.open);return;}
  if(el.dataset.segment!==undefined){filters.segment=el.dataset.segment;selected.clear();renderContent();return;}
  if(el.dataset.drawerTab){openDrawer(drawerId,el.dataset.drawerTab,true);return;}
  if(el.dataset.bulk){bulk(el.dataset.bulk);return;}
  if(el.dataset.singleAction){bulk(el.dataset.singleAction,[el.dataset.id]);return;}
  if(el.dataset.payment){payment(el.dataset.payment);return;}
  if(el.dataset.result){recordResult(el.dataset.id,el.dataset.result);return;}
  if(el.dataset.document){const r=row(el.dataset.document);download(`demo-debt-${r.account}.txt`,`ДЕМО. Не является документом для суда.\n${r.company}\nЛС ${r.account}, ${r.building}, кв. ${r.flat}\nДанные на ${date(r.asOf)}\nПериод: ${r.period}\nОсновной долг: ${money(r.principal)}\nПени: ${money(r.penalty)}\nГоспошлина: ${money(r.fee)}\nИтого: ${money(total(r))}\nДело: ${r.caseId||'не создано'}\n${r.claim?`Судебное требование: ${money(r.claim.amount)}; период ${r.claim.period}`:''}`);return;}
  const action=el.dataset.action;
  if(action==='stageHelp'){modal('Этапы взыскания','Смысл и следующий шаг',stageGuide());return;}
  if(action==='close'){closeOverlay();return;}
  if(action==='openSources'){closeOverlay();view='sources';render();return;}
  if(action==='filters'){advanced=!advanced;renderContent();return;}
  if(action==='clearFilters'){filters={stage:filters.stage};selected.clear();renderContent();return;}
  if(action==='clearSelection'){selected.clear();renderContent();return;}
  if(action==='clearCaseSelection'){selectedCases.clear();renderContent();return;}
  if(action==='chooseChannel'){try{chooseChannel();}catch(err){toast(err.message);}return;}
  if(action==='template'){download('mdo-debt-template.csv',csv([CSV_FIELDS,...sample().map(r=>CSV_FIELDS.map(k=>r[k]))]),'text/csv;charset=utf-8');return;}
  if(action==='sampleImport'){importPreview(sample());return;}
  if(action==='export'){download('mdo-debt-registry.csv',csv(visible().map(r=>({'УК':r.company,'Дом':r.building,'Квартира':r.flat,'ЛС':r.account,'Основной долг':r.principal/100,'Пени':r.penalty/100,'Пошлина':r.fee/100,'Остаток':total(r)/100,'Стадия':r.stage,'Категория':r.category,'Следующее действие':recommendation(r).label,'Источник':r.source,'На дату':r.asOf}))), 'text/csv;charset=utf-8');return;}
  if(el.id==='importTop'){view='sources';render();return;}
  if(el.id==='reset'){modal('Сбросить демо?','Только локальные тестовые данные','<p class="form-note">Все действия в этом прототипе будут заменены исходным набором. Рабочая диспетчерская и её данные не затрагиваются.</p>','<button class="button" id="confirmReset">Сбросить демо</button>');return;}
  if(el.id==='confirmReset'){state=seed();installDemoBilling(state);state.display={notices:true,stages:true};filters={};selected.clear();selectedCases.clear();save();closeOverlay();render();toast('Исходные демо-данные восстановлены');return;}
  if(el.id==='confirmBulk'){
    try{const note=$('#actionNote').value.trim(),dateValue=$('#actionDate').value;if(!note||!dateValue||dateValue<TODAY)throw Error('Укажите описание и дату не ранее даты демо');const results=execute(state,bulkContext.ids,bulkContext.action,{note,date:dateValue,owner:$('#actionOwner')?.value});save();selected.clear();closeOverlay();render();toast(`Готово в демо: ${results.filter(p=>!p.reason).length}. Внешних отправок нет.`);}catch(err){formError(err);}return;
  }
  if(el.id==='confirmPayment'){
    try{if(role!=='accountant')throw Error('Нужна роль расчётчика');const reference=$('#paymentReference').value.trim();if(!reference)throw Error('Укажите номер операции для защиты от повторного учёта');const r=row(drawerId);allocate(r,cents($('#paymentAmount').value),{principal:cents($('#payPrincipal').value),penalty:cents($('#payPenalty').value),fee:cents($('#payFee').value)},$('#paymentCase').value||null,{date:$('#paymentDate').value,source:$('#paymentSource').value,reference,ownerId:$('#paymentOwner')?.value});save();closeOverlay();render();openDrawer(r.id);toast('Оплата разнесена по выбранному основанию.');}catch(err){formError(err);}return;
  }
  if(el.id==='confirmImport'){try{if(role!=='accountant')throw Error('Нужна роль расчётчика');const n=applyImport(state,preview);save();closeOverlay();render();toast(`Импорт завершён: ${n} изменений, ${preview.length-n} без изменений`);}catch(err){formError(err);}return;}
  if(el.id==='confirmResult'){try{completeCommunication(row(resultContext.id),resultContext.eventId,$('#interactionResult').value,$('#resultDate').value);save();closeOverlay();render();toast('Результат и следующий шаг сохранены');}catch(err){formError(err);}return;}
});
document.addEventListener('change',async e=>{
  if(e.target.id==='paymentCase'){refreshPaymentOwner(row(drawerId));return;}
  const el=e.target;
  if(el.dataset.display){state.display[el.dataset.display]=el.checked;save();renderContent();return;}
  if(el.dataset.caseChoice){el.checked?selectedCases.add(el.dataset.caseChoice):selectedCases.delete(el.dataset.caseChoice);renderContent();return;}
  if(el.id==='selectAllCases'){visible().forEach(r=>r.cases.filter(c=>!filters.stage||c.stage===filters.stage).forEach(c=>{const k=JSON.stringify([r.id,c.id]);el.checked?selectedCases.add(k):selectedCases.delete(k);}));renderContent();return;}
  if(el.id==='roleSelect'){role=el.value;selected.clear();closeOverlay();render();return;}
  if(el.id==='workspaceContext'){toast('Тот же реестр и дела. Меняется точка входа, не данные.');return;}
  if(el.dataset.overviewFilter){overviewScope[el.dataset.overviewFilter]=el.value;if(el.dataset.overviewFilter==='company')overviewScope.building='';renderContent();return;}
  if(['reportFrom','reportTo'].includes(el.id)){const from=$('#reportFrom').value,to=$('#reportTo').value;if(!from||!to||from>to||to>TODAY){toast('Проверьте даты периода');renderContent();return;}reportFrom=from;reportTo=to;renderContent();return;}
  if(el.id==='debtOnly'){filters.debtOnly=el.checked;selected.clear();renderContent();return;}
  if(el.dataset.filter){filters[el.dataset.filter]=el.value;if(view==='cases'&&filters.stage==='Без дела')view='registry';selected.clear();renderContent();return;}
  if(el.dataset.select){el.checked?selected.add(el.dataset.select):selected.delete(el.dataset.select);renderContent();return;}
  if(el.id==='selectAll'){visible().forEach(r=>el.checked?selected.add(r.id):selected.delete(r.id));renderContent();return;}
  if(el.id==='commFilter'){commFilter=el.value;renderContent();return;}
  if(el.id==='commStatus'){commStatus=el.value;renderContent();return;}
  if(['categoryChange','ownerChange','stageChange'].includes(el.id)){
    if(role==='accountant'){toast('Изменения дела доступны юристу');openDrawer(drawerId);return;}
    const r=row(drawerId);try{if(el.id==='stageChange')changeStage(r,el.value);if(el.id==='categoryChange'){r.category=el.value;r.disputed=el.value==='Оспаривает долг';}if(el.id==='ownerChange')r.owner=el.value;save();render();openDrawer(r.id);toast('Изменение сохранено в демо');}catch(err){toast(err.message);openDrawer(r.id);}return;
  }
  if(el.id==='importFile'){
    const file=el.files[0];if(!file)return;if(file.size>2*1024*1024){toast('Файл больше 2 МБ');return;}
    try{const result=window.Papa.parse(await file.text(),{header:true,delimiter:';',skipEmptyLines:'greedy'});if(result.errors.length)throw Error(result.errors[0].message);if(result.data.length>1000)throw Error('В демо доступно до 1000 строк за импорт');importPreview(result.data);}catch(err){toast(`Файл не принят: ${err.message}`);}
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='search'){const pos=e.target.selectionStart;filters.search=e.target.value;selected.clear();renderContent();$('#search').focus();$('#search').setSelectionRange(pos,pos);}
  if(['paymentAmount','payPrincipal','payPenalty','payFee'].includes(e.target.id)){try{$('#payRemaining').textContent=money(cents($('#paymentAmount').value||'0')-['#payPrincipal','#payPenalty','#payFee'].reduce((s,k)=>s+cents($(k).value||'0'),0));}catch{$('#payRemaining').textContent='Проверьте суммы';}}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeOverlay();
  if(e.key==='Enter'&&e.target.matches('[role=button][data-open]')){if(e.target.dataset.caseId)selectCase(row(e.target.dataset.open),e.target.dataset.caseId);openDrawer(e.target.dataset.open,'overview',!!e.target.dataset.caseId);}
  if(e.key==='Tab'&&$('#overlay').innerHTML){const all=[...$('#overlay').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,a[href]')].filter(x=>x.getClientRects().length),first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
function openCaseDrawer(id,tab='overview'){
  if(workspaceViews.includes(view)){filters.stage=currentCase(row(id))?.stage||'Без дела';view=filters.stage==='Без дела'?'registry':'cases';render();}
  openDrawer(id,tab,true);
}
const interactions=installInteractions({getState:()=>state,getRole:()=>role,save,render,modal,close:closeOverlay,toast,openDrawer:openCaseDrawer});
const workbench=installWorkbench({getState:()=>state,getRole:()=>role,save,render,modal,openDrawer:openCaseDrawer,toast,close:closeOverlay,bulk,payment,notify:r=>interactions.notify([[r.id,r.caseId]]),enforcement:r=>interactions.enforcement(r.id),showSources:()=>{closeOverlay();view='sources';render();},recordResult});
render();if(storageWarning)toast(storageWarning);
