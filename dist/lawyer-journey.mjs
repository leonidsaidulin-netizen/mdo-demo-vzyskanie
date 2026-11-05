import {TODAY,changeStage} from './model.mjs';
import {currentCase,amount} from './cases.mjs';
import {audit,dateValid,saveLegal,saveAgreement} from './operations.mjs';
import {ensureDocument,stageDocumentEntries,reviewReasons} from './documents.mjs';

export const LEGAL_RESULTS={
  'Приказ':{'Подготовка':'Подготовить заявление и приложения','Подано':'Зафиксировать ответ суда','Возвращено':'Исправить пакет и подать повторно','Получен документ':'Приложить судебный приказ','Отменён приказ':'Решить вопрос о подаче иска','Отказано':'Зафиксировать решение юриста'},
  'Иск':{'Подготовка':'Подготовить иск и приложения','Подано':'Зафиксировать ответ суда','Принят к рассмотрению':'Зафиксировать дату заседания / результат','Назначено заседание':'Зафиксировать результат заседания','Оставлено без движения':'Устранить замечания суда','Возвращено':'Исправить пакет и подать повторно','Получено решение':'Получить исполнительный документ','Отказано':'Зафиксировать решение юриста'},
  'Приставы':{'Передано на исполнение':'Проверить принятие документа','Исполнение':'Проверить поступления по делу','Возвращён документ':'Уточнить причину и повторно предъявить','Ожидаем результат':'Проверить ответ банка / ФССП'},
  'Суд: уточнить':{'Подготовка':'Уточнить вид производства по документам'}
};
export const STAGE_TASKS={
 'Уведомление':'Отправьте уведомление, затем зафиксируйте ответ: оплатит, просит рассрочку, оспаривает долг или отказался.',
 'Соглашение':'Согласуйте график. При согласии сформируйте соглашение и получите подпись; при отказе выберите приказ или иск. После подписания контролируйте реальные поступления.',
 'Приказ':'Подготовьте пакет и зафиксируйте подачу. Полученный приказ можно предъявить к исполнению; отмена ведёт к решению о подаче иска, возврат — к исправлению пакета.',
 'Иск':'Подготовьте иск, зафиксируйте подачу и ответ суда. После положительного решения приложите исполнительный документ; при замечаниях исправьте пакет.',
 'Приставы':'После предъявления зафиксируйте принятие либо возврат. Контролируйте поступления; завершайте дело только после подтверждённого погашения.',
 'Завершено':'Долг по этому делу погашен. Отчёт о завершении, оплаты и документы остаются в истории.',
 'Суд: уточнить':'По документам определите вид производства: приказ или иск. Затем продолжайте соответствующий путь.'
};
export const PACKAGE_KINDS={'Соглашение':['agreement','schedule'],'Приказ':['orderApplication','calculation','courtInventory'],'Иск':['claim','calculation','courtInventory'],'Завершено':['closure','paymentStatement']};
export function prepareCasePackage(r){
 const c=currentCase(r),kinds=PACKAGE_KINDS[c?.stage];
 if(!kinds)throw Error('На этом этапе нет пакета для подготовки');
 if(c.stage==='Соглашение'&&!c.agreement&&!c.agreementProposal)throw Error('Сначала согласуйте условия и график');
 const copy=structuredClone(r),docs=kinds.map(k=>ensureDocument(copy,k));
 if(docs.some(d=>d.missing.length))throw Error('Нужно дополнить: '+[...new Set(docs.flatMap(d=>d.missing))].join('; '));
 audit(copy,'Пакет документов подготовлен',docs.map(d=>d.title).join('; '));Object.assign(r,copy);return docs;
}
export function packageReady(r){
 const c=currentCase(r),kinds=PACKAGE_KINDS[c?.stage]||[];
 const docs=stageDocumentEntries(r);
 return kinds.length>0&&kinds.every(k=>docs.some(d=>d.kind===k&&d.id&&!d.missing.length));
}
export function demoReceivedDocument(r,kind,label){
 const c=currentCase(r);if(!c)throw Error('Выберите дело');
 if(c.documents.some(d=>!d.archived&&d.kind===kind&&d.synthetic))return;
 const text=`УЧЕБНЫЙ ПРИМЕР. Не является реальным документом или подписью.\n${label}\nДело ${c.id}. ЛС ${r.account}. Дата ${TODAY}.`;
 c.documents.push({id:crypto.randomUUID(),kind,name:`Демо - ${label}.txt`,synthetic:true,size:new TextEncoder().encode(text).length,data:'data:text/plain;charset=utf-8,'+encodeURIComponent(text)});
}
export function signDemoAgreement(r){
 const copy=structuredClone(r),c=currentCase(copy),terms=c?.agreementProposal;
 if(!terms||c.agreement)throw Error('Сначала подготовьте проект соглашения');
 if(!packageReady(copy))throw Error('Сначала сформируйте соглашение и график');
 if(reviewReasons(copy).length)throw Error('Сначала уточните данные долга');
 demoReceivedDocument(copy,'agreement','Подписанное соглашение');
 saveAgreement(copy,terms.number,terms.date,c.schedule);Object.assign(r,copy);
}
export function recordLegalResult(r,input,{simulateDocument=false}={}){
 const c=currentCase(r),statuses=LEGAL_RESULTS[c?.stage];
 if(!statuses||!Object.hasOwn(statuses,input.status))throw Error('Результат не относится к этому этапу');
 if(input.status==='Подано'&&(!packageReady(r)||c.packageRevisionNeeded))throw Error('Сначала сформируйте актуальный пакет документов');
 if(!input.note?.trim())throw Error('Укажите результат или замечания');
 if(reviewReasons(r).length)throw Error('Сначала уточните данные долга');
 const copy=structuredClone(r),cc=currentCase(copy);
 cc.legalHistory ||= [];if(cc.legal?.status)cc.legalHistory.push({...cc.legal,ended:TODAY});
 saveLegal(copy,{...input,next:statuses[input.status]});
 if(simulateDocument){
   const kind=cc.stage==='Приказ'&&input.status==='Получен документ'?'order':cc.stage==='Иск'&&input.status==='Получено решение'?'decision':null;
   if(!kind)throw Error('Для этого результата не предусмотрен полученный документ');
   demoReceivedDocument(copy,kind,kind==='order'?'Судебный приказ':'Решение суда');
 }
 if(['Возвращено','Оставлено без движения'].includes(input.status))cc.packageRevisionNeeded=true;
 audit(copy,'Результат юридической работы',input.note.trim());Object.assign(r,copy);
}
export function reworkCasePackage(r,note){
 if(!note?.trim())throw Error('Укажите, какие замечания устранены');
 const copy=structuredClone(r),c=currentCase(copy);
 if(!c?.packageRevisionNeeded)throw Error('Нет замечаний к пакету');
 prepareCasePackage(copy);const updated=currentCase(copy);
 updated.packageRevisionNeeded=false;updated.legalHistory||=[];updated.legalHistory.push({...updated.legal,ended:TODAY});
 updated.legal={...updated.legal,status:'Подготовка',note:note.trim()};
 audit(copy,'Замечания к пакету устранены',note.trim());Object.assign(r,copy);
}
export const CONTACT_RESULTS={waiting:'Ответа пока нет',promise:'Обещает оплатить',agreement:'Обсуждаем рассрочку',order:'Не договорились: готовить заявление на приказ',claim:'Не договорились: готовить иск',dispute:'Оспаривает сумму долга'};
export function recordContactResult(r,result,note,due){
  const c=currentCase(r);
  if(!c||!['Уведомление','Соглашение'].includes(c.stage)||!CONTACT_RESULTS[result])throw Error('Выберите результат досудебной работы');
  if(!note?.trim()||!dateValid(due)||due<TODAY)throw Error('Укажите содержание разговора и дату контроля');
  if(['order','claim','agreement'].includes(result)){
    const stage={order:'Приказ',claim:'Иск',agreement:'Соглашение'}[result];
    if(stage!==c.stage)transitionCase(r,stage,note);
  }
  c.contactResult={result,label:CONTACT_RESULTS[result],note:note.trim(),at:TODAY,due};
  c.communicationNextDate=due;
  if(result==='dispute')r.disputed=true;
  audit(r,CONTACT_RESULTS[result],note.trim());
}
export function transitionOptions(c){
  if(!c||c.stage==='Завершено')return [];
  if(c.balanceConfirmed&&amount(c.remaining)===0)return ['Завершено'];
  return ({'Уведомление':['Соглашение','Приказ','Иск'],'Соглашение':['Уведомление','Приказ','Иск'],'Приказ':['Иск'],'Иск':[],'Приставы':[],'Суд: уточнить':['Приказ','Иск']})[c.stage]||[];
}
export function transitionCase(r,stage,reason){
  const c=currentCase(r);
  if(!transitionOptions(c).includes(stage))throw Error('Этот переход недоступен для выбранного дела');
  if(!reason?.trim())throw Error('Укажите результат и основание перехода');
  changeStage(r,stage,reason);
  // Result of an old court stage must not become the result of the new one.
  c.legalHistory ||= [];
  if(c.legal?.status)c.legalHistory.push({...c.legal,ended:TODAY});
  c.legal={};
  c.packageRevisionNeeded=false;
  audit(r,'Результат этапа',reason.trim());
}
export function saveAgreementProposal(r,number,date,schedule){
  const c=currentCase(r);
  if(!c||!['Уведомление','Соглашение'].includes(c.stage))throw Error('Предложение доступно на досудебном этапе');
  if(c.agreement||c.schedule.some(x=>x.paid))throw Error('Подписанный график нельзя заменить предложением');
  if(!number.trim()||!dateValid(date)||date>TODAY)throw Error('Укажите номер и дату проекта');
  if(!schedule.length||schedule.some(x=>!dateValid(x.date)||x.date<date||!Number.isSafeInteger(x.amount)||x.amount<=0))throw Error('Проверьте даты и суммы платежей');
  if(new Set(schedule.map(x=>x.date)).size!==schedule.length)throw Error('Объедините платежи на одну дату');
  if(schedule.reduce((s,x)=>s+x.amount,0)!==amount(c.remaining))throw Error('График должен покрывать остаток выбранного дела');
  c.agreementProposal={number:number.trim(),date};
  c.schedule=schedule.map(x=>({...x})).sort((a,b)=>a.date.localeCompare(b.date));
  if(c.stage!=='Соглашение')changeStage(r,'Соглашение');
  audit(r,'Подготовлено предложение рассрочки','График не подписан; оплаты не подтверждены');
}
export function caseNotices(r,c){
  return (r.events||[]).filter(e=>e.caseId===c.id&&['app','email','max','receipt','robot','notice'].includes(e.action)).sort((a,b)=>b.at.localeCompare(a.at));
}
