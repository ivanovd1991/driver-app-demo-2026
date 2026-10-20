'use strict';
(function(){
const moneyDay=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const moneyReady=()=>{db.cashEvents??=[];db.allowances??=[];db.duty??={}};
const dutyOf=id=>(db.duty&&db.duty[id]?.state)||'preparing';
function moneyCharge(id){
 moneyReady();if(dutyOf(id)!=='on')return false;
 const d=moneyDay();if(db.allowances.some(x=>x.driverId===id&&x.day===d))return false;
 db.allowances.push({id:'DAY'+Date.now()+Math.random().toString(36).slice(2,5),driverId:id,day:d,amount:350,type:'Рабочий день',at:when()});
 record('Суточные (автоматически)',d+' · 350 грн');return true;
}
function moneyStart(id){
 moneyReady();db.duty[id]={state:'on',startedAt:when(),previous:dutyOf(id)};moneyCharge(id);
}
function moneyTotals(id){
 moneyReady();const events=db.cashEvents.filter(x=>x.driverId===id);
 const incoming=events.filter(x=>x.type==='advance'&&x.status==='confirmed').reduce((a,x)=>a+x.amount,0);
 const approved=events.filter(x=>x.type==='expense'&&x.status==='approved').reduce((a,x)=>a+x.amount,0);
 const disputed=events.filter(x=>x.type==='expense'&&['pending','rejected'].includes(x.status)).reduce((a,x)=>a+x.amount,0);
 const daily=db.allowances.filter(x=>x.driverId===id).reduce((a,x)=>a+x.amount,0);
 return {confirmed:incoming-approved-daily,declared:incoming-approved-disputed-daily,daily,disputed};
}
function driverWalletHTML(){
 const id=db.userId,w=moneyTotals(id),status=dutyOf(id),events=db.cashEvents.filter(x=>x.driverId===id).slice().reverse(),days=db.allowances.filter(x=>x.driverId===id).slice().reverse();
 const due=events.filter(x=>x.type==='advance'&&x.status==='issued');
 return '<div class="section-label">Подотчётные средства</div><div class="card soft"><h2>Мои деньги</h2><div class="muted">Подтверждённый остаток</div><h2 style="font-size:27px">'+num(w.confirmed)+' грн</h2><div class="muted">По заявлению с ожидающими проверки тратами: '+num(w.declared)+' грн</div><div class="note mt">Рабочий статус: '+(status==='on'?'🟢 На работе':status==='home'?'🏠 Отпущен домой — суточные приостановлены':'⏳ Работа не началась')+'</div><div class="buttons mt"><button class="btn" data-action="moneyExpense">− Расход</button><button class="btn secondary" data-action="moneyIncoming">+ Получил деньги</button></div></div>'+
 '<div class="card"><h2>Выданные средства</h2><p class="muted">Подтвердите получение денег, если логист или механик уже отметил выдачу.</p>'+
 (due.map(x=>'<div class="note mb"><b>+'+num(x.amount)+' грн</b> · '+h(x.method==='card'?'Перевод на карту':'Наличные')+' · '+h(x.issuer||'Логист')+'<button class="btn mt" data-action="moneyAccept:'+h(x.id)+'">✓ Подтверждаю получение</button></div>').join('')||'<div class="empty">Выдач для подтверждения нет</div>')+'</div>'+
 '<div class="card"><h2>Автоматические суточные</h2><p class="muted">350 грн за каждый календарный день фактической работы по времени Украины. Просмотр наряда вечером не запускает списание.</p>'+
 (days.map(x=>'<div class="kv"><span>'+h(x.day)+' · рабочий день</span><strong>−350 грн</strong></div>').join('')||'<div class="empty">Ещё не списывались</div>')+
 '<p class="hint">В демо дата проверяется при действиях и открытии страницы. На сервере будет фоновый расчёт и защита от дублей.</p></div>'+
 '<div class="card"><h2>История поступлений и расходов</h2>'+
 (events.map(x=>'<div style="padding:12px 0;border-bottom:1px solid #e4eaf2"><div class="between"><b>'+(x.type==='advance'?'+':'−')+num(x.amount)+' грн</b><span class="chip">'+h(x.status)+'</span></div><div class="small">'+date(x.at)+' · '+h(x.category||x.issuer||'')+'</div><div class="shortinfo">'+h(x.note||'')+'</div>'+(x.photo&&x.photo.startsWith('data:image/')?'<img class="filethumb" alt="Чек" src="'+x.photo+'">':'')+'</div>').join('')||'<div class="empty">Операций пока нет</div>')+
 '</div><div class="card"><a href="./logist.html" class="btn secondary" style="display:block;text-align:center">↗ Открыть тестовое окно логиста</a></div>';
}
const originalRender=render;
render=function(){
 moneyReady();if(db.userId&&moneyCharge(db.userId))persist();
 originalRender();
 if(page==='money'&&session()){
  const m=$('app').querySelector('main.main');if(m)m.innerHTML=driverWalletHTML();
  const title=$('app').querySelector('header h1');if(title)title.textContent='Мои деньги';
 }
};
const originalOpenAction=openAction;
openAction=function(action){
 if(action==='moneyExpense'){
  showModal('Записать расход',
   formField('moneyAmount','Сумма, грн','number','','required min="1" step="0.01"')+
   selectField('moneyCategory','Категория','<option>Покупка ТТН</option><option>Запчасти / ремонт</option><option>Стоянка</option><option>Дорожный сбор</option><option>Прочее</option>')+
   textareaField('note','На что потрачено',true)+photoField()+
   '<label class="checkline"><input id="moneyChecked" type="checkbox" required> Я проверил сумму и приложенный чек / документ</label>',
   'Передать расход логисту','moneyExpense');return;
 }
 if(action==='moneyIncoming'){
  showModal('Сообщить о получении средств',
   formField('moneyAmount','Получено, грн','number','','required min="1" step="0.01"')+
   selectField('moneyIssuer','Кто выдал','<option value="logist">Логист</option><option value="mechanic">Механик</option><option value="accountant">Бухгалтер</option><option value="other">Другой</option>')+
   selectField('moneyMethod','Способ','<option value="cash">Наличные</option><option value="card">Перевод на карту</option>')+
   textareaField('note','Комментарий'),
   'Сообщить логисту','moneyIncoming');return;
 }
 return originalOpenAction(action);
};
const originalSubmit=submitKind;
submitKind=async function(kind){
 if(kind==='moneyExpense'){
  if(!session())throw Error('Откройте рабочую смену');
  moneyReady();const amt=valueNum('moneyAmount');if(!Number.isFinite(amt)||amt<=0||amt>1000000)throw Error('Некорректная сумма');
  if(!$('moneyChecked')?.checked)throw Error('Подтвердите правильность расхода');
  const photo=await compressFile('photo');if(!photo)throw Error('Требуется фотография чека или документа');
  const t=trip(),s=session();
  db.cashEvents.push({id:'C'+Date.now()+Math.random().toString(36).slice(2,5),driverId:db.userId,type:'expense',amount:amt,category:val('moneyCategory'),note:val('note'),photo,at:when(),tripId:t?.id||null,truckId:s.truckId,status:'pending'});
  record('Расход ожидает логиста',num(amt)+' грн');saveSuccess();return;
 }
 if(kind==='moneyIncoming'){
  if(!session())throw Error('Откройте рабочую смену');
  moneyReady();const amt=valueNum('moneyAmount');if(!Number.isFinite(amt)||amt<=0||amt>1000000)throw Error('Некорректная сумма');
  db.cashEvents.push({id:'C'+Date.now()+Math.random().toString(36).slice(2,5),driverId:db.userId,type:'advance',amount:amt,issuer:val('moneyIssuer'),method:val('moneyMethod'),note:val('note'),at:when(),status:'reported'});
  record('Получение заявлено · на проверке',num(amt)+' грн');saveSuccess();return;
 }
 const driverBefore=db.userId;
 const isStarting=kind==='start'&&trip()?.status==='assigned';
 const isReleasing=kind==='release'&&!!driverBefore;
 await originalSubmit(kind);
 if(isStarting&&db.userId){moneyStart(db.userId);persist();render()}
 if(isReleasing){moneyReady();db.duty[driverBefore]={state:'off',endedAt:when()};persist();render()}
};
const originalHandle=handleAction;
handleAction=function(action){
 moneyReady();
 if(action==='moneyReturn'){
  if(!db.userId)return;moneyStart(db.userId);let t=trip();
  if(t?.status==='paused'&&t.pauses?.some(x=>x.reason==='home'&&!x.endedAt)){finishPause(t,'Вернулся к работе');t.status='active'}
  record('Возвращение к работе','Учёт суточных возобновлён');persist();render();return;
 }
 if(action.startsWith('moneyAccept:')){
  const x=db.cashEvents.find(v=>v.id===action.slice(12)&&v.driverId===db.userId&&v.type==='advance'&&v.status==='issued');
  if(x){x.status='confirmed';x.receivedAt=when();record('Поступление подтверждено',num(x.amount)+' грн');persist();render()}return;
 }
 if(action.startsWith('ack:')){
  const m=db.messages.find(v=>v.id===action.slice(4)&&v.driverId===db.userId&&v.directiveType==='home'&&!v.acknowledgedAt);
  if(m){
   db.duty[db.userId]={state:'home',startedAt:when(),instructionId:m.id};
   const t=db.orders.find(v=>v.id===m.tripId);
   if(t?.status==='active'){t.status='paused';t.pauses.push({id:'P'+Date.now(),reason:'home',reasonLabel:'Отпущен домой',note:m.message,startedAt:when(),endedAt:null})}
  }
 }
 if(action==='resume'&&dutyOf(db.userId)==='home'){handleAction('moneyReturn');return}
 if(dutyOf(db.userId)==='home'&&['load','finish','fuel','expense','start'].includes(action)){alert('Вы отпущены домой. Сначала подтвердите возвращение к работе.');return}
 return originalHandle(action);
};
const oldRenderNav=renderNav;
renderNav=function(){
 let html=oldRenderNav();
 html=html.replace('</nav>','<button data-tab="money" class="'+(page==='money'?'active':'')+'"><span>💳</span>Деньги</button></nav>');
 return html;
};
const oldRenderTripButtons=renderTripButtons;
renderTripButtons=function(t){
 if(t.status==='paused'&&dutyOf(db.userId)==='home')return '<div class="stack"><div class="note">🏠 Отпущен домой — суточные не начисляются</div><button class="btn" data-action="moneyReturn">✓ Вернулся к работе</button></div>';
 return oldRenderTripButtons(t);
};
const oldRenderTrip=renderTrip;
renderTrip=function(s,t){
 let html=oldRenderTrip(s,t);
 if(t&&t.driverRate){
  const shown=t.unloadKg??t.loadKg;
  const earnings=shown!=null?Number(shown)/1000*Number(t.driverRate)*0.15:null;
  const wage='<div class="card"><h2>Мой тариф по наряду</h2><div class="kv"><span>Внутренняя ставка</span><strong>'+num(t.driverRate)+' грн/т</strong></div><div class="kv"><span>'+(t.unloadKg==null?'Предварительный заработок':'Расчёт по выгрузке')+'</span><strong>'+(earnings==null?'После взвешивания':num(earnings)+' грн')+'</strong></div><div class="hint">15% × внутренний тариф × тонны выгрузки. До подтверждения логистом сумма не является окончательной.</div></div>';
  html=html.replace('<div class="card"><h2>Последние события</h2>',wage+'<div class="card"><h2>Последние события</h2>');
 }
 return html;
};
window.addEventListener('focus',()=>{if(db.userId&&moneyCharge(db.userId))persist();render()});
render();
})();