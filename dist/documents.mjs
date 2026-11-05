import {TODAY,money,days} from './model.mjs';
import {currentCase,amount} from './cases.mjs';
import {billingLines,principalDue,penaltyDue} from './billing.mjs';

// Templates demonstrate data binding, not a legally reviewed filing package.
export const DOCUMENTS={
  notice:{title:'Уведомление о задолженности',stages:['Уведомление']},
  demand:{title:'Досудебная претензия',stages:['Уведомление']},
  agreement:{title:'Соглашение о погашении задолженности',stages:['Соглашение']},
  schedule:{title:'График погашения задолженности',stages:['Соглашение']},
  paymentStatement:{title:'Реестр оплат по делу',stages:['Уведомление','Соглашение','Приказ','Иск','Приставы','Завершено']},
  closure:{title:'Отчёт о завершении дела',stages:['Завершено']},
  orderApplication:{title:'Заявление о выдаче судебного приказа',stages:['Приказ']},
  courtInventory:{title:'Опись документов',stages:['Приказ','Иск']},
  claim:{title:'Исковое заявление',stages:['Иск']},
  enforcementApplication:{title:'Заявление о предъявлении исполнительного документа',stages:['Приказ','Иск','Приставы']},
  calculation:{title:'Расчёт задолженности',stages:['Уведомление','Соглашение','Приказ','Иск','Приставы','Завершено']}
};
export function availableTemplates(c){return Object.entries(DOCUMENTS).filter(([kind,d])=>d.stages.includes(c?.stage)&&(kind!=='enforcementApplication'||(c.legal?.status!=='Отменён приказ'&&c.documents?.some(doc=>!doc.archived&&(c.stage==='Приставы'?['order','enforcement'].includes(doc.kind):doc.kind===(c.stage==='Приказ'?'order':'enforcement'))))));}
export function caseProgress(c,r){
  const progress=stageProgress(c,r),issues=r&&c?.stage!=='Завершено'?reviewReasons(r):[];
  return issues.length?{...progress,dataIssue:issues.join('; '),next:r.reviewTask?.status==='open'?'Посмотреть запрос бухгалтерии':'Уточнить сумму перед продолжением',work:r.reviewTask?.status==='open'?'reviewStatus':'review'}:progress;
}
function stageProgress(c,r){
  if(!c&&r&&amount(r)===0)return {label:'Задолженности нет',next:'Открыть историю лицевого счёта',work:'history'};
  if(!c)return {label:'Взыскание не начато',next:'Подготовить уведомление',work:'channels'};
  if(c.stage!=='Завершено'&&c.balanceConfirmed&&amount(c.remaining)===0)return {label:'Долг по делу погашен',next:'Проверить и завершить дело',work:'closeCase'};
  if(c.stage==='Соглашение')return c.agreement
    ?{label:`Подписано: ${c.agreement.number} от ${c.agreement.date}`,next:c.schedule.some(x=>!x.paid)?'Проверить платёж по графику':'Проверить остаток по делу',work:c.schedule.some(x=>!x.paid)?'installment':'follow'}
    :c.agreementProposal?{label:'График предложен, подписи ещё нет',next:'Зафиксировать подписание',work:'agreement'}:{label:'Условия рассрочки не зафиксированы',next:'Подготовить условия и график',work:'agreement'};
  if(c.stage==='Уведомление'){
    const events=(r?.events||[]).filter(e=>e.caseId===c.id&&['app','email','max','robot','notice','receipt'].includes(e.action)&&!e.status.startsWith('Отменено'));
    const sent=events.find(e=>['Отправлено (демо)','Доставлено (демо)','Обещана оплата (демо)'].includes(e.status));
    if(c.contactResult)return {label:c.contactResult.label,next:'Зафиксировать ответ / проверить оплату',work:'outcome'};
    if(!sent&&events.some(e=>e.status==='Сформировано для печати (демо)'))return {label:'Печатная форма готова, вручение не подтверждено',next:'Зафиксировать результат вручения',work:'outcome'};
    return sent?{label:sent.status,next:'Зафиксировать ответ должника',work:'outcome'}:{label:events.length?'Уведомление подготовлено, не отправлено':'Уведомление ещё не отправлено',next:'Отправить уведомление',work:'channels'};
  }
  if(c.stage==='Завершено')return {label:c.closedReason||'Основание завершения не указано',next:'Открыть документы и историю',work:'documents'};
  const hasDocument=c.documents?.some(d=>!d.archived&&d.kind===({Приказ:'order',Иск:'claim',Приставы:'enforcement'})[c.stage]);
  if(c.legal?.status==='Отменён приказ')return {label:'Судебный приказ отменён',next:'Выбрать дальнейший путь: иск',work:'transition'};
  if(c.stage==='Суд: уточнить')return {label:'В старом сохранении не указан вид суда',next:'Указать: приказ или иск',work:'transition'};
  if(c.stage==='Приказ'&&c.legal?.status==='Получен документ'&&!c.documents?.some(d=>!d.archived&&d.kind==='order'))return {label:'Получение приказа отмечено, файл не приложен',next:'Приложить судебный приказ',work:'uploadCase'};
  if(c.stage==='Иск'&&c.legal?.status==='Получено решение'&&!c.documents?.some(d=>!d.archived&&d.kind==='enforcement'))return {label:'Решение суда получено',next:'Получить исполнительный документ',work:'receiveExecution'};
  if(['Приказ','Иск'].includes(c.stage)&&c.packageRevisionNeeded)return {label:c.legal?.status||'Нужны исправления',next:'Исправить пакет по замечаниям суда',work:'reworkPackage'};
  if(c.stage==='Приставы')return {label:c.legal?.status||'Ожидаем принятия документа',next:c.legal?.status==='Возвращён документ'?'Повторно предъявить документ':c.legal?.status==='Исполнение'?'Проверить поступления и результат исполнения':'Зафиксировать ответ банка / ФССП',work:c.legal?.status==='Возвращён документ'?'enforcement':'legal'};
  if(['Приказ','Иск'].includes(c.stage)&&c.documents?.some(d=>!d.archived&&d.kind===(c.stage==='Приказ'?'order':'enforcement')))return {label:c.legal?.status||'Исполнительный документ получен',next:'Предъявить в банк / ФССП',work:'enforcement'};
  if(['Приказ','Иск'].includes(c.stage)&&(!c.legal?.status||['Подготовка','Иск подготовлен','Подготовка иска'].includes(c.legal.status))){
    const kinds=c.stage==='Приказ'?['orderApplication','calculation','courtInventory']:['claim','calculation','courtInventory'];
    const docs=r?stageDocumentEntries(r):[];
    const ready=kinds.every(k=>docs.some(d=>d.kind===k&&d.id&&!d.missing.length));
    return ready?{label:'Пакет сформирован, ещё не подан',next:'Зафиксировать подачу в суд',work:'legal'}:{label:'Заявление готовится',next:'Подготовить пакет документов',work:'templates'};
  }
  if(c.legal?.next)return {label:c.legal.status||'Следующий шаг назначен',next:c.legal.status==='Отказано'?'Зафиксировать решение юриста по отказу':c.legal.next,work:'legal'};
  if(['Приказ','Иск'].includes(c.stage))return {label:c.legal?.status||'Заявление готовится',next:'Открыть заявление и приложения',work:'templates'};
  return {label:c.legal?.status||'Результат этапа не зафиксирован',next:c.legal?.next||(hasDocument?'Указать результат и следующий шаг':'Подготовить или приложить документ'),work:c.legal?.next||hasDocument?'legal':'templates'};
}
export function reviewReasons(r){
  return [r.unallocated>0?`Не разнесена оплата ${money(r.unallocated)}`:'',r.caseBalanceConflict?`Не подтверждено распределение долга ЛС ${money(amount(r))} между делами. Нужен остаток основного долга, пеней и пошлины по каждому делу`: '',r.disputed?'Житель оспаривает сумму долга':'',days(r.asOf)>7?`Реестр от ${r.asOf} устарел`:'',r.reviewTask?.status==='open'?`Ждём ответ бухгалтера: ${r.reviewTask.reason}`:''].filter(Boolean);
}
export function stageDocumentEntries(r){
  const c=currentCase(r);if(!c)return [];
  return availableTemplates(c).map(([kind])=>{
    const fresh=draftDocument(r,kind),saved=c.drafts?.findLast(d=>!d.archived&&d.kind===kind&&JSON.stringify(d.data)===JSON.stringify(fresh.data));
    return saved?{...saved,missing:saved.status==='sent'?saved.missing:fresh.missing}:{...fresh,status:'not_created'};
  });
}
export function ensureDocument(r,kind){
  const entry=stageDocumentEntries(r).find(d=>d.kind===kind);
  if(!entry)throw Error('Документ недоступен на этом этапе');
  if(entry.id){const saved=currentCase(r).drafts.find(d=>d.id===entry.id);if(saved.status!=='sent')saved.missing=entry.missing;return saved;}
  const saved=saveDraft(r,entry,entry.text);saved.autoFilled=true;return saved;
}
export function ensureStageDocuments(r){
  const c=currentCase(r);if(!c)return [];
  return availableTemplates(c).map(([kind])=>{
    const fresh=draftDocument(r,kind);
    const existing=c.drafts?.findLast(d=>!d.archived&&d.kind===kind&&JSON.stringify(d.data)===JSON.stringify(fresh.data));
    if(existing){if(existing.status!=='sent')existing.missing=[...fresh.missing];return existing;}
    const saved=saveDraft(r,fresh,fresh.text);saved.autoFilled=true;return saved;
  });
}
export function stageAge(c){
  if(!c?.stageEnteredAt)return 'Дата входа на этап не загружена';
  const n=Math.floor((Date.parse(TODAY)-Date.parse(c.stageEnteredAt))/86400000);
  return Number.isFinite(n)&&n>=0?`${n} дн. на этапе · с ${c.stageEnteredAt}`:'Проверьте дату входа на этап';
}
export function draftDocument(r,kind){
  const draft=buildDraftDocument(r,kind),c=currentCase(r);
  if(['orderApplication','claim','enforcementApplication'].includes(kind))draft.text=draft.text.replace('Кому:','Должник:');
  if(kind==='enforcementApplication'){
    draft.data.recipient=c.legal?.recipient||'bank';draft.data.legalNumber=c.legal?.number||'';
    if(draft.data.recipient==='fssp')draft.text=draft.text.replace('Адресат: Учебный банк.','Адресат: Учебное отделение ФССП.');
  }
  if(['agreement','schedule'].includes(kind)){
    const terms=c.agreement||c.agreementProposal;
    draft.data.agreementNumber=terms?.number||'';draft.data.agreementDate=terms?.date||'';
    draft.data.agreementStatus=c.agreement?'Подписано':'Проект, подписи не зафиксированы';
    draft.text+=`\n\nСоглашение: ${terms?.number||'[номер не указан]'} от ${terms?.date||'[дата не указана]'}. ${draft.data.agreementStatus}.`;
    if(!terms)draft.missing.push('номер и дата проекта соглашения');
    if(kind==='agreement'&&!c.schedule.length)draft.missing.push('согласованный график платежей');
  }
  if(kind==='agreement')draft.data.schedule=JSON.stringify(c.schedule.map(x=>({date:x.date,amount:x.amount})));
  if(kind==='schedule'){
    draft.data.schedule=JSON.stringify(c.schedule);
    if(!c.schedule.length)draft.missing.push('согласованный график платежей');
    draft.text+=`\n\nГрафик: ${c.schedule.map(x=>`${x.date}: ${money(x.amount)} · ${x.paid?'оплата подтверждена':'ожидается'}`).join('\n')||'Не согласован'}`;
  }
  if(['paymentStatement','closure'].includes(kind)){
    const payments=(r.payments||[]).filter(p=>p.caseId===c.id);
    draft.data.payments=JSON.stringify(payments);draft.data.closedReason=c.closedReason||'';
    draft.text+=`\n\nОплаты по делу:\n${payments.map(p=>`${p.at} · ${p.source||'Источник не указан'} · ${p.reference||p.externalId||p.id||'Без номера'} · ${money(p.amount)} (долг ${money(p.principal)}, пени ${money(p.penalty)}, пошлина ${money(p.fee)})`).join('\n')||'Поступления не зарегистрированы'}\nОстаток: ${money(amount(c.remaining))}${kind==='closure'?'\nОснование завершения: '+(c.closedReason||'Не указано'):''}`;
    if(kind==='closure'&&!c.closedReason)draft.missing.push('основание завершения');
  }
  if(['notice','demand'].includes(kind)){
    const data=draft.data;
    data.templateRevision='notice-2026-11-03';
    draft.text=`ДЕМОНСТРАЦИОННЫЙ ДОКУМЕНТ. НЕ ДЛЯ ОТПРАВКИ.\n${draft.title}\n№ ${c.id} от ${TODAY}\nОт: ${data.company}\nКому: ${data.people}\nАдрес: ${data.address}\nЛицевой счёт: ${data.account}\n\nПо данным на ${r.asOf} задолженность за ${data.period} составляет ${money(data.remaining)}.\nЗа услуги: ${money(data.principal)}\nПени: ${money(data.penalty)}\nГоспошлина к возмещению: ${money(data.fee)}\n\nПросим погасить задолженность. Если Вы уже оплатили долг либо не согласны с суммой, сообщите об этом управляющей компании для проверки поступления и расчёта.\n${kind==='demand'?'Последствия неисполнения, срок ответа и правовые основания проверяет и дополняет юрист. Автоматического обращения в суд нет.\n':''}\nПредставитель организации: ____________________\n\nИЗВЕЩЕНИЕ ОБ ОПЛАТЕ\nПолучатель: ${data.company}\nЛС ${data.account}\nК оплате: ${money(data.remaining)}\nРеквизиты и QR-код отключены в демо.\n\nОТМЕТКА О ВРУЧЕНИИ\nДокумент на сумму ${money(data.remaining)} получен.\nДата: ____________________\nФИО получателя: ____________________\nПодпись: ____________________\nЗаполняется только при фактическом вручении.\n\nСтруктура адаптирована по предоставленному образцу второго листа квитанции. Реквизиты, адрес и подпись из оригинала не используются.\n${draft.missing.length?'Не хватает данных: '+draft.missing.join('; '):'Суммы подставлены из выбранного дела.'}`;
  }
  if(['notice','demand'].includes(kind))draft.text+=`\n\nРасчёт суммы (приложение):\n${draft.data.calculation}`;
  return draft;
}
function buildDraftDocument(r,kind){
  const c=currentCase(r),def=DOCUMENTS[kind];
  if(!c||!def||!def.stages.includes(c.stage))throw Error('Выберите документ текущего этапа');
  const frozen=['Приказ','Иск','Приставы','Завершено'].includes(c.stage)&&c.claim;
  const missing=[];
  if(!r.owners?.length)missing.push('ФИО и доли собственников');
  if(!r.charges?.length)missing.push('помесячный расчёт из биллинга');
  if(r.caseBalanceConflict)missing.push('подтверждённые остатки по делам');
  if(r.unallocated>0)missing.push('разнесение поступившей оплаты');
  if(days(r.asOf)>7)missing.push('свежий реестр задолженности');
  if(r.disputed||r.reviewTask?.status==='open')missing.push('результат проверки задолженности');
  if(!c.period?.trim())missing.push('период задолженности');
  if(['orderApplication','claim','enforcementApplication'].includes(kind)&&!r.billing)missing.push('реквизиты адресата и утверждённый юридический текст');
  const debtors=currentCase(r)?.ownerBalances||r.owners; const people=debtors?.length?debtors.map(o=>`${o.name}, доля ${o.share}%`).join('; '):'[ФИО и доли не загружены]';
  const lines=r.billing?(frozen&&c.claim.calculation?c.claim.calculation:billingLines(r,c.id)):null;
  const calculation=lines?lines.map(x=>`${x.month} · ${x.service} · ${r.billing.area} м² · ${x.formula}\nНачислено ${money(x.charged)}; оплачено ${money(x.paid)}; долг ${money(principalDue(x))}; пени ${money(penaltyDue(x))}`).join('\n'):r.charges?.length?r.charges.map(x=>`${x.month}: площадь ${x.area} м²; ${x.formula}; начислено ${money(x.charges)}; оплачено ${money(x.payments)}; остаток ${money(x.closing)}`).join('\n'):'[Помесячный расчёт не загружен]';
  const data={company:r.company,address:`${r.building}, кв. ${r.flat}`,account:r.account,people,caseId:c.id,period:frozen?c.claim.period:c.period,amount:frozen?c.claim.amount:amount(c.remaining),remaining:amount(c.remaining),principal:c.remaining.principal,penalty:c.remaining.penalty,fee:c.remaining.fee,date:TODAY,calculation};
  const purpose={schedule:'График и исполнение согласованных платежей.',paymentStatement:'Учтённые поступления относятся только к выбранному делу.',closure:'Основание завершения и итоговый остаток выбранного дела.',notice:'Просим проверить расчёт и погасить подтверждённую задолженность.',demand:'Претензионные требования, срок ответа и основания заполняет юрист.',agreement:'График, условия и подписи сторон заполняются и проверяются юристом.',orderApplication:'Содержание заявления и приложения проверяет юрист перед подачей.',claim:'Обстоятельства, основания и требования заполняет юрист.',enforcementApplication:'Адресат (ФССП или банк), реквизиты документа и требования заполняет юрист.',courtInventory:'Состав приложений проверяется по документам выбранного дела.',calculation:'Данные расчёта поступают из биллинга; остатки отдельных дел учитываются отдельно.'}[kind];
  const demoPurpose=r.billing?{notice:`Просим погасить задолженность ${money(data.remaining)}. Учебная дата контроля: 05.11.2026. При несогласии направьте обращение в управляющую компанию.`,demand:`Претензия: требование об оплате ${money(data.remaining)} за ${data.period}. Основание: учебный договор управления домом, расчёт и сведения об оплатах. Учебная дата контроля: 05.11.2026.`,agreement:`Стороны: ${r.company} и ${people}. Учебный предмет соглашения: погашение ${money(data.remaining)} за ${data.period}. График приведён ниже; подписание в демо не выполняется.`,orderApplication:`Адресат: Учебный судебный участок № 1. Заявитель: ${r.company}. Должник: ${people}. Учебное требование: выдать приказ о взыскании ${money(data.amount)} за ${data.period}. Основание: договор управления домом, начисления и неоплаченные услуги. Приложения: расчёт задолженности, договор дома, сведения о собственниках, подтверждающие документы.`,claim:`Адресат: Учебный районный суд. Истец: ${r.company}. Ответчик: ${people}. Учебное требование: взыскать ${money(data.amount)} за ${data.period}. Основание: неисполнение обязательств по учебному договору управления; расчёт приведён ниже. Приложения: расчёт, договор дома, сведения о собственниках и документы досудебной работы.`,enforcementApplication:`Адресат: Учебный банк. Взыскатель: ${r.company}. Документ: ${c.legal?.number||'учебный исполнительный документ'}. Учебное требование: исполнить документ в пределах непогашенной суммы ${money(data.remaining)}. Основание: документ выбранного дела. Банковские реквизиты в демо не являются действительными.`,courtInventory:'Учебный состав пакета: расчёт задолженности по делу, общий договор управления домом, документы дела. Файлы приложены в ZIP-пакете.'}[kind]:null;
  return {kind,title:def.title,data,missing,text:`ДЕМОНСТРАЦИОННЫЙ ЧЕРНОВИК. НЕ ДЛЯ ОТПРАВКИ И ПОДАЧИ.\n${def.title}\nДата: ${TODAY}\nОт: ${r.company}\nКому: ${people}\nАдрес: ${data.address}\nЛС: ${r.account} · дело ${c.id}\nПериод требования: ${data.period}\n${frozen?'Зафиксированное требование':'Сумма требования'}: ${money(data.amount)}\nТекущий остаток дела: ${money(data.remaining)}\nВ остатке: долг ${money(data.principal)}; пени ${money(data.penalty)}; госпошлина ${money(data.fee)}\n\n${demoPurpose||purpose}\n${['agreement','schedule'].includes(kind)&&c.schedule.length?'График: '+c.schedule.map(x=>`${x.date}: ${money(x.amount)}`).join('; '):''}\n\n${lines?(frozen?'Расчёт на дату фиксации требования':'Расчёт по выбранному делу'):'Расчёт по ЛС (не заменяет расчёт за период отдельного дела)'}:\n${calculation}\n\nНедостающие сведения: ${missing.join('; ')||'проверить реквизиты и условия перед использованием'}.`};
}
export function saveDraft(r,draft,text,id){
  const c=currentCase(r);if(!c||!text.trim())throw Error('Укажите текст документа');
  c.drafts ||= [];
  const old=id&&c.drafts.find(d=>d.id===id);
  if(id&&!old)throw Error('Документ не найден');
  if(old?.archived)throw Error('Сначала восстановите документ');
  if(old?.status==='sent')throw Error('Отправленный экземпляр сохраняется неизменным. Создайте новый черновик.');
  const doc={...draft,id:old?.id||crypto.randomUUID(),text:text.trim(),status:'draft',created:old?.created||TODAY,updated:TODAY,archived:false};
  if(old)Object.assign(old,doc);else c.drafts.push(doc);
  return doc;
}
export function documentStatus(r,id,status){
  const c=currentCase(r),d=c?.drafts?.find(d=>d.id===id);if(!d||d.archived)throw Error('Документ недоступен');
  if(!['draft','prepared','sent'].includes(status))throw Error('Неизвестный статус');
  if(status==='prepared'&&d.missing.length)throw Error(`Не заполнено: ${d.missing.join('; ')}`);
  if(status==='sent'&&d.status!=='prepared')throw Error('Сначала проверьте и подготовьте документ');
  if(d.status==='sent')throw Error('Отправленный экземпляр не изменяется');
  d.status=status;d.updated=TODAY;
}
export function documentText(r,id){const d=currentCase(r)?.drafts?.find(d=>d.id===id);if(!d||d.archived)throw Error('Документ не найден');return d.text;}
export function accountingContext(r){return (r.cases||[]).filter(c=>c.stage!=='Завершено').map(c=>({id:c.id,stage:c.stage,number:c.legal?.number||'номер не указан',period:c.period,remaining:amount(c.remaining),fee:c.remaining.fee}));}

export function prepareDraftBatch(rows,keys,kind){
  return [...new Set(keys)].map(key=>{
    const [rowId,caseId]=JSON.parse(key),r=rows.find(r=>r.id===rowId),c=r?.cases.find(c=>c.id===caseId);
    if(!c)throw Error('Дело из выборки больше не существует');
    if(['agreement','schedule'].includes(kind)&&!c.agreement&&!c.agreementProposal)throw Error(`Дело ${c.id}: сначала согласуйте условия и график`);
    const draft=draftDocument({...r,caseId,selectedCaseId:caseId},kind);
    return {rowId,caseId,draft};
  });
}
export function saveDraftBatch(rows,batch){
  // Validate every item before changing any case; repeated preparation is idempotent.
  const items=batch.map(x=>{
    const r=rows.find(r=>r.id===x.rowId),c=r?.cases.find(c=>c.id===x.caseId);
    if(!c||!availableTemplates(c).some(([kind])=>kind===x.draft.kind))throw Error('Этап дела изменился. Повторите подготовку.');
    const fresh=draftDocument({...r,caseId:c.id,selectedCaseId:c.id},x.draft.kind);
    if(JSON.stringify(fresh.data)!==JSON.stringify(x.draft.data))throw Error('Данные изменились. Повторите подготовку.');
    return {r,c,draft:x.draft};
  });
  let added=0;
  for(const {r,c,draft} of items){
    if(c.drafts?.some(d=>!d.archived&&d.kind===draft.kind&&JSON.stringify(d.data)===JSON.stringify(draft.data)))continue;
    saveDraft({...r,caseId:c.id,selectedCaseId:c.id},draft,draft.text);added++;
  }
  return added;
}
