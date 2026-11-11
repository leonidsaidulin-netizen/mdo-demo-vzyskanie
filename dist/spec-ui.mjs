import {TODAY,money,total} from './model.mjs';
import {currentCase,unassigned,amount} from './cases.mjs';
import {noCaseAssessment,confirmRepeat,caseWork,saveReminder,closeReminder,moveCases,MANUAL_STAGES,outsidePeriod} from './spec-logic.mjs';
import {esc} from './workspace-views.mjs';
import {audit} from './operations.mjs';

export function installSpecUI({getState,getRole,save,render,modal,close,toast}){
  const $=s=>document.querySelector(s);let pending=null,choices=new Set(),workFilter='';
  const btn=(action,label,r,c='')=>`<button class="button secondary small" data-debt-spec="${action}" data-row="${esc(r)}" data-case="${esc(c)}">${label}</button>`;
  function mutate(fn){const s=getState(),before=structuredClone(s.rows);try{fn(s.rows);save();}catch(e){s.rows=before;throw e;}}
  function dialog(kind,rid,cid){
    const r=getState().rows.find(x=>x.id===rid),c=r?.cases.find(x=>x.id===cid);pending={kind,rid,cid,snapshot:JSON.stringify(getState().rows)};
    let title='',body='';
    if(kind==='repeat'){title='Сверить. Повторный долг на ЛС';body=`<p>Новый долг: ${money(amount(unassigned(r)))} за ${esc(outsidePeriod(r))}.</p><h3>Ранее открытые дела</h3>${r.cases.map(c=>`<p>${esc(c.id)} · ${esc(c.period)} · ${esc(c.stage)} · остаток ${money(amount(c.remaining))}</p>`).join('')}<label><input id="repeatChecked" type="checkbox"> Подтверждаю: это отдельный долг, он не включён в прежние дела</label>`;}
    if(kind==='reminder'){title='Напоминание по делу';body=`<p>${esc(c.id)} · ${esc(c.stage)}</p><label>Что сделать<textarea id="specText" required></textarea></label><label>Когда<input id="specDue" type="date" min="${TODAY}" value="${TODAY}"></label>`;}
    if(kind==='status'){title='Что зафиксировано по делу';body=`<p>${esc(c.id)} · ${esc(c.stage)}</p><label>Статус работы<input id="specStatus" value="${esc(c.manualStatus?.label||'')}" placeholder="Например: условия переданы на согласование"></label><label>Комментарий<textarea id="specText">${esc(c.manualStatus?.note||'')}</textarea></label>`;}
    if(kind==='read'){title='Подтвердить прочтение уведомления';body='<p>Только тестовый результат. Отметьте конкретную отправку; сама отправка не означает прочтения.</p><select id="specEvent">'+r.events.filter(e=>e.caseId===cid&&['app','email','max'].includes(e.action)&&!e.readAt&&['Отправлено (демо)','Доставлено (демо)'].includes(e.status)).map(e=>`<option value="${esc(e.id)}">${esc(e.label)} · ${esc(e.at)}</option>`).join('')+'</select>';}
    if(kind==='move'){
      const targets=cid?[[rid,cid]]:[...choices].map(s=>JSON.parse(s));pending.targets=targets;title='Перенести дела на другую стадию';
      body=`<p>Выбрано дел: ${targets.length}. Документы, оплаты и история сохраняются. Переход не означает подачу в суд или отправку документов.</p><label>Стадия<select id="specStage">${MANUAL_STAGES.map(s=>`<option>${s}</option>`).join('')}</select></label><label>Основание перехода<textarea id="specText" required></textarea></label>`;
    }
    modal(title,'Подтверждение действия',`${body}<div id="specError" role="alert"></div>`,btn('confirm','Подтвердить',rid,cid));
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-debt-spec]');if(!b)return;e.preventDefault();
    try{if(getRole()!=='lawyer')throw Error('Действие доступно юристу');const action=b.dataset.debtSpec,rid=b.dataset.row,cid=b.dataset.case;
      if(['repeat','reminder','status','move','read'].includes(action)){dialog(action,rid,cid);return;}
      if(action==='done'){mutate(rows=>closeReminder(rows.find(r=>r.id===rid),cid,b.dataset.reminder));close();render();return;}
      if(action==='confirm'){
        if(!pending||pending.snapshot!==JSON.stringify(getState().rows))throw Error('Данные изменились. Откройте действие заново.');
        const p=pending;
        mutate(rows=>{const r=rows.find(r=>r.id===p.rid),c=r?.cases.find(c=>c.id===p.cid);
          if(p.kind==='repeat'){if(!$('#repeatChecked').checked)throw Error('Подтвердите проверку периода');confirmRepeat(r);}
          if(p.kind==='reminder')saveReminder(r,p.cid,$('#specText').value,$('#specDue').value);
          if(p.kind==='read'){const event=r.events.find(e=>e.id===$('#specEvent').value&&e.caseId===p.cid);if(!event)throw Error('Нет отправки, для которой можно подтвердить прочтение');event.readAt=TODAY;event.readSource='Учебное подтверждение';audit(r,'Прочтение уведомления (тест)',event.id);}
          if(p.kind==='status'){const label=$('#specStatus').value.trim(),note=$('#specText').value.trim();if(!label||!note)throw Error('Укажите статус и пояснение');c.statusHistory||=[];if(c.manualStatus)c.statusHistory.push(c.manualStatus);c.manualStatus={label,note,at:TODAY};audit(r,'Статус работы по делу',`${c.id}: ${label}. ${note}`);}
          if(p.kind==='move'){const next=moveCases(rows,p.targets,$('#specStage').value,$('#specText').value);rows.splice(0,rows.length,...next);}
        });pending=null;choices.clear();close();render();toast('Сохранено');
      }
    }catch(err){if($('#specError'))$('#specError').textContent=err.message;else toast(err.message);}
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='specWorkFilter'){workFilter=e.target.value;render();return;}
    if(e.target.id==='specSelectAll'){for(const box of document.querySelectorAll('[data-spec-choice]:not(:disabled)'))if(!box.closest('tr').hidden){box.checked=e.target.checked;box.checked?choices.add(box.dataset.specChoice):choices.delete(box.dataset.specChoice);}}
    else if(e.target.dataset.specChoice){const key=e.target.dataset.specChoice;e.target.checked?choices.add(key):choices.delete(key);}
    const host=$('#specBulk');if(host)host.innerHTML=choices.size?`<strong>Выбрано дел: ${choices.size}</strong> ${btn('move','Перенести на стадию','')}`:'';
  });
  function enhance(view,filters){
    const s=getState();
    if(view==='registry'&&filters.stage==='Без дела'){
      $('#content [data-filter="queue"]')?.remove();
      for(const tr of $('#content table')?.tBodies[0].rows||[]){const id=tr.querySelector('[data-open]')?.dataset.open,r=s.rows.find(x=>x.id===id);if(!r)continue;const a=noCaseAssessment(r),b=tr.cells[4].querySelector('button');b.innerHTML=`${esc(a?.label||'—')}<small>${esc(a?.detail||'Долга вне дел нет')}</small>`;if(r.caseBalanceConflict)tr.cells[2].innerHTML=`Сумма вне дел не подтверждена<small>Всего по ЛС: ${money(total(r))}</small>`;}
      const shown=[...$('#content table').tBodies[0].rows].map(tr=>s.rows.find(r=>r.id===tr.querySelector('[data-open]').dataset.open)),uncertain=shown.filter(r=>r.caseBalanceConflict).length;
      if(uncertain)$('#content .table-end span').textContent=`${shown.length} ЛС · подтверждённый долг вне дел ${money(shown.filter(r=>!r.caseBalanceConflict).reduce((n,r)=>n+amount(unassigned(r)),0))} · сумма уточняется по ${uncertain} ЛС`;
    }
    if(view!=='cases')return;
    $('#content [data-filter="queue"]')?.remove();
    const table=$('#content table');if(!table)return;
    table.classList.add('spec-case-table');
    $('#content .filters').insertAdjacentHTML('beforeend',`<select id="specWorkFilter" aria-label="Текущая работа">${['','Сегодня','Просрочено','Запланировано','Следующий шаг не назначен','Завершено'].map(v=>`<option value="${esc(v)}" ${v===workFilter?'selected':''}>${v||'Любая текущая работа'}</option>`).join('')}</select>`);
    choices.clear();$('#content .table-frame').insertAdjacentHTML('beforebegin','<div class="selection-bar" id="specBulk"></div>');
    table.tHead.rows[0].insertAdjacentHTML('afterbegin','<th><input id="specSelectAll" type="checkbox" aria-label="Выбрать все дела стадии"></th>');table.tHead.rows[0].insertAdjacentHTML('beforeend','<th>Текущая работа</th>');
    for(const tr of table.tBodies[0].rows){const link=tr.querySelector('.debtor-link'),r=s.rows.find(x=>x.id===link.dataset.open),c=r.cases.find(x=>x.id===link.dataset.caseId),w=caseWork(c);
      tr.insertAdjacentHTML('afterbegin',`<td data-label="Выбор"><input type="checkbox" data-spec-choice="${esc(JSON.stringify([r.id,c.id]))}" aria-label="Выбрать дело ${esc(c.id)}" ${c.stage==='Завершено'?'disabled':''}></td>`);
      link.insertAdjacentHTML('beforeend',`<small>${esc(c.ownerBalances?.length?c.ownerBalances.map(o=>`${o.name} · ${o.share}%`).join('; '):'Состав собственников — в карточке ЛС')}</small>`);
      const stateCell=tr.cells[4];if(c.manualStatus)stateCell.insertAdjacentHTML('afterbegin',`<strong>${esc(c.manualStatus.label)}</strong><small>${esc(c.manualStatus.note)}</small>`);
      if(c.stage!=='Завершено')stateCell.insertAdjacentHTML('beforeend',btn('status','Зафиксировать статус',r.id,c.id));
      const reads=(r.events||[]).filter(e=>e.caseId===c.id&&e.readAt);if(filters.stage==='Уведомление')tr.insertAdjacentHTML('beforeend',`<td data-label="Прочтение">${reads.length?'Прочитано: '+reads.length:'Нет подтверждения прочтения'}</td>`);
      if(filters.stage==='Уведомление'&&!table.querySelector('[data-read-header]'))table.tHead.rows[0].lastElementChild.insertAdjacentHTML('beforebegin','<th data-read-header>Прочтение</th>');
      const next=tr.querySelector('[data-case-work]:not([data-case-work="documents"]):not([data-case-work="history"])');if(w.due&&next?.parentElement.querySelector('small'))next.parentElement.querySelector('small').textContent='Контроль: '+w.due;
      tr.insertAdjacentHTML('beforeend',`<td data-label="Текущая работа"><strong class="${w.label==='Просрочено'?'data-warning':''}">${esc(w.label)}</strong><small>${esc(w.due||'')}</small>${w.reminder?`<p>${esc(w.reminder.text)}</p>`:''}${c.stage!=='Завершено'?btn('reminder','Создать напоминание',r.id,c.id)+btn('move','Перенести дело',r.id,c.id):''}</td>`);
      tr.hidden=!!workFilter&&w.label!==workFilter;
    }
    const count=[...table.tBodies[0].rows].filter(r=>!r.hidden).length;
    $('#content .filter-summary span').textContent=`Показано дел: ${count} из ${table.tBodies[0].rows.length}`;
    if(!count&&!$('#content .empty'))table.insertAdjacentHTML('afterend','<p class="empty">Нет дел по выбранному состоянию работы</p>');
  }
  function drawer(r,tab){if(tab!=='overview'||getRole()!=='lawyer')return;const c=currentCase(r);if(!c)return;
    const host=$('#overlay .drawer-body');if(!host)return;
    host.insertAdjacentHTML('beforeend',`<section class="case-section"><h3>Напоминания по этому делу</h3>${(c.reminders||[]).map(t=>`<div class="source-row"><div><strong>${esc(t.text)}</strong><small>${esc(t.due)} · ${esc(t.status==='done'?'Выполнено':t.due<TODAY?'Просрочено':'Запланировано')}</small></div>${t.status==='open'?`<button class="button secondary small" data-debt-spec="done" data-row="${r.id}" data-case="${c.id}" data-reminder="${t.id}">Выполнено</button>`:''}</div>`).join('')||'<p>Напоминания не созданы</p>'}${c.stage!=='Завершено'?btn('reminder','Создать напоминание',r.id,c.id)+btn('move','Перенести дело',r.id,c.id):''}</section>`);
    if(c.stage==='Уведомление')host.insertAdjacentHTML('beforeend',btn('read','Отметить прочтение в тестовом сценарии',r.id,c.id));
  }
  return {enhance,drawer};
}
