/* Dispatcher cancellation and archive controls for synthetic demo.
   Never hard-delete source events, loaded cargo, audited records or real payments.
   No server sync in this public demo: same-device browser only.
*/
(function(){
const oldOrders=orders, oldPlan=plan, oldOpen=open, oldSubmit=submit;
const eventStamp=()=>new Date().toISOString();
const safe=esc;
const activeOrder=o=>!o.cancelledAt&&!o.archivedAt;
const activePlan=p=>!p.archivedAt;
function liveCargo(o){
 return !!o.loadedAt&&o.status!=='done'&&!o.archivedAt&&!o.cancelledAt;
}
function orderForDeletion(id){return db.orders.find(o=>o.id===id)}
function planForDeletion(id){return db.plan.find(p=>p.id===id)}
function reasonCategory(){const v=val('removalReason');return ['conditions','cancelled','wrong','pause','other'].includes(v)?v:'other'}
function reasonText(){return ({conditions:'Изменились условия',cancelled:'Сделка не состоялась',wrong:'Ошибка при оформлении',pause:'Приёмка остановлена',other:'Другая причина'})[reasonCategory()]+(val('removalNote')?' · '+val('removalNote'):'')}
function setDeletionModalButtons(blocked){
 const btn=el('modal')?.querySelector('#formModal button[type="submit"]');
 if(btn){btn.textContent='Подтвердить удаление';if(blocked&&btn.style)btn.style.display='none'}
}
function reasons(){
 return select('removalReason','Причина',[['conditions','Изменились условия'],['cancelled','Сделка не состоялась'],['wrong','Ошибка при оформлении'],['pause','Приёмка остановлена'],['other','Другая причина']])+
 textArea('removalNote','Комментарий (необязательно)')+
 '<label class="check"><input type="checkbox" id="deletionChecked" required><span>Подтверждаю отмену / скрытие из рабочих списков. История остаётся в архиве.</span></label>';
}
function removeButtons(o){
 if(!activeOrder(o))return '';
 return '<button class="btn warn" data-act="removeOrder" data-id="'+safe(o.id)+'">🗑 Удалить наряд</button>';
}
const oldCard=cardOrder;
cardOrder=function(o){
 let body=oldCard(o);
 if(!activeOrder(o))return body;
 return body.replace(/<\/div><\/div>$/,removeButtons(o)+'</div></div>');
};
orders=function(){
 const all=db.orders;
 db.orders=all.filter(activeOrder);
 let result='';
 try{result=oldOrders()}finally{db.orders=all}
 // Add controls in a dedicated actions section for each active job without
 // touching the original historical card structures.
 const active=all.filter(activeOrder);
 const delPanel=active.length?'<div class="card"><h2>Удалить или отозвать наряд</h2><p class="muted">Удаление отзовёт ещё не загруженный наряд у водителя и снимет резерв из плана. История остаётся для проверки.</p>'+
 active.map(o=>'<div class="row wrap" style="padding:10px 0;border-top:1px solid #e9eef4"><div><b>'+safe(o.id)+' · '+safe(driverName(o.driverId))+'</b><div class="small">'+safe(o.cargo)+' · '+safe(o.from)+'</div></div>'+removeButtons(o)+'</div>').join('')+'</div>':'';
 const archive=all.filter(o=>o.cancelledAt||o.archivedAt);
 const archived='<details class="card"><summary style="cursor:pointer;font-weight:800">Архив отменённых / скрытых нарядов ('+archive.length+')</summary>'+
 (archive.length?archive.slice().reverse().map(o=>'<div class="soft"><b>'+safe(o.id)+'</b> · '+safe(driverName(o.driverId))+'<div class="small">'+safe(o.archivedAt?'Завершённая ходка скрыта из списка':'Наряд отозван')+' · '+safe(o.cancelReason||o.archiveReason||'')+'</div><div class="small">План: '+safe(db.plan.find(p=>p.id===o.planId)?.supplier||'—')+'</div></div>').join(''):'<div class="empty">Пока пусто</div>')+'</details>';
 return result+archived;
};
plan=function(){
 const all=db.plan;db.plan=all.filter(activePlan);
 let result='';
 try{result=oldPlan()}finally{db.plan=all}
 const active=all.filter(activePlan);
 const panel=active.length?'<div class="card"><h2>Управление закупками</h2><p class="muted">«Удалить план» убирает закупку из активного списка и отзывает незагруженные наряды. Загруженный груз сначала нужно завершить и проверить.</p>'+
 active.map(p=>'<div class="row wrap" style="padding:10px 0;border-top:1px solid #e9eef4"><div><b>'+safe(p.supplier)+' · '+safe(p.commodity)+'</b><div class="small">'+safe(p.purchasedTonnes)+' т · '+safe(p.id)+'</div></div><div class="actions" style="flex:0 0 auto">'+
 '<button class="btn secondary" data-act="togglePlan" data-id="'+safe(p.id)+'">'+(p.stoppedAt?'▶ Возобновить выдачу':'⏸ Приостановить')+'</button>'+
 '<button class="btn warn" data-act="removePlan" data-id="'+safe(p.id)+'">🗑 Удалить план</button></div></div>').join('')+'</div>':'';
 const archive=all.filter(p=>p.archivedAt);
 const archived='<details class="card"><summary style="cursor:pointer;font-weight:800">Архив удалённых планов ('+archive.length+')</summary>'+
 (archive.length?archive.slice().reverse().map(p=>{
 const historical=db.orders.filter(o=>o.planId===p.id);
 return '<div class="soft"><b>'+safe(p.supplier)+' · '+safe(p.commodity)+'</b><div class="small">Куплено '+safe(p.purchasedTonnes)+' т · '+historical.length+' ходок · '+safe(p.archiveReason||'')+'</div>'+
 '<div class="small">Факт выгрузок и реестр сохраняются в истории.</div></div>';
 }).join(''):'<div class="empty">Пока пусто</div>')+'</details>';
 return result+archived;
};
function cancelOrder(id,reason,fromPlan=false){
 const o=orderForDeletion(id);
 if(!o||!activeOrder(o))throw Error('Наряд уже отменён или отсутствует');
 if(liveCargo(o)||o.status==='review')throw Error('Машина уже загружена. Нельзя скрыть груз без урегулирования выгрузки/возврата. Завершите перевозку или оформите отдельное решение по грузу.');
 if(o.status==='done'){
  o.archivedAt=eventStamp();o.archiveReason=reason;
  audit('Завершённый наряд скрыт из рабочих списков',o.id,reason);
  return;
 }
 if(o.loadedAt)throw Error('Есть подтверждённая загрузка; требуется разбор документов');
 if(['active','paused'].includes(o.status)){
  db.driverAvailability??={};db.driverAvailability[o.driverId]='away';
 }
 o.cancelledAt=eventStamp();
 o.cancelReason=reason;
 o.status='cancelled';
 o.cancelledBy='demo-logist';
 db.withdrawals??=[];
 db.withdrawals.push({id:'W'+Math.random().toString(36).slice(2),orderId:o.id,driverId:o.driverId,at:o.cancelledAt,reason,noticed:false});
 audit(fromPlan?'Наряд отозван при удалении закупки':'Наряд отозван',o.id,reason);
}
function cancelPlan(id,reason){
 const p=planForDeletion(id);
 if(!p||p.archivedAt)throw Error('План уже удалён или отсутствует');
 const linked=db.orders.filter(o=>o.planId===id&&activeOrder(o));
 const unresolved=linked.filter(o=>liveCargo(o)||o.status==='review');
 if(unresolved.length)throw Error('Есть загруженные незавершённые ходки: '+unresolved.map(x=>x.id).join(', ')+'. Сначала завершите или оформите возврат груза. Пока можете приостановить новые наряды.');
 const startedUnloaded=linked.filter(o=>['assigned','active','paused'].includes(o.status)&&!o.loadedAt);
 for(const o of startedUnloaded)cancelOrder(o.id,'Удалена закупка '+p.supplier+'. '+reason,true);
 p.archivedAt=eventStamp();p.archiveReason=reason;p.archivedBy='demo-logist';
 p.stoppedAt=p.stoppedAt||eventStamp();
 audit('План закупки архивирован',id,reason+'; отозвано нарядов: '+startedUnloaded.length);
}
open=function(act,id){
 if(act==='removeOrder'){
  const o=orderForDeletion(id);if(!o||!activeOrder(o))return;
  const live=liveCargo(o)||o.status==='review';
  const title=live?'Загруженный наряд требует решения':'Удалить наряд '+o.id+'?';
  const description=live?'<div class="notice">Груз уже загружен или выгрузка ждёт проверки. Для безопасности нельзя просто убрать его с контроля и удалить учёт веса. Сначала завершите или документально разрешите эту ходку.</div>':
   '<div class="notice">Наряд исчезнет у водителя и из рабочих списков, освободится бронь объёма. '+(o.status==='done'?'Ранее подтверждённые выгрузки и реестр останутся в истории.':'Если машина уже выехала пустой, это не освобождает автоматически тягач и водителя от рабочей смены.')+'</div>';
  modal(title,description+(live?'<div class="small">'+safe(o.id)+' · '+safe(o.cargo)+'</div><button type="button" class="btn secondary wfull" data-act="close">Закрыть</button>':reasons()),live?'blockedRemoval':'removeOrder',id);setDeletionModalButtons(live);return;
 }
 if(act==='removePlan'){
  const p=planForDeletion(id);if(!p||p.archivedAt)return;
  const loaded=db.orders.filter(o=>o.planId===id&&activeOrder(o)&& (liveCargo(o)||o.status==='review'));
  const relevant=db.orders.filter(o=>o.planId===id&&activeOrder(o)&&['assigned','active','paused'].includes(o.status)&&!o.loadedAt);
  const warning=loaded.length?'<div class="notice">Нельзя убрать из контроля уже загруженные ходки: '+safe(loaded.map(x=>x.id).join(', '))+'. Сначала оформите их завершение или возврат. Пока можно остановить новые наряды.</div>':
   '<div class="notice">Закупка пропадёт из активного плана. '+(relevant.length?'Одновременно будут отозваны '+relevant.length+' выданных, но ещё не загруженных нарядов. ':'')+'Подтверждённые выгрузки и финансовая история сохранятся.</div>';
  modal('Удалить план · '+p.supplier+'?',warning+(!loaded.length?reasons():'<button type="button" class="btn secondary wfull" data-act="close">Закрыть</button>'),loaded.length?'blockedRemoval':'removePlan',id);setDeletionModalButtons(!!loaded.length);return;
 }
 if(act==='togglePlan'){
  const p=planForDeletion(id);if(!p||p.archivedAt)return;
  if(p.stoppedAt){p.stoppedAt=null;audit('План возобновлён',id,'Разрешена выдача новых нарядов')}
  else{p.stoppedAt=eventStamp();audit('План приостановлен',id,'Новые наряды запрещены')}
  persist();render();return;
 }
 return oldOpen(act,id);
};
submit=function(kind){
 if(kind==='dispatchOrder'){const previous=orderForDeletion(modalId);if(previous&&!activeOrder(previous))throw Error('Наряд уже отменён или архивирован')}
 if(kind==='purchasePlan'){const previous=planForDeletion(modalId);if(previous?.archivedAt)throw Error('План уже удалён')}
 if(kind==='removeOrder'||kind==='removePlan'){
  if(!el('deletionChecked')?.checked)throw Error('Подтвердите удаление');
  const reason=reasonText();
  if(kind==='removeOrder')cancelOrder(modalId,reason);
  else cancelPlan(modalId,reason);
  return;
 }
 if(kind==='blockedRemoval')throw Error('Фактические перевозки нельзя удалить без урегулирования');
 return oldSubmit(kind);
};
})();