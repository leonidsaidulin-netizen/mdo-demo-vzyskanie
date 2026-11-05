import {TODAY,money,total,recommendation,changeStage,cents,days} from './model.mjs';
import {roleRecommendation,roleCaseProgress} from './role-actions.mjs';
import {QUEUES,workRows,queueFor} from './workflow.mjs';
import {currentCase,unassigned,amount,COMPONENTS,createCase,selectCase,reconcileCases} from './cases.mjs';
import {requestReview,resolveReview,saveLegal,saveAgreement,markInstallment,saveOwners,saveMonthly,packetFiles,audit} from './operations.mjs';
import {esc,icon} from './workspace-views.mjs';
import {availableTemplates,caseProgress,draftDocument,saveDraft,documentText,ensureStageDocuments,stageDocumentEntries,ensureDocument,reviewReasons,stageAge} from './documents.mjs';
import {billingLines,billingPeriod,principalDue,penaltyDue} from './billing.mjs';
import {demoEvent} from './demo-billing.mjs';
import {renderDocx,templateBytes,TEMPLATE_FIELDS} from './docx.mjs';
import {LEGAL_RESULTS,transitionOptions,transitionCase,saveAgreementProposal,caseNotices,CONTACT_RESULTS,recordContactResult,prepareCasePackage,packageReady,signDemoAgreement,recordLegalResult,demoReceivedDocument,reworkCasePackage} from './lawyer-journey.mjs';
import {ACTIONS} from './model.mjs';
const $=s=>document.querySelector(s);
const labels={principal:'Основной долг',penalty:'Пени',fee:'Госпошлина'};
const choose=(arr,value)=>arr.map(x=>`<option value="${esc(x)}" ${value===x?'selected':''}>${esc(x)}</option>`).join('');
export function demoControls(r,role){if(!r.billing)return '';const c=currentCase(r);return `<section class="case-section"><h3>Учебные события</h3><div class="action-row">${role==='accountant'?`<button class="button secondary small" data-work="demo:halfPayment" data-id="${r.id}">Поступила часть оплаты</button><button class="button secondary small" data-work="demo:fullPayment" data-id="${r.id}">Поступила полная оплата</button>${r.houseStatus!=='departed'?`<button class="button secondary small" data-work="demo:newMonth" data-id="${r.id}">Получить начисления за октябрь</button>`:''}`:`${c&&['Уведомление','Соглашение'].includes(c.stage)?`<button class="button secondary small" data-work="demo:agreement" data-id="${r.id}">Получено подписанное соглашение</button>`:''}${c?.stage==='Приказ'?`<button class="button secondary small" data-work="demo:execution" data-id="${r.id}">Предъявить приказ в банк</button>`:''}`}<small>Только учебный контур. Внешних отправок нет.</small></div></section>`;}
function billingTable(r){const c=currentCase(r),lines=c?billingLines(r,c.id):billingLines(r);return `<h3>${c?'Расчёт по выбранному делу':'Расчёт долга вне дел'}</h3><p>Источник: учебный биллинг · ${esc(r.billing.asOf)} · площадь ${r.billing.area} м²</p><div class="table-frame"><table class="billing-table"><thead><tr><th>Месяц / услуга</th><th>Расчёт</th><th>Начислено</th><th>Оплачено</th><th>Долг</th><th>Пени</th></tr></thead><tbody>${lines.map(x=>`<tr><td data-label="Месяц / услуга">${esc(x.month)}<small>${esc(x.service)}</small></td><td data-label="Расчёт">${esc(x.formula)}</td><td data-label="Начислено">${money(x.charged)}</td><td data-label="Оплачено">${money(x.paid)}</td><td data-label="Долг">${money(principalDue(x))}</td><td data-label="Пени">${money(penaltyDue(x))}</td></tr>`).join('')}</tbody></table></div><p>Предлагаемый период нового дела: ${esc(billingPeriod(billingLines(r))||'Нет долга вне дел')}.</p>`;}
export function queueOverview(rows){return `<section class="work-overview"><div class="section-head"><h2>С кем работать сейчас</h2></div><div class="work-queues">${Object.entries(QUEUES).map(([key,label])=>`<button data-queue="${key}" class="work-queue ${key==='overdue'?'urgent':''}"><span>${label}</span><strong>${workRows(rows,{queue:key}).length}</strong>${icon('arrow-up-right')}</button>`).join('')}</div></section>`;}
export function nextAction(r,role){
  const rec=roleRecommendation({...r,_caseView:true},role),c=currentCase(r);
  if(role==='lawyer'&&c&&(rec.key==='agreement'||(rec.key==='follow'&&['Приказ','Иск','Приставы'].includes(c.stage))))return '';
  let action=rec.action,label=rec.label;
  if(role==='lawyer'){
    if(rec.key==='agreement')action='agreement';
    if(['agreementDue','overdueAgreement'].includes(rec.key))action='installment';
    if(rec.key==='close'){action='closeCase';label='Завершить дело';}
    if(rec.key==='done'){action='documents';label='Открыть историю дела';}
    if(['promise','follow'].includes(rec.key)&&!['Приказ','Иск','Приставы','Суд: уточнить'].includes(r.stage)){action='follow';label='Зафиксировать проверку оплаты';}
  }
  if(action==='robot'){action='channels';label='Подготовить уведомление';}
  const check=['reconcile','stale','dispute','caseBalance','waiting'].includes(rec.key);
  return `<section class="next-action"><small>${check?'Нужно уточнить данные':'Следующее действие'} · ${esc(r.reviewTask?.status==='open'?'Бухгалтерия':r.owner)}</small><h3>${esc(rec.label)}</h3><p>${esc(rec.detail)}</p><button class="button" data-work="${action}" data-index="${c?.schedule.findIndex(x=>!x.paid)??-1}" data-id="${r.id}">${icon('arrow-right')}${esc(label)}</button></section>`;
}
export function casesPanel(r){return `<section class="case-section"><div class="section-head"><h3>Дела и периоды</h3></div>
  ${r.cases.length?`<label>Выбранное дело<select data-case-select="${r.id}"><option value="" ${!r.caseId?'selected':''}>Долг вне дел</option>${r.cases.map(c=>`<option value="${esc(c.id)}" ${r.caseId===c.id?'selected':''}>${esc(c.id)} · ${esc(ownerLabel(c))} · ${esc(c.period)} · ${esc(c.stage)}</option>`).join('')}</select></label>`:'<p>Взыскание ещё не оформлено.</p>'}
  <div class="case-summary">${r.cases.map(c=>`<div><strong>${esc(c.id)} · ${esc(c.stage)}</strong><small>${esc(c.period)}</small><span>Остаток дела: ${money(amount(c.remaining))}${!c.balanceConfirmed?' · требует сверки':''}</span>${c.claim?`<small>Первоначальное требование: ${money(c.claim.amount)}</small>`:''}${c.closedReason?`<small>Завершено: ${esc(c.closedReason)}</small>`:''}</div>`).join('')}</div>
  <p>Вне открытых дел: <strong>${r.caseBalanceConflict?'требует сверки':money(amount(unassigned(r)))}</strong></p>${r.caseBalanceConflict?'<div class="notice">Остатки дел не подтверждены. Уведомления приостановлены до сверки.</div>':''}</section>`;}
export function legalPanel(r){const c=currentCase(r);if(!c)return '';
  const p=roleCaseProgress(c,r,'lawyer');
  const clock=`<p class="stage-age">${esc(stageAge(c))}${c.createdAt?' · Дело открыто '+esc(c.createdAt):''}</p>`;
  const extras=[];
  if(p.work!=='closeCase'&&!p.dataIssue&&['Приказ','Иск','Приставы'].includes(c.stage)){
    if(p.work!=='uploadCase')extras.push(['uploadCase','Приложить полученный документ']);
    if(p.work!=='legal')extras.push(['legal','Зафиксировать результат суда / исполнения']);
    if(transitionOptions(c).length&&p.work!=='transition')extras.push(['transition','Изменить путь по результату']);
  }
  const secondary=extras.length?`<details><summary>Другие действия по делу</summary><div class="action-row">${extras.map(([work,label])=>`<button class="button secondary small" data-work="${work}" data-id="${r.id}">${label}</button>`).join('')}</div></details>`:'';
  return `<section class="case-section stage-work"><h3>${esc(p.label)}</h3>${c.contactResult&&['Уведомление','Соглашение'].includes(c.stage)?`<p>${esc(c.contactResult.note)}</p>`:''}${c.stage!=='Завершено'&&c.legal?.note?`<p>${esc(c.legal.note)}</p>`:''}${p.dataIssue?`<p class="notice">${esc(p.dataIssue)}</p>`:''}${c.legal?.number?`<p>${esc(c.legal.number)} · ${esc(c.legal.date)}</p>`:''}<div class="action-row"><button class="button" data-work="${p.work}" data-index="${c.schedule.findIndex(x=>!x.paid)}" data-id="${r.id}">${esc(p.next)}</button>${c.stage==='Соглашение'&&p.work!=='closeCase'&&!p.dataIssue?`<button class="button secondary small" data-work="outcome" data-id="${r.id}">Отказ / нарушение договорённости</button>`:''}</div>${secondary}
  ${c.stage==='Уведомление'?`<h3>Уведомление о долге: отправки</h3>${caseNotices(r,c).map(e=>`<div class="source-row"><div><strong>${esc(ACTIONS[e.action])}</strong><small>${esc(e.status)} · ${esc(e.at.slice(0,10))}</small></div><button class="button ghost small" data-work="history" data-id="${r.id}">Доставка</button></div>`).join('')||'<p>Отправки не было.</p>'}${caseNotices(r,c).length?`<details><summary>Другие каналы / повторное уведомление</summary><button class="button secondary small" data-work="channels" data-id="${r.id}">Подготовить другую отправку</button></details>`:''}`:''}
  ${clock}${c.stage==='Соглашение'&&c.agreement?`<p>Соглашение ${esc(c.agreement.number)} от ${esc(c.agreement.date)}</p>`:''}${c.stage==='Соглашение'&&c.schedule.length?`<table><thead><tr><th>Дата</th><th>Платёж</th><th>Результат</th></tr></thead><tbody>${c.schedule.map((x,i)=>`<tr><td>${esc(x.date)}</td><td>${money(x.amount)}</td><td>${!c.agreement?'Предложено, не подписано':x.paid?'Подтверждён':`<button class="button ghost small" data-work="installment" data-index="${i}" data-id="${r.id}">${x.date<TODAY?'Просрочен: сверить':'Связать с оплатой'}</button>`}</td></tr>`).join('')}</tbody></table>`:''}</section>`;
}
export function dataPanel(r){if(r.billing)return `<section class="case-section"><h3>Данные из учебного биллинга</h3>${r.owners.map(o=>`<p>${esc(o.name)} · доля ${o.share}%</p>`).join('')}<p>${r.houseStatus==='departed'?`Дом выбыл из управления ${esc(r.contractEnd)}. Старый долг остаётся в работе.`:'Дом в управлении'}</p>${billingTable(r)}<h3>Связанные лицевые счета</h3>${r.ownerHistory.map(x=>`<p>${esc(x.name)} · ЛС ${esc(x.account)} · ${esc(x.reason)}</p>`).join('')||'<p>Связанных ЛС нет.</p>'}</section>`;return `<section class="case-section"><h3>Данные должника</h3>${r.owners.length?r.owners.map(o=>`<p>${esc(o.name)} · ${o.share}%</p>`).join(''):'<p>Собственники и доли не загружены. Не подставляем данные из адреса.</p>'}<button class="button secondary small" data-work="owners" data-id="${r.id}">Собственники и доли</button>
  <h3>Помесячный расчёт</h3>${r.charges.length?`<div class="table-frame"><table><thead><tr><th>Месяц</th><th>Площадь / формула</th><th>Начислено</th><th>Оплачено</th><th>Остаток</th></tr></thead><tbody>${r.charges.map(x=>`<tr><td>${esc(x.month)}</td><td>${x.area} м²<small>${esc(x.formula)}</small></td><td>${money(x.charges)}</td><td>${money(x.payments)}</td><td>${money(x.closing)}</td></tr>`).join('')}</tbody></table></div>`:'<p>Реестр остатков не содержит помесячных начислений. Нужен отдельный расчёт из биллинга.</p>'}<button class="button secondary small" data-work="monthly" data-id="${r.id}">Загрузить расчёт</button>
  <h3>Связанные лицевые счета</h3>${r.ownerHistory.map(x=>`<p>Прежний владелец: ${esc(x.name)} · ЛС ${esc(x.account)} · ${esc(x.reason)}</p>`).join('')}<button class="button secondary small" data-work="previous" data-id="${r.id}">Связать прежний ЛС</button></section>`;}
export function documentsPanel(state,r){const c=currentCase(r),key=JSON.stringify([r.company,r.building]);const files=packetFiles(state,r);
  const list=items=>items.map(d=>`<div class="source-row"><div><strong>${esc(d.name)}</strong><small>Приложен · ${Math.ceil(d.size/1024)} КБ</small></div><button class="icon-button" data-work="download" data-doc="${d.id}" data-id="${r.id}" aria-label="Скачать ${esc(d.name)}">${icon('download')}</button></div>`).join('')||'<p>Файлы не приложены.</p>';
  return `${c?templateList(r):'<p>Для документов выберите или создайте дело.</p>'}<section class="case-section"><h3>Документы дома</h3>${list(files.filter(d=>d.house))}<button class="button secondary small" data-work="uploadHouse" data-id="${r.id}">Добавить договор дома</button></section>${c?`<section class="case-section"><h3>Полученные документы дела</h3>${list(files.filter(d=>!d.house))}<button class="button secondary small" data-work="uploadCase" data-id="${r.id}">Приложить документ дела</button></section><div class="action-row"><button class="button secondary" data-work="exportPacket" data-id="${r.id}">Скачать пакет дела</button></div>`:''}<p class="form-note">Только демонстрационные документы. Внешняя подача отключена.</p>`;
}
export function templateList(r){const c=currentCase(r);if(!c)return '<p>Документ появится после подготовки уведомления.</p>';
  const docs=stageDocumentEntries(r),current=new Set(docs.map(d=>d.id));
  const p=caseProgress(c,r),ready=packageReady(r);
  const packageAction=['Соглашение','Приказ','Иск','Завершено'].includes(c.stage)&&(!['Соглашение'].includes(c.stage)||c.agreement||c.agreementProposal)?`<div class="package-action"><p>${c.stage==='Соглашение'?'Пакет подтверждает согласованные условия: соглашение и график.':c.stage==='Завершено'?'Итог дела: основание завершения и учтённые оплаты.':'Пакет для подачи: заявление, расчёт задолженности и опись приложений.'}</p><button class="button" data-work="${c.packageRevisionNeeded?'reworkPackage':ready?p.work:'preparePackage'}" data-id="${r.id}">${c.packageRevisionNeeded?'Устранить замечания суда':ready?p.next:'Сформировать пакет документов'}</button></div>`:'';
  const purpose={paymentStatement:'Фактически учтённые оплаты этого дела: дата, сумма, основной долг, пени и пошлина. Не график будущих платежей.',calculation:'Из чего складывается требование: месяцы, услуги, начисления, учтённые оплаты, остаток и пени.'};
  const render=d=>`<div class="source-row"><div><strong>${esc(d.title)}</strong>${purpose[d.kind]?`<small>${purpose[d.kind]}</small>`:''}<small>${d.id?(d.status==='sent'?'Сохранён экземпляр отправки / печати':'Черновик создан'):'Ещё не сформирован'}${d.missing.length?' · Не хватает: '+esc(d.missing.join('; ')):''}</small></div><div class="action-row"><button class="button secondary small" data-work="${d.id?'docx:'+d.id:'createDocx:'+d.kind}" data-id="${r.id}">${icon('file-down')}${d.id?'Открыть Word':'Сформировать DOCX'}</button><button class="icon-button" data-work="${d.id?'editDraft:'+d.id:'draft:'+d.kind}" data-id="${r.id}" aria-label="Проверить текст: ${esc(d.title)}" title="Проверить текст">${icon('file-pen-line')}</button></div></div>`;
  const support=['paymentStatement','calculation'],main=docs.filter(d=>!support.includes(d.kind)),supportDocs=docs.filter(d=>support.includes(d.kind));
  return `<section class="case-section"><h3>Документы: ${esc(c.stage)}</h3>${packageAction}<div class="document-source"><strong>${esc(r.source)} · ${esc(r.asOf)}</strong><p>ЛС ${esc(r.account)} · дело ${esc(c.id)} · ${esc(ownerLabel(c))} · ${esc(c.period)}</p><button class="button ghost small" data-work="data" data-id="${r.id}">Исходный расчёт</button></div>${c.stage==='Соглашение'&&!c.agreement&&!c.agreementProposal?`<p>Сначала зафиксируйте условия рассрочки. Затем можно сформировать соглашение и график.</p><button class="button" data-work="agreement" data-id="${r.id}">Согласовать условия и график</button>`:main.map(render).join('')}${supportDocs.length?`<details><summary>Расчёт и учтённые оплаты</summary>${supportDocs.map(render).join('')}</details>`:''}<details><summary>Шаблон организации</summary><button class="button secondary small" data-work="docxTemplate" data-id="${r.id}">Загрузить шаблон DOCX</button></details></section>${c.drafts?.some(d=>!current.has(d.id)&&!d.archived)?`<details class="case-section"><summary>Сохранённые документы других этапов и версий</summary>${c.drafts.filter(d=>!current.has(d.id)&&!d.archived).map(render).join('')}</details>`:''}`;
}
export function installWorkbench(api){
  const {getState,getRole,save,render,modal,openDrawer,toast,close,bulk,payment,showSources,recordResult,notify,enforcement}=api;
  let context=null;
  const getRow=id=>getState().rows.find(r=>r.id===id);
  const docxDeps=()=>({Zip:window.PizZip,Templater:window.docxtemplater});
  const downloadBytes=(name,bytes,type)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  const form=(title,r,body,submit,kind)=>{context={id:r.id,kind};modal(title,`ЛС ${r.account} · ${currentCase(r)?.id||'без дела'}`,`${body}<div id="workError"></div>`,`<button class="button" data-work-save="${kind}">${submit}</button>`);};
  const fields=(prefix,value={})=>COMPONENTS.map(k=>`<label>${labels[k]}, ₽<input id="${prefix}${k}" inputmode="decimal" value="${(value[k]||0)/100}"></label>`).join('');
  const readParts=prefix=>Object.fromEntries(COMPONENTS.map(k=>[k,cents($(`#${prefix}${k}`).value)]));
  const scheduleRow=(x={})=>`<div class="schedule-row"><label>Дата платежа<input type="date" data-schedule-date value="${esc(x.date||TODAY)}"></label><label>Сумма, ₽<input inputmode="decimal" data-schedule-amount value="${x.amount==null?'':x.amount/100}"></label><button class="icon-button" data-remove-payment aria-label="Удалить платёж" title="Удалить платёж">${icon('trash-2')}</button></div>`;
  function edit(kind,r,index){
    const legalActions=['newCase','legal','agreement','outcome','transition','closeCase','taskDone','follow','installment','uploadHouse','uploadCase','preparePackage','signDemoAgreement','receiveExecution','reworkPackage'];
    if(getRole()!=='lawyer'&&legalActions.includes(kind))throw Error('Это действие выполняет юрист');
    if(['owners','previous','monthly'].includes(kind)&&getRole()!=='accountant')throw Error('Сведения из биллинга заполняет расчётчик; юрист использует готовые данные');
    const c=currentCase(r);
    if(kind==='preparePackage'){prepareCasePackage(r);save();render();return openDrawer(r.id,'documents');}
    if(kind==='reworkPackage')return form('Исправить пакет по замечаниям суда',r,`<p>${esc(c.legal?.note||'Замечания не записаны')}</p><button class="button secondary" data-work="templates" data-id="${r.id}">Открыть и отредактировать документы</button><label>Какие замечания устранены<textarea id="reworkNote"></textarea></label><p>После подтверждения пакет будет доступен для повторной подачи. Прежний результат сохранится в истории.</p>`,'Подтвердить исправления','reworkPackage');
    if(kind==='receiveExecution')return form('Исполнительный документ',r,`<p>Решение суда само по себе не означает получение исполнительного документа.</p><button class="button secondary" data-work="uploadCase" data-id="${r.id}">Приложить полученный файл</button><label><input type="checkbox" id="receivedDemoExecution"> В демо: исполнительный документ получен, создать учебный файл</label>`,'Зафиксировать получение','receiveExecution');
    if(kind==='signDemoAgreement')return form('Подписание соглашения',r,`<p>Соглашение ${esc(c.agreementProposal?.number)} и график сформированы. Реальной подписи в демо нет.</p><label><input type="checkbox" id="signedDemoAgreement"> В демо: стороны подписали соглашение</label>`,'Подтвердить подписание в демо','signDemoAgreement');
    if(kind==='data')return openDrawer(r.id,'data');
    if(kind==='outcome')return form('Результат общения с должником',r,`<p>Остаток дела: ${money(amount(c.remaining))}. Обещание не считается оплатой.</p><label>Что решил должник / юрист<select id="contactResult">${Object.entries(CONTACT_RESULTS).map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</select></label><label>О чём договорились или почему выбран этот путь<textarea id="contactNote"></textarea></label><label>Дата следующего контроля<input id="contactDue" type="date" min="${TODAY}" value="${TODAY}"></label><p>Рассрочка откроет условия соглашения. Приказ или иск откроет подготовку соответствующего заявления, но не отправит его в суд.</p>`,'Сохранить результат','outcome');
    if(kind==='transition')return form('Результат текущего этапа',r,`<p>Сейчас: ${esc(c.stage)}. Переход меняет только выбранное дело, история и документы сохраняются.</p><label>Куда переходит дело<select id="nextStage">${choose(transitionOptions(c))}</select></label><label>Что произошло и почему меняется этап<textarea id="transitionReason" placeholder="Например: согласовали обсуждение рассрочки; или должник отказался, юрист проверил основания обращения в суд"></textarea></label>`,'Зафиксировать переход','transition');
    if(kind==='channels')return notify(r);
    if(kind==='enforcement')return enforcement(r);
    if(kind.startsWith('demo:')){
      const event=kind.split(':')[1],accounting=['fullPayment','halfPayment','newMonth'].includes(event);
      if(getRole()!==(accounting?'accountant':'lawyer'))throw Error(accounting?'Это событие выполняет расчётчик':'Это событие выполняет юрист');
      const balance=c?.remaining||unassigned(r),parts=event==='halfPayment'?{principal:Math.floor(balance.principal/2),penalty:Math.floor(balance.penalty/2),fee:balance.fee}:balance;
      const text={fullPayment:`Учебная выписка: ${money(amount(parts))}. Долг ${money(parts.principal)}, пени ${money(parts.penalty)}, пошлина ${money(parts.fee)}.`,halfPayment:`Учебная выписка: ${money(amount(parts))}. Долг ${money(parts.principal)}, пени ${money(parts.penalty)}, пошлина ${money(parts.fee)}.`,newMonth:'В учебном биллинге появился октябрь: содержание 2 000 ₽. Существующие дела и судебные требования не меняются.',agreement:`Учебный подписанный документ и график на ${money(amount(balance))}: две части, 29.10 и 15.11. Реального подписания нет.`,execution:'Зафиксировать учебное предъявление приказа в банк. Контроль поступлений 05.11.2026. Реальной отправки нет.'}[event];
      form('Подтвердить учебное событие',r,`<p>${esc(text)}</p><p>Основание: ${esc(c?.id||'долг вне дел')}. Повторное событие не увеличивает начисления или платежи.</p>`,'Учесть в демо','demo');context.event=event;return;
    }
    if(kind==='docxTemplate'){
      if(getRole()!=='lawyer')throw Error('Шаблоны настраивает юрист');
      return form('Шаблон DOCX',r,`<label>Вид документа<select id="docxKind">${availableTemplates(c).map(([k,d])=>`<option value="${k}">${esc(d.title)}</option>`).join('')}</select></label><label>Файл DOCX<input id="docxFile" type="file" accept=".docx"></label><p>Поля: ${TEMPLATE_FIELDS.map(k=>`{${k}}`).join(', ')}. До 500 КБ, без макросов и внешних ссылок.</p><button class="button secondary" data-work="baseDocx" data-id="${r.id}">Скачать образец шаблона</button>`,'Проверить и сохранить шаблон','docxTemplate');
    }
    if(kind==='templates')return openDrawer(r.id,'documents');
    if(kind.startsWith('draft:')||kind.startsWith('editDraft:')){
      if(getRole()!=='lawyer')throw Error('Документы готовит юрист');
      const previous=kind.startsWith('editDraft:')?c.drafts?.find(d=>d.id===kind.split(':')[1]):null;
      const draft=previous||draftDocument(r,kind.split(':')[1]);
      form(draft.title,r,`<label>Текст документа<textarea id="draftText" rows="16" ${previous?.status==='sent'?'readonly':''}>${esc(draft.text)}</textarea></label>${draft.missing.length?`<p class="notice">Не хватает: ${esc(draft.missing.join('; '))}. Сохранить можно только как черновик.</p>`:''}<p>Данные и текст этого экземпляра сохраняются отдельно от последующих изменений долга.</p>`,previous?.status==='sent'?'Закрыть':'Сохранить черновик','draft');context.draft=draft;context.draftId=previous?.id;return;
    }
    if(kind==='review'){
      if(getRole()!=='lawyer')throw Error('Запрос расчётчику отправляет юрист');
      if(r.reviewTask?.status==='open')return edit('reviewStatus',r);
      const missing=c?[...new Set(stageDocumentEntries(r).flatMap(d=>d.missing))].filter(x=>!['номер и дата проекта соглашения','согласованный график платежей','реквизиты адресата и утверждённый юридический текст'].includes(x)):[];
      return form(roleRecommendation({...r,_caseView:true},'lawyer').action==='review'?roleRecommendation({...r,_caseView:true},'lawyer').label:'Запросить уточнение у расчётчика',r,`<label>Что нужно уточнить<textarea id="reviewReason">${esc(reviewReasons(r).join('; ')||(missing.length?'Для документов дела нужны: '+missing.join('; '):''))}</textarea></label><label>Срок ответа<input id="reviewDue" type="date" min="${TODAY}" value="${TODAY}"></label><p>Запрос относится к сумме или исходным сведениям, а не меняет юридический этап.</p>`,'Отправить запрос','review');
    }
    if(kind==='reviewStatus')return modal('Запрос бухгалтерии',r.reviewTask.reason,`<p>Срок: ${esc(r.reviewTask.due)} · ${r.reviewTask.status==='open'?'Ждём ответа':'Ответ получен'}</p>`);
    if(kind==='resolve'){
      if(getRole()!=='accountant')throw Error('Сверку выполняет расчётчик');
      return form('Уточнение суммы долга',r,`<p>${esc(r.reviewTask?.reason||recommendation(r).detail)}</p>${r.unallocated?`<button class="button secondary" data-work="payment" data-id="${r.id}">Разнести ${money(r.unallocated)}</button>`:''}${days(r.asOf)>7?`<button class="button secondary" data-work="sources" data-id="${r.id}">Загрузить свежий реестр</button>`:''}${r.caseBalanceConflict?`<button class="button secondary" data-work="balances" data-id="${r.id}">Уточнить долг по делам</button>`:''}${r.disputed?`<label><input id="disputeResolved" type="checkbox"> Возражения проверены, сумма подтверждена</label>`:''}<label>Ответ бухгалтера<textarea id="reviewResult"></textarea></label>`,'Подтвердить уточнение','resolve');
    }
    if(kind==='balances'){
      if(getRole()!=='accountant')throw Error('Остатки подтверждает расчётчик');
      return form('Остатки по делам',r,`<p>Сальдо ЛС: ${money(total(r))}. Неотнесённая часть останется вне дел.</p>${r.cases.map((c,i)=>`<h3>${esc(c.id)} · ${esc(ownerLabel(c))} · ${esc(c.period)}</h3><div class="form-grid">${fields(`case${i}`,c.remaining)}</div>`).join('')}`,'Подтвердить остатки','balances');
    }
    if(kind==='newCase')return form('Новое дело по отдельному долгу',r,`<p>Доступно вне открытых дел: ${money(amount(unassigned(r)))}. Существующие требования сохраняются.</p><label>Период${r.billing?' из непогашенных начислений':''}<input id="newPeriod" value="${esc(r.billing?billingPeriod(billingLines(r)):r.period)}" ${r.billing?'readonly':''}></label><div class="form-grid">${fields('new',unassigned(r))}</div>`,'Создать дело','newCase');
    if(kind==='closeCase')return form('Завершить выбранное дело',r,`<p>${esc(c?.id)} · остаток ${money(amount(c?.remaining))}. Другие долги ЛС не закрываются.</p><label>Основание<textarea id="closeReason">Погашение подтверждено по поступлениям дела</textarea></label>`,'Завершить дело','closeCase');
    if(kind==='legal'){
      if(!c)throw Error('Сначала создайте дело');
      const statuses=LEGAL_RESULTS[c.stage]||{},status=packageReady(r)&&['Подготовка','Иск подготовлен',undefined].includes(c.legal.status)?'Подано':Object.hasOwn(statuses,c.legal.status)?c.legal.status:Object.keys(statuses)[0];
      return form(`${c.stage}: что произошло`,r,`<div class="form-grid"><label>Результат<select id="legalStatus">${choose(Object.keys(statuses),status)}</select></label><label>Номер документа / обращения<input id="legalNumber" value="${esc(c.legal.number||'')}"></label><label>Дата результата<input type="date" id="legalDate" max="${TODAY}" value="${TODAY}"></label><label>Дата следующего контроля<input type="date" id="legalDue" min="${TODAY}" value="${c.legal.nextDate||TODAY}"></label></div><label>Результат, замечания суда или причина отказа<textarea id="legalNote"></textarea></label><p id="legalNext">Далее: ${esc(statuses[status]||'')}</p><label id="receivedDemoLabel" ${['Получен документ','Получено решение'].includes(status)?'':'hidden'}><input type="checkbox" id="receivedDemoDocument"> В демо: создать учебный экземпляр полученного документа</label><p>Скачивание черновика не считается подачей. Результат фиксируется по документу или подтверждению обращения; внешних отправок нет.</p>`,'Зафиксировать результат','legal');
    }
    if(kind==='agreement'){
      if(!c)throw Error('Сначала создайте дело');
      const agreement=c.agreement||c.agreementProposal;
      if(c.agreementProposal&&!c.agreement)return modal('Получить подпись по соглашению',`ЛС ${r.account} · ${c.id}`,`<p>Условия согласованы: ${esc(c.agreementProposal.number)}. График на ${money(amount(c.remaining))}.</p><div class="action-row"><button class="button secondary" data-work="templates" data-id="${r.id}">Проверить соглашение и график</button><button class="button" data-work="signDemoAgreement" data-id="${r.id}">Смоделировать подписание</button><button class="button secondary" data-work="uploadCase" data-id="${r.id}">Приложить подписанный документ</button><button class="button secondary" data-work="outcome" data-id="${r.id}">Должник отказался</button></div>`);
      return form('Условия соглашения',r,`<p>Остаток выбранного дела: <strong>${money(amount(c.remaining))}</strong>. Расчёт получен из ${esc(r.source)} на ${esc(r.asOf)}.</p><label>Результат переговоров<select id="agreementMode"><option value="proposal">Предложить график, подписи ещё нет</option><option value="signed" ${c.agreement?'selected':''}>Соглашение подписано</option></select></label><div class="form-grid"><label>Номер проекта / соглашения<input id="agreementNumber" value="${esc(agreement?.number||'')}"></label><label>Дата<input type="date" id="agreementDate" max="${TODAY}" value="${agreement?.date||TODAY}"></label></div><h3>График платежей</h3><div id="scheduleRows">${(c.schedule.length?c.schedule:[{date:TODAY,amount:amount(c.remaining)}]).map(scheduleRow).join('')}</div><button class="button secondary small" data-add-payment>Добавить платёж</button><label id="agreementFileLabel" ${c.agreement?'':'hidden'}>Подписанный документ${c.documents.some(d=>d.kind==='agreement'&&!d.archived)?'<small>Файл уже приложен к делу</small>':'<input id="agreementFile" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg">'}</label><p>Предложение сохранит условия для черновиков. Подписанное соглашение требует файла; после сохранения появится контроль платежей. Оплата учитывается только из поступлений.</p>`,'Сохранить результат переговоров','agreement');
    }
    if(kind==='installment'){
      if(!c?.agreement)throw Error('Сначала зафиксируйте подписанное соглашение');
      if(!Number.isInteger(index)||index<0)index=c.schedule.findIndex(x=>!x.paid);
      if(!c.schedule[index])return edit('follow',r);
      const payments=r.payments.map((p,i)=>({p,i})).filter(({p})=>p.caseId===c.id&&!c.schedule.some(x=>x.paid&&x.paymentIds?.includes(p.id)));
      if(!payments.length)return modal('Контроль платежа',`ЛС ${r.account} · ${c.id}`,`<p>По графику: ${money(c.schedule[index].amount)} до ${esc(c.schedule[index].date)}.</p><p>${c.schedule[index].date<TODAY?'Срок истёк, поступления не зарегистрированы.':'Срок ещё не истёк, поступления пока не зарегистрированы.'}</p><div class="action-row"><button class="button" data-work="follow" data-id="${r.id}">Зафиксировать контакт и дату контроля</button><button class="button secondary" data-work="outcome" data-id="${r.id}">Нарушение графика: выбрать дальнейший путь</button><button class="button secondary" data-work="review" data-id="${r.id}">Уточнить конкретную оплату у бухгалтера</button></div>`);
      form('Подтвердить платёж графика',r,`<p>План: ${money(c.schedule[index].amount)} · ${esc(c.schedule[index].date)}</p>${payments.map(({p,i})=>`<label><input type="checkbox" data-pay-index="${i}"> ${esc(p.at)} · ${money(p.amount)}</label>`).join('')||'<p>По этому делу нет разнесённых платежей. Сначала нужна бухгалтерская сверка.</p>'}`,'Связать поступления','installment');context.index=index;return;
    }
    if(kind==='owners')return form('Собственники и доли',r,`<label>Имя; доля в процентах<textarea id="owners" rows="5" placeholder="Демо собственник;100">${r.owners.map(o=>`${o.name};${o.share}`).join('\n')}</textarea></label><p>Не вводите персональные данные реальных жителей в публичное демо.</p>`,'Сохранить','owners');
    if(kind==='monthly')return form('Помесячный расчёт из биллинга',r,`<p>Вставьте CSV с заголовком: month;area;formula;opening;charges;payments;closing. Суммы основного долга в рублях. Пени и пошлина остаются отдельно.</p><label>Данные расчёта<textarea id="monthly" rows="7" placeholder="month;area;formula;opening;charges;payments;closing"></textarea></label><p>Проверяются баланс каждого месяца, последовательность остатков и совпадение с основным долгом ЛС.</p>`,'Проверить и сохранить','monthly');
    if(kind==='previous')return form('Связать прежний лицевой счёт',r,`<label>Прежний ЛС<select id="previousAccount">${getState().rows.filter(x=>x.id!==r.id&&x.company===r.company).map(x=>`<option value="${x.id}">${esc(x.account)} · ${esc(x.building)} · кв. ${esc(x.flat)}</option>`).join('')}</select></label><label>Прежний собственник<input id="previousName"></label><label>Основание связи<input id="previousReason" placeholder="Смена собственника, дата"></label><p>Связь не переносит долг на нового владельца. Суммы и дела прежнего ЛС сохраняются.</p>`,'Сохранить связь','previous');
    if(['uploadHouse','uploadCase'].includes(kind)){
      if(kind==='uploadCase'&&!c)throw Error('Сначала создайте дело');
      form('Добавить демонстрационный файл',r,`<label>Вид документа<select id="fileKind">${kind==='uploadHouse'?'<option value="contract">Договор управления</option>':'<option value="order">Судебный приказ</option><option value="agreement">Подписанное соглашение</option><option value="claim">Иск</option><option value="enforcement">Исполнительный документ</option><option value="other">Иное</option>'}</select></label><label>Файл<input id="caseFile" type="file" accept=".pdf,.txt,.png,.jpg,.jpeg"></label><p>До 500 КБ на файл. Только синтетические документы. Общий договор будет доступен во всех делах этого дома.</p>`,'Добавить файл',kind);if(kind==='uploadCase')$('#fileKind').value=c.stage==='Соглашение'?'agreement':c.stage==='Иск'?'enforcement':'order';return;
    }
    if(kind==='packet'){
      const docs=packetFiles(getState(),r);
      return modal('Состав пакета выбранного дела',c?.id||'Дело не создано',`<p>${r.owners.length?'Собственники и доли заполнены':'Не хватает собственников и долей'}</p><p>${r.charges.length?'Помесячный расчёт приложен':'Не хватает помесячного расчёта'}</p><p>${docs.some(d=>d.house)?'Договор дома подставлен автоматически':'Не хватает договора дома'}</p>${docs.map(d=>`<p>${esc(d.name)} <button class="icon-button" data-work="download" data-doc="${d.id}" data-id="${r.id}" aria-label="Скачать ${esc(d.name)}">${icon('download')}</button></p>`).join('')}<button class="button secondary" data-work="exportPacket" data-id="${r.id}">Скачать опись и расчёт</button><p>Это проверка комплектности, не подтверждение готовности к подаче в суд.</p>`);
    }
    if(kind==='taskDone')return form('Завершить задачу',r,`<p>${esc(r.task?.text)}</p><label>Результат<textarea id="taskResult"></textarea></label>`,'Завершить','taskDone');
    if(kind==='follow')return form('Проверка оплаты',r,`<p>Остаток дела ${money(c?amount(c.remaining):total(r))} на ${esc(r.asOf)}. Нельзя уменьшить долг без разнесения поступления.</p><label>Результат<input id="followNote" placeholder="Оплата не поступила, связаться повторно"></label><label>Следующая проверка<input id="followDate" type="date" min="${TODAY}" value="${TODAY}"></label>`,'Зафиксировать','follow');
    if(kind==='payment')return payment(r.id);
    if(kind==='sources')return showSources();
    if(kind==='history'||kind==='documents')return openDrawer(r.id,kind==='history'?'history':'documents');
    return bulk('task',[r.id]);
  }
  document.addEventListener('click',async e=>{
    if(e.target.closest('[data-add-payment]')){$('#scheduleRows').insertAdjacentHTML('beforeend',scheduleRow());window.lucide?.createIcons();return;}
    if(e.target.closest('[data-remove-payment]')){e.target.closest('.schedule-row').remove();return;}
    const el=e.target.closest('[data-work],[data-work-save]');if(!el)return;
    try{
      if(el.dataset.work){
        const r=getRow(el.dataset.id),kind=el.dataset.work;
        if(kind.startsWith('createDocx:')){if(getRole()!=='lawyer')throw Error('Документы готовит юрист');const d=ensureDocument(r,kind.split(':')[1]);save();downloadBytes(`demo-${r.account}-${d.kind}.docx`,renderDocx(d,docxDeps(),getState().documentTemplates?.[d.kind]),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');openDrawer(r.id,'documents');return;}
        if(kind==='baseDocx'){downloadBytes('demo-template.docx',templateBytes(window.PizZip),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');return;}
        if(kind.startsWith('docx:')){const d=currentCase(r)?.drafts?.find(x=>x.id===kind.split(':')[1]);if(!d||d.archived)throw Error('Документ не найден');downloadBytes(`demo-${r.account}-${d.kind}.docx`,renderDocx(d,docxDeps(),getState().documentTemplates?.[d.kind]),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');return;}
        if(/^(downloadDraft|archiveDraft|restoreDraft):/.test(kind)){
          const [action,id]=kind.split(':'),d=currentCase(r)?.drafts?.find(d=>d.id===id);if(!d)throw Error('Документ не найден');
          if(action==='downloadDraft'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([documentText(r,id)],{type:'text/plain;charset=utf-8'}));a.download=`demo-${r.account}-${d.kind}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return;}
          if(getRole()!=='lawyer')throw Error('Документы ведёт юрист');d.archived=action==='archiveDraft';audit(r,d.archived?'Черновик архивирован':'Черновик восстановлен',d.title);save();openDrawer(r.id,'documents');return;
        }
        if(kind==='download'){const d=packetFiles(getState(),r).find(d=>d.id===el.dataset.doc);if(!d)throw Error('Файл не найден');const a=document.createElement('a');a.href=d.data;a.download=d.name;a.click();return;}
        if(kind==='exportPacket'){
          const c=currentCase(r);if(!c)throw Error('Выберите дело');const zip=new window.PizZip();
          const calc=draftDocument(r,'calculation');zip.file('Расчёт задолженности.docx',renderDocx(calc,docxDeps()));
          for(const d of c.drafts||[])if(!d.archived)zip.file(`${d.id}-${d.kind}.docx`,renderDocx(d,docxDeps(),getState().documentTemplates?.[d.kind]));
          for(const d of packetFiles(getState(),r)){const data=d.data.split(',');zip.file(`${d.id}-${d.name}`,/;base64/.test(data[0])?data[1]:decodeURIComponent(data.slice(1).join(',')),{base64:/;base64/.test(data[0])});}
          zip.file('Состав.txt',`УЧЕБНЫЙ ПАКЕТ. Дело ${c.id}. Проверить юридическую комплектность перед использованием.\n${packetFiles(getState(),r).map(d=>d.name).join('\n')}`);
          downloadBytes(`demo-case-${r.account}.zip`,zip.generate({type:'uint8array',compression:'DEFLATE'}),'application/zip');return;
        }
        return edit(kind,r,Number(el.dataset.index));
      }
      const r=getRow(context.id),kind=context.kind,c=currentCase(r);
      if(kind==='demo')demoEvent(getState(),r,context.event);
      if(kind==='signDemoAgreement'){if(!$('#signedDemoAgreement').checked)throw Error('Подтвердите учебное подписание');signDemoAgreement(r);}
      if(kind==='receiveExecution'){if(!$('#receivedDemoExecution').checked)throw Error('Подтвердите получение в демо или приложите файл');if(c.stage!=='Иск'||c.legal?.status!=='Получено решение')throw Error('Сначала зафиксируйте решение суда');demoReceivedDocument(r,'enforcement','Исполнительный документ');audit(r,'Получен исполнительный документ','Учебный экземпляр');}
      if(kind==='reworkPackage')reworkCasePackage(r,$('#reworkNote').value);
      if(kind==='docxTemplate'){
        if(getRole()!=='lawyer')throw Error('Нужна роль юриста');const f=$('#docxFile').files[0],key=$('#docxKind').value;
        if(!f||!f.name.endsWith('.docx')||f.size>500*1024)throw Error('Выберите DOCX до 500 КБ');
        const bytes=new Uint8Array(await f.arrayBuffer());renderDocx(draftDocument(r,key),docxDeps(),bytes);
        let binary='';for(const b of bytes)binary+=String.fromCharCode(b);getState().documentTemplates||={};getState().documentTemplates[key]=btoa(binary);audit(r,'Шаблон DOCX сохранён',key);
      }
      if(kind==='draft'){if(context.draft.status==='sent'){close();return;}saveDraft(r,context.draft,$('#draftText').value,context.draftId);audit(r,'Черновик документа сохранён',context.draft.title);}
      if(kind==='review')requestReview(r,$('#reviewDue').value,$('#reviewReason').value);
      if(kind==='resolve'){
        if(getRole()!=='accountant')throw Error('Нужна роль расчётчика');
        const note=$('#reviewResult').value.trim();if(!note)throw Error('Опишите результат');
        if(r.caseBalanceConflict||r.unallocated>0||days(r.asOf)>7)throw Error('Сначала устраните расхождения данных');
        if(r.disputed&&!$('#disputeResolved')?.checked)throw Error('Подтвердите проверку возражений');
        r.disputed=false;if(r.reviewTask?.status==='open')resolveReview(r,note);else audit(r,'Сверка завершена',note);
      }
      if(kind==='balances')reconcileCases(r,r.cases.map((c,i)=>({id:c.id,...readParts(`case${i}`)})));
      if(kind==='newCase'){const c=createCase(r,$('#newPeriod').value,readParts('new'));audit(r,'Создано отдельное дело',`${c.id} · ${c.period}`);}
      if(kind==='closeCase'){changeStage(r,'Завершено',$('#closeReason').value);ensureDocument(r,'closure');ensureDocument(r,'paymentStatement');}
      if(kind==='transition')transitionCase(r,$('#nextStage').value,$('#transitionReason').value);
      if(kind==='outcome')recordContactResult(r,$('#contactResult').value,$('#contactNote').value,$('#contactDue').value);
      if(kind==='legal')recordLegalResult(r,{number:$('#legalNumber').value,date:$('#legalDate').value,status:$('#legalStatus').value,note:$('#legalNote').value,nextDate:$('#legalDue').value},{simulateDocument:$('#receivedDemoDocument').checked});
      if(kind==='agreement'){
        if(c.schedule.some(x=>x.paid))throw Error('График с подтверждёнными платежами нельзя перезаписать');
        const number=$('#agreementNumber').value,date=$('#agreementDate').value,schedule=[...document.querySelectorAll('.schedule-row')].map(el=>({date:el.querySelector('[data-schedule-date]').value,amount:cents(el.querySelector('[data-schedule-amount]').value)}));
        const backup=structuredClone(r);
        try{
          if($('#agreementMode').value==='proposal'){saveAgreementProposal(r,number,date,schedule);prepareCasePackage(r);}
          else{
            const file=$('#agreementFile')?.files[0];
            if(file){if(file.size>500*1024||!['application/pdf','text/plain','image/png','image/jpeg'].includes(file.type))throw Error('Выберите PDF, TXT, PNG или JPEG до 500 КБ');const data=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file);});c.documents.push({id:crypto.randomUUID(),kind:'agreement',name:file.name,size:file.size,data});}
            saveAgreement(r,number,date,schedule);
          }
        }catch(err){Object.assign(r,backup);throw err;}
      }
      if(kind==='installment')markInstallment(r,context.index,[...document.querySelectorAll('[data-pay-index]:checked')].map(x=>Number(x.dataset.payIndex)));
      if(kind==='owners')saveOwners(r,$('#owners').value.trim().split('\n').map(line=>{const [name,share]=line.split(';');return {name:name?.trim(),share:Number(share)};}));
      if(kind==='monthly'){const parsed=window.Papa.parse($('#monthly').value,{header:true,delimiter:';',skipEmptyLines:true});if(parsed.errors.length)throw Error('Проверьте CSV');saveMonthly(r,parsed.data);}
      if(kind==='previous'){
        const old=getRow($('#previousAccount').value),name=$('#previousName').value.trim(),reason=$('#previousReason').value.trim();
        if(!old||!name||!reason||old.building!==r.building||String(old.flat)!==String(r.flat))throw Error('Укажите прежний ЛС того же помещения, имя и основание');
        if(r.ownerHistory.some(x=>x.account===old.account))throw Error('Связь уже сохранена');
        r.ownerHistory.push({account:old.account,name,reason});audit(r,'Прежний ЛС связан',old.account);
      }
      if(['uploadHouse','uploadCase'].includes(kind)){
        const file=$('#caseFile').files[0],fileKind=$('#fileKind').value;
        if(!file||file.size>500*1024||!['application/pdf','text/plain','image/png','image/jpeg'].includes(file.type))throw Error('Выберите PDF, TXT, PNG или JPEG до 500 КБ');
        const data=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file);});
        const doc={id:crypto.randomUUID(),name:file.name,size:file.size,kind:fileKind,data};
        if(kind==='uploadHouse'){getState().houseDocuments||={};const key=JSON.stringify([r.company,r.building]);(getState().houseDocuments[key]||=[]).push({...doc,house:true});}else c.documents.push(doc);
        if(kind==='uploadCase'&&fileKind==='agreement'&&c.agreementProposal&&!c.agreement)saveAgreement(r,c.agreementProposal.number,c.agreementProposal.date,c.schedule);
        audit(r,'Документ добавлен',file.name);
      }
      if(kind==='taskDone'){if(!$('#taskResult').value.trim())throw Error('Укажите результат');r.task.status='done';audit(r,'Задача выполнена',$('#taskResult').value);}
      if(kind==='follow'){const note=$('#followNote').value.trim(),due=$('#followDate').value;if(!note||!due||due<TODAY)throw Error('Укажите результат и дату');r.promise=null;r.task={text:note,due,owner:r.owner,status:'open'};audit(r,'Оплата проверена',note);}
      save();close();render();openDrawer(r.id,kind==='draft'?'documents':'overview');toast('Сохранено в демо');
    }catch(err){const host=$('#workError');if(host)host.innerHTML=`<div class="error" role="alert">${esc(err.message)}</div>`;else toast(err.message);}
  });
  document.addEventListener('change',e=>{if(e.target.dataset.caseSelect){const r=getRow(e.target.dataset.caseSelect);selectCase(r,e.target.value);save();render();openDrawer(r.id);}});
  document.addEventListener('change',e=>{if(e.target.id==='legalStatus'){$('#legalNext').textContent='Далее: '+(LEGAL_RESULTS[currentCase(getRow(context.id)).stage]?.[e.target.value]||'');$('#receivedDemoLabel').hidden=!['Получен документ','Получено решение'].includes(e.target.value);$('#receivedDemoDocument').checked=false;}});
  document.addEventListener('change',e=>{if(e.target.id==='agreementMode')$('#agreementFileLabel').hidden=e.target.value!=='signed';});
  return {open:(kind,id,index)=>edit(kind,getRow(id),index)};
}
import {ownerLabel} from './ownership.mjs';
