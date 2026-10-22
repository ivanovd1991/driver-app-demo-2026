/* Transport ERP demo: purchase-volume plans -> distinct driver dispatch orders.
   Synthetic localStorage only; production must recompute aggregates on server. */
(function(){
const previousEnsure=ensure,previousOpen=open,previousSubmit=submit,previousCard=cardOrder,previousOverview=overview,previousRender=render;
let planTripFilter='';
const kg=x=>Number(x)||0;
const tons=x=>Number(x||0).toLocaleString('ru-RU',{minimumFractionDigits:3,maximumFractionDigits:3});
const round=x=>Math.round(x*1000)/1000;
const e=esc;
function migratePlan(p){
 if(p.purchasedTonnes==null&&p.targetTonnes!=null)p.purchasedTonnes=Number(p.targetTonnes)||0;
 p.supplier??=p.customer||'Хозяйство не указано';
 p.loading??=p.place||'';
 p.unloading??='';
 p.commodity??=p.cargo||'';
 p.farmerPrice??='';
 p.freightRate??='';
 p.driverRate??='';
 p.note??='';
 p.customer??=p.supplier;
 p.recipient??='';
 return p;
}
function readiness(id){
 const d=db.drivers.find(x=>x.id===id);
 if(!d)return {ready:false,reason:'нет водителя'};
 const state=db.driverAvailability?.[id]||'ready';
 if(state!=='ready')return {ready:false,reason:({off:'Не на смене',repair:'Ремонт / недоступен',away:'Отсутствует'})[state]||'Недоступен'};
 if(db.duty?.[id]?.state==='home')return {ready:false,reason:'Отпущен домой'};
 const assigned=db.orders.find(o=>o.driverId===id&&['assigned','active','paused'].includes(o.status));
 if(assigned)return {ready:false,reason:'Занят: '+assigned.id};
 const session=db.sessions?.[id];
 if(session){const truck=db.trucks.find(t=>t.id===session.truckId);if(truck?.status==='repair')return {ready:false,reason:'Тягач в ремонте'}}
 return {ready:true,reason:'Готов к наряду'};
}
function totalsForPlan(p){
 const list=db.orders.filter(o=>o.planId===p.id&&!o.cancelledAt);
 let load=0,wheels=0,pending=0,delivered=0,reserved=0,deliveredLoaded=0,pendingLoaded=0;
 for(const o of list){
  if(o.status==='assigned')reserved+=Math.max(0,kg(o.plannedLoadTonnes))*1000;
  if(!o.loadedAt||!(kg(o.loadKg)>0))continue;
  const mass=kg(o.loadKg);load+=mass;
  if(o.status==='done'&&kg(o.unloadKg)>0){delivered+=kg(o.unloadKg);deliveredLoaded+=mass}
  else if(o.status==='review'&&kg(o.unloadKg)>0){pending+=kg(o.unloadKg);pendingLoaded+=mass}
  else wheels+=mass;
 }
 const purchased=Math.max(0,kg(p.purchasedTonnes)*1000);
 return {list,purchased,load,wheels,pending,delivered,reserved,
  remainingToLoad:purchased-load,
  availableToAssign:purchased-load-reserved,
  weightDifference:deliveredLoaded-delivered+pendingLoaded-pending};
}
function seed(){
 db.drivers??=[];db.plan??=[];db.orders??=[];db.driverAvailability??={};
 for(const [id,name,pin] of [['d3','Сергей Мельник','3333'],['d4','Андрей Ткаченко','4444']]){
  if(!db.drivers.some(x=>x.id===id))db.drivers.push({id,name,pin});
 }
 if(!db.purchasePlanExamplesSeeded){
  if(!db.plan.some(x=>x.id==='PL-DEMO-ALTAI'))db.plan.push({id:'PL-DEMO-ALTAI',supplier:'ФГ Алтай',commodity:'Рапс',purchasedTonnes:100,loading:'Склад ФГ Алтай',unloading:'',farmerPrice:19500,freightRate:1700,driverRate:1550,customer:'Тест Агро',recipient:'',note:'Демонстрационная закупка, данные вымышленные',demoSample:true,createdAt:now()});
  if(!db.plan.some(x=>x.id==='PL-DEMO-PROMEN'))db.plan.push({id:'PL-DEMO-PROMEN',supplier:'СГ Промень',commodity:'Пшеница',purchasedTonnes:500,loading:'Склад СГ Промень',unloading:'',farmerPrice:8200,freightRate:1200,driverRate:1100,customer:'Тест Агро',recipient:'',note:'Демонстрационная закупка, данные вымышленные',demoSample:true,createdAt:now()});
  db.purchasePlanExamplesSeeded=true;
 }
 db.plan.forEach(migratePlan);
}
ensure=function(){previousEnsure();db.driverAvailability??={};seed()};
const progressBar=t=>{
 const p=t.purchased||1,d=Math.min(100,Math.max(0,t.delivered/p*100)),q=Math.min(100-d,Math.max(0,t.pending/p*100)),w=Math.min(100-d-q,Math.max(0,t.wheels/p*100));
 return '<div style="display:flex;overflow:hidden;height:13px;border-radius:100px;background:#e7eef6;margin:13px 0">'+
 '<div style="width:'+d+'%;background:#16865d"></div><div style="width:'+q+'%;background:#6fa6db"></div><div style="width:'+w+'%;background:#efb448"></div></div>';
};
function planCard(p){
 const t=totalsForPlan(p);
 const small=(heading,amount)=>'<div><div class="small">'+heading+'</div><b>'+tons(amount/1000)+' т</b></div>';
 const alert=t.remainingToLoad<0?'<div class="small dangertext">Загружено больше объёма закупки — проверить объём или принадлежность рейса.</div>':'';
 return '<div class="card"><div class="row wrap"><h2>'+e(p.supplier)+' · '+e(p.commodity)+'</h2>'+tag(p.demoSample?'Учебный план':'Закупка',p.demoSample?'orange':'green')+'</div>'+
 '<div class="route">Куплено: '+tons(t.purchased/1000)+' т</div>'+progressBar(t)+
 '<div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+
 small('Подтверждённая выгрузка',t.delivered)+small('На колёсах',t.wheels)+small('Выгружено, ждёт проверки',t.pending)+small('Ещё не загружено',Math.max(0,t.remainingToLoad))+
 '</div><div class="soft"><div class="small">Уже загружено с хозяйства</div><b>'+tons(t.load/1000)+' т</b><div class="small">Забронировано нарядами: '+tons(t.reserved/1000)+' т · Можно назначить: '+tons(Math.max(0,t.availableToAssign)/1000)+' т</div>'+
 (t.weightDifference?'<div class="small">Разница веса погрузки и выгрузки: '+tons(t.weightDifference/1000)+' т</div>':'')+'</div>'+
 '<div class="muted">'+e(p.loading||'Место погрузки не указано')+' → '+e(p.unloading||'выгрузку уточним')+'</div>'+
 '<div class="small">Цена закупки: '+(p.farmerPrice!==''?UAH(p.farmerPrice)+'/т':'—')+' · фрахт доставки: '+(p.freightRate!==''?UAH(p.freightRate)+'/т':'—')+' · внутренняя ставка водителя: '+(p.driverRate!==''?UAH(p.driverRate)+'/т':'—')+'</div>'+alert+
 '<div class="actions"><button class="btn secondary" data-act="editPlan" data-id="'+e(p.id)+'">✎ Закупка</button><button class="btn secondary" data-act="planTrips" data-id="'+e(p.id)+'">🚛 Ходки ('+t.list.length+')</button><button class="btn secondary" data-act="togglePlan" data-id="'+e(p.id)+'">'+(p.stoppedAt?'▶ Возобновить':'⏸ Приостановить')+'</button><button class="btn warn" data-act="removePlan" data-id="'+e(p.id)+'">🗑 Удалить</button></div>'+
 '</div>';
}
plan=function(){
 const purchased=db.plan.reduce((a,p)=>a+Math.max(0,kg(p.purchasedTonnes)*1000),0),
 progress=db.plan.map(totalsForPlan);
 return '<div class="row wrap" style="margin-bottom:12px"><div><h2>План закупок и вывоза</h2><div class="muted">Каждая закупка — отдельный объём, который вывозят несколькими ходками.</div></div><button class="btn" data-act="newPlan">+ Добавить закупку</button></div>'+
 '<div class="grid">'+stat('Всего куплено',tons(purchased/1000)+' т')+stat('На колёсах',tons(progress.reduce((a,b)=>a+b.wheels,0)/1000)+' т')+
 stat('Подтверждено выгружено',tons(progress.reduce((a,b)=>a+b.delivered,0)/1000)+' т')+stat('Осталось загрузить',tons(progress.reduce((a,b)=>a+Math.max(0,b.remainingToLoad),0)/1000)+' т')+'</div>'+
 '<div class="notice">Здесь не выдаются наряды. Закупку создаём один раз; затем в разделе «Наряды» выбираем свободного водителя и нужную закупку. Загрузка и выгрузка автоматически меняют показатели.</div>'+
 db.plan.slice().reverse().map(planCard).join('');
};
function availability(){
 return '<div class="card"><h2>Готовность водителей</h2><div class="muted">В список выдачи нарядов попадают только готовые, без незавершённого задания.</div>'+
 db.drivers.map(d=>{const a=readiness(d.id);return '<div class="row wrap" style="border-top:1px solid #e6edf3;padding:9px 0"><div><b>'+e(d.name)+'</b><div class="small">'+e(a.reason)+'</div></div>'+
 '<button class="btn secondary" data-act="driverState" data-id="'+e(d.id)+'">'+e((db.driverAvailability?.[d.id]||'ready')==='ready'?'Статус: готов':'Статус: недоступен')+'</button></div>'}).join('')+'</div>';
}
orders=function(){
 const ready=db.drivers.filter(d=>readiness(d.id).ready).length;
 return '<div class="row wrap" style="margin-bottom:12px"><div><h2>Наряды водителям</h2><div class="small">Свободных готовых: '+ready+' · каждый наряд связан с закупкой</div></div>'+
 '<button class="btn" data-act="newOrder" '+(!ready?'disabled':'')+'>+ Выдать наряд</button><button class="btn secondary" data-go="plan">К закупкам →</button></div>'+
 '<div class="notice">Сначала выбери свободного водителя, затем закупку из плана. Место загрузки, культура и ставки подтянутся; отсутствующие поля можно дополнить или сообщить позже.</div>'+
 (planTripFilter?'<div class="soft"><div class="row"><b>Ходки закупки: '+e(db.plan.find(x=>x.id===planTripFilter)?.supplier||'')+'</b><button class="btn secondary" data-act="planTripsClear">Все наряды</button></div></div>':'')+
 db.orders.filter(o=>!planTripFilter||o.planId===planTripFilter).slice().reverse().map(cardOrder).join('')+
 (!db.orders.length?'<div class="card empty">Нарядов пока нет</div>':'')+availability();
};
cardOrder=function(o){
 const p=db.plan.find(x=>x.id===o.planId);
 return previousCard(o).replace('<div class="route" style="margin-top:8px">','<div class="small">'+(p?'План: '+e(p.supplier)+' · '+e(p.commodity):'Без связи с закупкой · старый учебный наряд')+'</div><div class="route" style="margin-top:8px">');
};
overview=function(){
 const t=db.plan.filter(p=>!p.archivedAt).map(totalsForPlan);
 return '<div class="card"><div class="row"><h2>Вывоз по закупкам</h2><button class="btn secondary" data-go="plan">Открыть план →</button></div>'+
 '<div class="grid">'+stat('На колёсах',tons(t.reduce((n,x)=>n+x.wheels,0)/1000)+' т')+
 stat('Выгружено / подтверждено',tons(t.reduce((n,x)=>n+x.delivered,0)/1000)+' т')+'</div></div>'+previousOverview();
};
function planForm(id){
 const p=db.plan.find(x=>x.id===id)||{};
 modal(p.id?'Изменить закупку':'Добавить закупку',
 '<div class="notice">Вводим объём закупки один раз. Водителя здесь не выбираем.</div>'+
 '<div class="fields"><div>'+input('supplier','Хозяйство / фермер',p.supplier||'','required')+'</div>'+
 '<div>'+input('commodity','Культура',p.commodity||'','required')+'</div>'+
 '<div>'+input('purchasedTonnes','Куплено тонн',p.purchasedTonnes??'','type="number" step="0.001" min="0.001" required')+'</div>'+
 '<div>'+input('farmerPrice','Цена фермера, грн/т',p.farmerPrice??'','type="number" min="0" step="0.01"')+'</div>'+
 '<div>'+input('freightRate','Фрахт доставки, грн/т',p.freightRate??'','type="number" min="0" step="0.01"')+'</div>'+
 '<div>'+input('driverRate','Внутренняя ставка водителя, грн/т',p.driverRate??'','type="number" min="0" step="0.01"')+'</div>'+
 '<div>'+input('loading','Место погрузки',p.loading||'','required')+'</div>'+
 '<div>'+input('unloading','Пункт выгрузки (если известен)',p.unloading||'')+'</div>'+
 '<div>'+input('customer','Заказчик / фирма перевозки',p.customer||'')+'</div>'+
 '<div>'+input('recipient','Фирма сдачи / получатель',p.recipient||'')+'</div></div>'+
 textArea('note','Контакты и инструкции',p.note||''),
 'purchasePlan',id);return;
}
function readyOptions(existing){
 const ready=db.drivers.filter(d=>readiness(d.id).ready||existing&&existing.driverId===d.id);
 return ready.map(d=>[d.id,d.name+' · '+(readiness(d.id).ready?'свободен':'текущий водитель')]);
}
function orderForm(id){
 const o=db.orders.find(x=>x.id===id)||{};
 const availablePlans=db.plan.filter(p=>Number(p.purchasedTonnes)>0&&!p.archivedAt&&!p.stoppedAt&&totalsForPlan(p).availableToAssign>0);
 const p=db.plan.find(x=>x.id===(o.planId||id))||availablePlans[0];
 const opts=readyOptions(o.id?o:null);
 if(!opts.length){alert('Нет свободных готовых водителей. Проверь статус внизу вкладки «Наряды».');return}
 if(!p){alert('Сначала создайте закупку в разделе «План».');return}
 const edit=!!o.id;
 modal(edit?'Изменить наряд '+o.id:'Выдать наряд',
 '<div class="notice">Изменение данных этой ходки не меняет саму закупку и не создаёт второй план. Стоимость зерна водителю не показывается.</div>'+
 select('driverId','Свободный готовый водитель',opts,o.driverId||opts[0][0])+
 (edit?'<div class="soft">Закупка: <b>'+e(p.supplier)+' · '+e(p.commodity)+'</b></div>':
 select('planRef','Закупка из плана',availablePlans.map(q=>[q.id,q.supplier+' · '+q.commodity+' · осталось '+tons(Math.max(0,totalsForPlan(q).remainingToLoad)/1000)+' т']),p.id))+
 '<div class="fields"><div>'+input('date','Плановая дата погрузки',o.plannedDate||day(),'type="date"')+'</div>'+
 '<div>'+input('plannedLoadTonnes','Плановая загрузка этой машины, т',o.plannedLoadTonnes??'', 'type="number" min="0.001" step="0.001"')+'</div>'+
 '<div>'+input('from','Место погрузки',o.from??p.loading,'required')+'</div>'+
 '<div>'+input('to','Пункт выгрузки',o.to??p.unloading)+'</div>'+
 '<div>'+input('cargo','Культура',o.cargo??p.commodity,'required')+'</div>'+
 '<div>'+input('customer','Заказчик / хозяин груза',o.customer??p.customer)+'</div>'+
 '<div>'+input('recipient','Фирма сдачи',o.recipient??p.recipient)+'</div>'+
 '<div>'+input('driverRate','Внутренняя ставка водителя, грн/т',o.driverRate??p.driverRate,'type="number" min="0" step="0.01"')+'</div></div>'+
 select('registerForm','Форма реестра',[['','Пока неизвестна'],['1','1 — Безнал'],['2','2 — Кэш']],o.registerForm||'')+
 textArea('note','Инструкции водителю / контакты / ТТН',o.note??p.note),
 'dispatchOrder',id);return;
}
function changeOrderPlan(id){
 const p=db.plan.find(x=>x.id===id);if(!p)return;
 const setters={from:p.loading||'',to:p.unloading||'',cargo:p.commodity||'',customer:p.customer||p.supplier,recipient:p.recipient||'',driverRate:p.driverRate??'',note:p.note||''};
 for(const [field,value] of Object.entries(setters)){const target=el(field);if(target)target.value=String(value)}
 const quota=totalsForPlan(p).availableToAssign;let x=el('plannedLoadTonnes');if(x&&!x.value)x.value=String(round(Math.min(35,Math.max(0,quota/1000))));
}
open=function(act,id){
 if(act==='newPlan'||act==='editPlan')return planForm(id);
 if(act==='editOrder'&&db.orders.some(o=>o.id===id&&!o.planId))return previousOpen(act,id);
 if(act==='newOrder'||act==='editOrder'||act==='issuePlan')return orderForm(id);
 if(act==='planTrips'){
  const p=db.plan.find(x=>x.id===id);if(!p)return;
  planTripFilter=id;tab='orders';render();return;
 }
 if(act==='planTripsClear'){planTripFilter='';render();return}
 if(act==='driverState'){
  const d=db.drivers.find(x=>x.id===id);if(!d)return;
  modal('Готовность водителя · '+d.name,
  select('driverAvailability','Доступность',[['ready','Готов / свободен'],['off','Не на смене'],['repair','Ремонт / недоступен'],['away','Отсутствует']],db.driverAvailability?.[d.id]||'ready')+
  '<div class="soft small">Наличие выданного или текущего наряда автоматически блокирует новую выдачу даже если статус «Готов».</div>',
  'driverState',id);return;
 }
 return previousOpen(act,id);
};
submit=function(kind){
 if(kind==='purchasePlan'){
  const id=modalId,old=db.plan.find(x=>x.id===id);
  const amount=Number(val('purchasedTonnes'));if(!(amount>0&&amount<=1000000))throw Error('Введите корректный объём закупки, тонн');
  const r={supplier:mandatory('supplier'),commodity:mandatory('commodity'),purchasedTonnes:amount,
   farmerPrice:val('farmerPrice'),freightRate:val('freightRate'),driverRate:val('driverRate'),loading:mandatory('loading'),
   unloading:val('unloading'),customer:val('customer'),recipient:val('recipient'),note:val('note')};
  for(const f of ['farmerPrice','freightRate','driverRate'])if(r[f]!==''&&(!Number.isFinite(Number(r[f]))||Number(r[f])<0))throw Error('Проверьте тариф: '+f);
  if(old){const t=totalsForPlan(old);if(amount*1000+0.001<t.load+t.reserved)throw Error('Нельзя уменьшить закупку ниже уже загруженного и зарезервированного объёма');Object.assign(old,r);old.updatedAt=now()}else db.plan.push({id:'PL'+ids(),createdAt:now(),...r});
  audit('План закупки сохранён',old?.id||'',r.supplier+' · '+amount+' т');return;
 }
 if(kind==='driverState'){db.driverAvailability[modalId]=mandatory('driverAvailability');audit('Готовность водителя',modalId,db.driverAvailability[modalId]);return}
 if(kind==='dispatchOrder'){
  const old=db.orders.find(x=>x.id===modalId);
  const planId=old?.planId||mandatory('planRef'),p=db.plan.find(x=>x.id===planId);
  if(!p)throw Error('Выберите действующий план закупки');
  if(!old&&(p.archivedAt||p.stoppedAt))throw Error('Закупка удалена или приостановлена. Нельзя выдать новый наряд');
  const driver=mandatory('driverId');
  if(!old&&!readiness(driver).ready)throw Error('Водитель уже занят или недоступен, выберите другого');
  if(old&&driver!==old.driverId&&!readiness(driver).ready)throw Error('Для пересадки нужен свободный водитель');
  const weight=val('plannedLoadTonnes')?Number(val('plannedLoadTonnes')):0;
  if(weight<0||!Number.isFinite(weight)||weight>100)throw Error('Проверьте плановый вес машины');
  const r={driverId:driver,planId,plannedLoadTonnes:weight,plannedDate:val('date'),from:mandatory('from'),to:val('to'),
   cargo:mandatory('cargo'),customer:val('customer'),recipient:val('recipient'),
   driverRate:val('driverRate')?Number(val('driverRate')):null,
   registerForm:val('registerForm'),note:val('note')};
  const remaining=totalsForPlan(p).availableToAssign+(old?.status==='assigned'?kg(old.plannedLoadTonnes)*1000:0);
  if(weight>0&&weight*1000>remaining+0.01)throw Error('Плановый вес превышает ещё доступный объём '+tons(Math.max(0,remaining)/1000)+' т; уменьшите загрузку');
  if(old){
   if(old.loadedAt&&old.planId!==planId)throw Error('План уже нельзя менять после загрузки');
   if(old.status==='done'||old.status==='review')throw Error('Подтверждённые данные исправляются через проверку логиста');
   Object.assign(old,r);old.updatedAt=now();old.revision=(old.revision||0)+1;audit('Наряд обновлён',old.id,p.supplier);
  }else{
   if(!db.orderNumber||db.orderNumber<127)db.orderNumber=127;
   const o={id:'R-'+db.orderNumber++,status:'assigned',createdAt:now(),attachments:[],segments:[],pauses:[],ttn:'',loadKg:null,unloadKg:null,...r,farmerPrice:p.farmerPrice,freightRate:p.freightRate,supplier:p.supplier};
   db.orders.push(o);audit('Наряд выдан',o.id,p.supplier+' · '+p.commodity);
   if(r.note)db.messages.push({id:'M'+ids(),driverId:driver,tripId:o.id,kind:'in',directiveType:'initial',message:r.note,at:now(),revision:1,acknowledgedAt:null});
  }
  return;
 }
 return previousSubmit(kind);
};
document.addEventListener('change',ev=>{if(ev.target?.id==='planRef')changeOrderPlan(ev.target.value)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){db=read();ensure();render()}});
db=read();ensure();persist();render();
})();