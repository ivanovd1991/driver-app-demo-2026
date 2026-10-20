'use strict';
const KEY='driver-demo-v2-20261020';
const el=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const UAH=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₴';
const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const now=()=>new Date().toISOString();
const fmt=iso=>iso?new Date(iso).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'}):'—';
const ids=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36);
const driverName=id=>db.drivers.find(x=>x.id===id)?.name||'—';
const truckName=id=>db.trucks.find(x=>x.id===id)?.plate||'—';
const label=(name,value='',type='text',attrs='')=>'<label>'+esc(name)+'</label><input name="'+esc(value?name:'')+'" style="display:none">'+''; // unused legacy placeholder
const input=(name,title,value='',extra='')=>'<label for="'+name+'">'+esc(title)+'</label><input id="'+name+'" name="'+name+'" value="'+esc(value)+'" '+extra+'>';
const select=(name,title,options,value='')=>'<label for="'+name+'">'+esc(title)+'</label><select id="'+name+'" name="'+name+'">'+options.map(x=>'<option value="'+esc(x[0])+'" '+(String(x[0])===String(value)?'selected':'')+'>'+esc(x[1])+'</option>').join('')+'</select>';
const textArea=(name,title,value='')=>'<label for="'+name+'">'+esc(title)+'</label><textarea id="'+name+'" name="'+name+'">'+esc(value)+'</textarea>';
const check=(name,title)=>'<label class="check"><input type="checkbox" name="'+name+'" id="'+name+'" required><span>'+esc(title)+'</span></label>';
const options=list=>list.map(x=>[x.id,x.name]);
const stat=(a,b)=>'<div class="soft"><div class="small">'+esc(a)+'</div><div class="num">'+esc(b)+'</div></div>';
const tag=(str,type='')=>'<span class="tag '+type+'">'+esc(str)+'</span>';
const route=o=>esc(o.from||'Погрузка не указана')+' → '+esc(o.to||'назначение уточняется');
const isFinal=o=>o.status==='done';
const status=o=>({assigned:'Наряд выдан',active:'В пути',paused:'Остановка',review:'Проверка',done:'Утверждён',interrupted:'Прерван'})[o.status]||o.status;
const jsPhoto=x=>typeof x==='string'&&x.startsWith('data:image/')?x:'';
const baseDemo=()=>({version:2,userId:null,orderNumber:127,
 drivers:[{id:'d1',name:'Александр Иваненко',pin:'1111'},{id:'d2',name:'Павел Коваленко',pin:'2222'}],
 trucks:[{id:'t1',model:'DAF XF 480',plate:'ВН 1234 АА',status:'free',driverId:null,odo:185400},{id:'t2',model:'MAN TGX',plate:'ВН 5678 АА',status:'free',driverId:null,odo:90300},{id:'t3',model:'Volvo FH',plate:'ВН 7777 ВК',status:'busy',driverId:'outside',odo:120000}],
 trailers:[{id:'p1',name:'Самосвальный',plate:'ВН 4343 ХТ',status:'free',driverId:null},{id:'p2',name:'Самосвальный',plate:'ВН 5656 ХТ',status:'free',driverId:null}],
 sessions:{},assignments:[],orders:[],fuelPeriods:{},fuelings:[],expenses:[],events:[],messages:[]});
function read(){try{const x=JSON.parse(localStorage.getItem(KEY));return x?.version===2?x:baseDemo()}catch{return baseDemo()}}
let db=read();let tab='overview';let authenticated=sessionStorage.getItem('logist-demo-session')==='yes';let modalId='';
function ensure(){db.plan??=[];db.cashEvents??=[];db.allowances??=[];db.demoRegister??=[];db.duty??={};db.audit??=[];db.messages??=[]}
function persist(){ensure();localStorage.setItem(KEY,JSON.stringify(db))}
function reload(){db=read();ensure();render()}
function audit(type,orderId='',info=''){ensure();db.audit.unshift({id:ids(),type,orderId,info,at:now(),actor:'demo-logist'})}
function currentTruck(id){const s=db.sessions?.[id];return s?truckName(s.truckId):'—'}
function allowanceCount(id){return db.allowances.filter(x=>x.driverId===id).length}
function totals(id){
 const ev=db.cashEvents.filter(x=>x.driverId===id);const incoming=ev.filter(x=>x.type==='advance'&&x.status==='confirmed').reduce((a,x)=>a+x.amount,0);
 const pendingIncoming=ev.filter(x=>x.type==='advance'&&x.status!=='confirmed').reduce((a,x)=>a+x.amount,0);
 const spentApproved=ev.filter(x=>x.type==='expense'&&x.status==='approved').reduce((a,x)=>a+x.amount,0);
 const spentPending=ev.filter(x=>x.type==='expense'&&x.status==='pending').reduce((a,x)=>a+x.amount,0);
 const spentRejected=ev.filter(x=>x.type==='expense'&&x.status==='rejected').reduce((a,x)=>a+x.amount,0);
 const perDiem=db.allowances.filter(x=>x.driverId===id).reduce((a,x)=>a+x.amount,0);
 return {confirmed:incoming-spentApproved-perDiem,declared:incoming-spentApproved-spentPending-spentRejected-perDiem,pendingIncoming,spentPending,spentRejected,perDiem};
}
function loginPage(){return '<div class="card" style="max-width:470px;margin:20px auto"><h2>Тестовый вход логиста</h2><p class="muted">Это отдельное окно для тестирования. PIN учебный, не защищает настоящие данные. Используйте только вымышленные примеры.</p><form id="loginForm"><label for="loginPin">PIN логиста</label><input id="loginPin" inputmode="numeric" type="password" maxlength="4" placeholder="9090" required><div class="space"></div><button class="btn wfull">Войти</button></form><div class="soft small">PIN демоверсии: <b>9090</b>. Все изменения видны приложению водителя только в этом же браузере/устройстве.</div><a class="btn secondary wfull" href="./">Открыть приложение водителя</a></div>'}
function cardOrder(o){return '<div class="card"><div class="row wrap"><b>'+esc(o.id)+' · '+esc(driverName(o.driverId))+'</b>'+tag(status(o),o.status==='review'?'orange':o.status==='done'?'green':'')+'</div><div class="route" style="margin-top:8px">'+route(o)+'</div><div class="muted">'+esc(o.cargo||'—')+' · '+esc(o.customer||'—')+' · '+esc(currentTruck(o.driverId))+'</div><div class="small">Форма: '+(o.registerForm==='1'?'1 · Безнал':o.registerForm==='2'?'2 · Кэш':'не определена')+' · ставка водителя: '+(o.driverRate?UAH(o.driverRate)+'/т':'не задана')+'</div>'+
 (o.loadedAt?'<div class="soft"><b>✓ Загружен '+fmt(o.loadedAt)+'</b><div class="small">Тара '+esc(o.tareKg??'—')+' · брутто '+esc(o.grossKg??'—')+' · нетто '+esc(o.loadKg??'—')+' кг · фото '+(o.attachments||[]).filter(x=>x.stage==='loading').length+'</div></div>':'')+
 (o.unloadKg!=null?'<div class="soft"><b>Выгружен: '+esc(o.unloadKg)+' кг</b><div class="small">Разница (погрузка − выгрузка): '+esc((o.loadKg||0)-o.unloadKg)+' кг</div></div>':'')+
 '<div class="actions"><button class="btn secondary" data-act="editOrder" data-id="'+esc(o.id)+'">✎ Изменить наряд</button><button class="btn secondary" data-act="directive" data-id="'+esc(o.id)+'">✉ Указание</button>'+(o.status==='review'?'<button class="btn" data-act="review" data-id="'+esc(o.id)+'">✓ Проверить</button>':'')+'</div></div>'}
function overview(){
 const active=db.orders.filter(x=>x.status==='active'||x.status==='paused').length,pending=db.orders.filter(x=>x.status==='review').length,loads=db.orders.filter(x=>x.loadedAt).length;
 const latest=db.orders.filter(x=>x.loadedAt).slice(-4).reverse();const wallet=db.drivers.map(d=>({d,t:totals(d.id)}));
 return '<div class="grid">'+stat('Ходок в работе',active)+stat('Загружено (всего в демо)',loads)+stat('Документы на проверке',pending)+stat('Запланировано погрузок',db.plan.filter(p=>!p.orderId).length)+'</div>'+
 '<div class="row"><h2>Поступления от водителей</h2><button class="btn secondary" data-go="review">Все →</button></div>'+
 (latest.length?latest.map(x=>cardOrder(x)).join(''):'<div class="card empty">Пока нет подтверждённых загрузок. Создайте наряд и заполните его в приложении водителя.</div>')+
 '<div class="card"><div class="row"><h2>Остатки денег</h2><button class="btn secondary" data-go="money">Открыть</button></div>'+
 wallet.map(x=>'<div class="row" style="padding:9px 0;border-top:1px solid #e6edf3"><span>'+esc(x.d.name)+'<div class="small">'+esc(currentTruck(x.d.id))+'</div></span><b>'+UAH(x.t.confirmed)+'</b></div>').join('')+'</div>'+
 '<div class="card"><h2>Как проверить на телефоне</h2><div class="muted">Откройте водителя по кнопке ниже, выполните загрузку, затем вернитесь в панель логиста и нажмите «Обновить». Данные общие только внутри этого браузера.</div><div class="actions"><a class="btn" href="./?v=4">🚛 Водитель</a><button class="btn secondary" data-act="refresh">↻ Обновить</button></div></div>';
}
function orders(){return '<div class="row" style="margin-bottom:12px"><h2>Наряды водителям</h2><button class="btn" data-act="newOrder">+ Новый наряд</button></div>'+db.orders.slice().reverse().map(cardOrder).join('')+'<div class="card empty">Если наряда нет в списке, создайте его кнопкой «Новый наряд».</div>'}
function plan(){
 const list=db.plan.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
 return '<div class="row" style="margin-bottom:12px"><h2>План погрузок</h2><button class="btn" data-act="newPlan">+ Погрузка</button></div>'+
 '<div class="notice">План — это будущие задания. Они не становятся рейсами и не попадают в реестр, пока логист не выдаст наряд.</div>'+
 (list.length?list.map(p=>'<div class="card"><div class="row wrap"><b>'+esc(p.date)+' · '+esc(p.time)+'</b>'+tag(p.orderId?'Наряд '+p.orderId:'Запланировано',p.orderId?'green':'orange')+'</div><div class="route">'+esc(p.place)+'</div><div class="muted">'+esc(p.cargo||'—')+' · '+esc(driverName(p.driverId))+' · план '+esc(p.targetTonnes||'—')+' т</div><div class="small">'+esc(p.note||'')+'</div><div class="actions"><button class="btn secondary" data-act="editPlan" data-id="'+esc(p.id)+'">✎ Изменить</button><button class="btn" data-act="issuePlan" data-id="'+esc(p.id)+'" '+(p.orderId?'disabled':'')+'>Выдать наряд →</button></div></div>').join(''):'<div class="card empty">План на выбранные даты пока пуст.</div>')}
function review(){
 const pending=db.orders.filter(x=>x.status==='review');
 return '<h2>Проверка выгрузок</h2><div class="notice">Водитель подтверждает свои данные первым. Логист проверяет документы, отмечает второе подтверждение и выбирает форму реестра. Без формы запись не утверждается.</div>'+
 (pending.length?pending.map(o=>'<div class="card">'+cardMini(o)+'<div class="soft"><b>ТТН '+esc(o.ttn||'не указан')+'</b><div class="small">Нетто погрузки '+esc(o.loadKg)+' кг · выгрузки '+esc(o.unloadKg)+' кг</div></div>'+
 thumbs(o)+'<div class="actions"><button class="btn" data-act="review" data-id="'+esc(o.id)+'">Проверить и утвердить</button><button class="btn warn" data-act="returnOrder" data-id="'+esc(o.id)+'">Вернуть на исправление</button></div></div>').join(''):'<div class="card empty">Пока нет отчётов, ожидающих подтверждения.</div>')}
function cardMini(o){return '<div class="row wrap"><b>'+esc(o.id)+' · '+esc(driverName(o.driverId))+'</b>'+tag(status(o),'orange')+'</div><div class="route">'+route(o)+'</div>'}
function thumbs(o){return (o.attachments||[]).slice(0,50).map(a=>jsPhoto(a.photo)?'<img class="thumb" alt="Талон / ТТН" src="'+a.photo+'">':'').join('')||(jsPhoto(o.photo)?'<img class="thumb" alt="ТТН" src="'+o.photo+'">':'<span class="small">Фото пока не предоставлены</span>')}
function money(){
 return '<h2>Подотчётные деньги водителей</h2><div class="notice">Подтверждённый баланс и заявленный водителем различаются, пока логист не проверил расходы. Деньги привязаны к водителю, а автомобиль указан для ориентира.</div>'+
 db.drivers.map(d=>{const t=totals(d.id),pending=db.cashEvents.filter(x=>x.driverId===d.id&&x.status==='pending').length,adv=db.cashEvents.filter(x=>x.driverId===d.id&&x.type==='advance'&&x.status==='issued').length;
 return '<div class="card"><div class="row wrap"><div><h2>'+esc(d.name)+'</h2><div class="small">'+esc(currentTruck(d.id))+' · суточных дней: '+allowanceCount(d.id)+'</div></div>'+tag(t.confirmed<1000?'Мало средств':'Баланс',t.confirmed<1000?'orange':'green')+'</div><div class="grid">'+stat('Подтверждено',UAH(t.confirmed))+stat('По отчёту водителя',UAH(t.declared))+'</div><div class="small">Заявленные траты на проверке: '+UAH(t.spentPending)+' · спорные: '+UAH(t.spentRejected)+' · выдачи к подтверждению: '+UAH(t.pendingIncoming)+'</div><div class="actions"><button class="btn" data-act="advance" data-id="'+d.id+'">+ Выдать деньги</button><button class="btn secondary" data-act="transactions" data-id="'+d.id+'">Операции'+(pending||adv?' ('+(pending+adv)+')':'')+'</button></div></div>'}).join('')}
function register(){
 const rows=db.demoRegister||[];
 return '<h2>Проверенные записи · реестры</h2><div class="notice">Тестовые записи внутри браузера. Это НЕ основной реестр ERP; в настоящем проекте уже предусмотрены раздельные формы 1 и 2 с серверной проверкой.</div>'+
 [1,2].map(f=>'<div class="card"><h2>Реестр '+f+' — '+(f===1?'Безнал':'Кэш')+'</h2>'+((rows.filter(x=>x.form===String(f))).map(x=>'<div class="soft"><div class="row"><b>'+esc(x.id)+'</b>'+tag('утверждено','green')+'</div><div class="muted">'+esc(x.from)+' → '+esc(x.to)+'</div><div class="small">'+esc(x.cargo)+' · '+esc(x.unloadKg)+' кг · № '+esc(x.ttn||'—')+'</div></div>').join('')||'<div class="empty">Пока пусто</div>')+'</div>').join('')}
function render(){ensure();let main=el('app');if(!authenticated){main.innerHTML=loginPage();return;}
 const tabs=[['overview','🏠','Обзор'],['orders','📋','Наряды'],['plan','📅','План'],['review','✅','Проверка'],['money','💳','Деньги'],['register','📚','Реестры']];
 const inner=({overview,orders,plan,review,money,register})[tab]();
 main.innerHTML='<div class="notice">⚠️ ДЕМОВЕРСИЯ: только вымышленные данные. Данные между разными телефонами НЕ синхронизируются. В этом браузере водитель и логист используют общее тестовое хранилище.</div>'+
 '<div class="row wrap" style="margin-bottom:12px"><div><h2>'+esc(tabs.find(x=>x[0]===tab)?.[2]||'')+'</h2><div class="small">'+fmt(now())+' · тестовая организация</div></div><div class="actions" style="margin:0"><button class="btn secondary" data-act="refresh">↻</button><button class="btn secondary" data-act="logout">Выйти</button></div></div>'+inner+
 '<nav class="nav">'+tabs.map(([id,icon,name])=>'<button data-go="'+id+'" class="'+(tab===id?'active':'')+'">'+icon+'<div>'+name+'</div></button>').join('')+'</nav>';
}
function modal(title,html,kind,id=''){modalId=id;el('modal').innerHTML='<div class="modal-bg"><div class="modal"><div class="modal-head"><h2>'+esc(title)+'</h2><button class="close" type="button" data-act="close">×</button></div><form id="formModal" data-kind="'+esc(kind)+'">'+html+'<div class="space"></div><button class="btn wfull" type="submit">Сохранить</button></form></div></div>'}
function hideModal(){el('modal').innerHTML='';modalId=''}
function val(n){return String(el(n)?.value??'').trim()}
function mandatory(n){const t=val(n);if(!t)throw Error('Заполните поле: '+n);return t}
function cashEvent(id){return db.cashEvents.find(x=>x.id===id)}
function open(act,id){
 if(act==='newOrder'||act==='editOrder'||act==='issuePlan'){
  const existing=db.orders.find(x=>x.id===id),p=db.plan.find(x=>x.id===id);
  const o=existing||{};
  modal(existing?'Изменить наряд':'Новый наряд',
  '<div class="fields"><div>'+select('driverId','Водитель',options(db.drivers),o.driverId||p?.driverId||'d1')+'</div><div>'+input('date','Дата выдачи','', 'type="date" value="'+day()+'"')+'</div><div>'+input('from','Откуда грузим',o.from||p?.place||'','required')+'</div><div>'+input('to','Пункт выгрузки (если известен)',o.to||'')+'</div><div>'+input('cargo','Культура',o.cargo||p?.cargo||'','required')+'</div><div>'+input('customer','Заказчик / хозяин груза',o.customer||'Тест Агро')+'</div><div>'+input('recipient','Фирма сдачи',o.recipient||'')+'</div><div>'+input('driverRate','Внутренняя ставка водителя, грн/т',o.driverRate||'','type="number" min="0" step="1"')+'</div></div>'+
 select('registerForm','Форма реестра', [['','Пока не определена'],['1','1 — Безнал'],['2','2 — Кэш']],o.registerForm||'')+
 textArea('note','Инструкции / где взять ТТН / контакт',o.note||''),
 'order',id);return
 }
 if(act==='directive'){
  const o=db.orders.find(x=>x.id===id);if(!o)return;
  modal('Указание водителю · '+o.id,
  select('directiveType','Тип указания',[['intermediate','Промежуточный маршрут'],['final','Окончательное назначение'],['home','Отпустить домой (остановить суточные)']])+
  input('to','Конечный пункт выгрузки',o.to||'')+
  input('recipient','Фирма сдачи',o.recipient||'')+
  select('registerForm','Форма реестра',[['','Не изменять'],['1','1 — Безнал'],['2','2 — Кэш']])+
  textArea('note','Сообщение водителю / инструкция','')+
  '<div class="soft small">Промежуточное указание не превращается в конечный пункт выгрузки. Водитель должен подтвердить получение. Состояние «дома» активируется после его подтверждения.</div>',
  'directive',id);return
 }
 if(act==='newPlan'||act==='editPlan'){
  const p=db.plan.find(x=>x.id===id)||{};
  modal('План погрузки', '<div class="fields"><div>'+input('date','Дата',p.date||day(),'type="date" required')+'</div><div>'+input('time','Время',p.time||'08:00','type="time" required')+'</div><div>'+select('driverId','Водитель',options(db.drivers),p.driverId||'d1')+'</div><div>'+input('place','Место загрузки',p.place||'','required')+'</div><div>'+input('cargo','Культура',p.cargo||'','required')+'</div><div>'+input('targetTonnes','План, тонн',p.targetTonnes||'','type="number" min="1"')+'</div></div>'+textArea('note','Примечание',p.note||''),'plan',id);return;
 }
 if(act==='review'){
  const o=db.orders.find(x=>x.id===id);if(!o)return;
  modal('Проверка отчёта · '+o.id,
  '<div class="soft"><b>'+route(o)+'</b><div class="small">Тара: '+esc(o.tareKg)+' · брутто: '+esc(o.grossKg)+' · нетто: '+esc(o.loadKg)+' · выгружено: '+esc(o.unloadKg)+' кг</div></div>'+thumbs(o)+
  input('to','Конечный пункт выгрузки',o.to||'','required')+input('recipient','Фирма сдачи',o.recipient||'')+
  select('registerForm','Форма реестра',[['','Нужно выбрать'],['1','1 — Безнал'],['2','2 — Кэш']],o.registerForm||'')+
  check('approved','Я сверил данные с фотографиями и подтверждаю правильность реестра'),
  'review',id);return;
 }
 if(act==='returnOrder'){modal('Вернуть данные водителю',textArea('reason','Что нужно исправить?'), 'returnOrder',id);return}
 if(act==='advance'){
  modal('Выдать деньги · '+driverName(id),input('amount','Сумма, грн','','type="number" required min="1"')+
  select('issuer','Выдал',[['logist','Логист'],['mechanic','Механик'],['accountant','Бухгалтер'],['other','Другой сотрудник']])+
  select('method','Способ',[['cash','Наличные'],['card','Перевод на карту']])+
  textArea('note','Комментарий / основание'),'advance',id);return
 }
 if(act==='transactions'){
  const events=db.cashEvents.filter(x=>x.driverId===id).slice().reverse();
  const allowances=db.allowances.filter(x=>x.driverId===id).slice().reverse();
  modal('Операции · '+driverName(id),'<h3>Деньги и расходы</h3>'+
  (events.length?events.map(x=>'<div class="soft"><b>'+esc(x.type==='advance'?'Поступление':'Расход')+' · '+UAH(x.amount)+'</b><div class="small">'+esc(x.category||x.issuer||'')+' · '+fmt(x.at)+' · '+esc(x.status)+'</div><div class="muted">'+esc(x.note||'')+'</div>'+
  (jsPhoto(x.photo)?'<img class="thumb" alt="Подтверждение" src="'+x.photo+'">':'')+
  (x.type==='expense'&&x.status==='pending'?'<div class="actions"><button type="button" class="btn secondary" data-act="expenseApprove" data-id="'+esc(x.id)+'">✓ Подтвердить</button><button type="button" class="btn warn" data-act="expenseReject" data-id="'+esc(x.id)+'">Вернуть</button></div>':'')+'</div>').join(''):'<div class="empty">Операций пока нет</div>')+
  '<h3>Суточные</h3>'+allowances.map(x=>'<div class="soft">'+esc(x.day)+' · '+UAH(x.amount)+' · автоматически · '+esc(x.type||'Рабочий день')+'</div>').join('')+
  '<button type="button" data-act="close" class="btn secondary wfull">Закрыть</button>','view',id);return;
 }
}
function submit(kind){
 ensure();const id=modalId;
 if(kind==='order'){
  const p=db.plan.find(x=>x.id===id),o=db.orders.find(x=>x.id===id);
  const r={driverId:mandatory('driverId'),from:mandatory('from'),to:val('to'),cargo:mandatory('cargo'),customer:val('customer'),recipient:val('recipient'),registerForm:val('registerForm'),driverRate:val('driverRate')?Number(val('driverRate')):null,note:val('note')};
  if(o){Object.assign(o,r);o.updatedAt=now();o.revision=(o.revision||0)+1;audit('Изменение наряда',o.id)}
  else{const obj={id:'R-'+(db.orderNumber++),status:'assigned',createdAt:now(),ttn:'',loadKg:null,unloadKg:null,photo:null,attachments:[],segments:[],pauses:[],...r};
   db.orders.push(obj);audit('Наряд выдан',obj.id);if(p)p.orderId=obj.id;
   if(r.note)db.messages.push({id:'M'+ids(),driverId:r.driverId,tripId:obj.id,kind:'in',directiveType:'initial',message:r.note,at:now(),acknowledgedAt:null,revision:1});
  }return;
 }
 if(kind==='plan'){
  const p=db.plan.find(x=>x.id===id);const r={date:mandatory('date'),time:mandatory('time'),driverId:mandatory('driverId'),place:mandatory('place'),cargo:mandatory('cargo'),targetTonnes:val('targetTonnes'),note:val('note')};
  if(p)Object.assign(p,r);else db.plan.push({id:'PL'+ids(),...r});
  audit('План погрузок изменён');return;
 }
 if(kind==='directive'){
  const o=db.orders.find(x=>x.id===id);if(!o)throw Error('Наряд не найден');const type=val('directiveType'),note=mandatory('note');if(type==='final'&&!val('to'))throw Error('Для окончательного указания требуется пункт выгрузки');
  if(type==='final')o.to=val('to');if(val('recipient'))o.recipient=val('recipient');if(val('registerForm'))o.registerForm=val('registerForm');
  o.revision=(o.revision||0)+1;db.messages.push({id:'M'+ids(),driverId:o.driverId,tripId:o.id,kind:'in',directiveType:type,message:note+(type==='final'?' · Выгрузка: '+o.to:''),at:now(),revision:o.revision,acknowledgedAt:null});audit('Указание '+type,o.id,note);return;
 }
 if(kind==='review'){
  const o=db.orders.find(x=>x.id===id);if(!o||o.status!=='review')throw Error('Уже обработано или отчёт не готов');
  if(!el('approved').checked)throw Error('Требуется проверка по оригиналам');
  const form=mandatory('registerForm'),to=mandatory('to');if(!['1','2'].includes(form))throw Error('Укажите форму');if(!Number.isFinite(o.unloadKg)||!Number.isFinite(o.loadKg))throw Error('Не хватает весов');
  if(db.demoRegister.some(x=>x.id===id))throw Error('Запись уже существует');Object.assign(o,{to,recipient:val('recipient'),registerForm:form,status:'done',approvedAt:now()});
  db.demoRegister.push({id:o.id,form,from:o.from,to,cargo:o.cargo,unloadKg:o.unloadKg,ttn:o.ttn||'',approvedAt:o.approvedAt});audit('Реестр утверждён',id,'Форма '+form);return;
 }
 if(kind==='returnOrder'){
  const o=db.orders.find(x=>x.id===id);if(!o||o.status!=='review')throw Error('Нет ожидающего отчёта');
  const reason=mandatory('reason');o.status='active';o.returnReason=reason;db.messages.push({id:'M'+ids(),driverId:o.driverId,tripId:o.id,kind:'in',directiveType:'correction',message:'Вернули на исправление: '+reason,at:now(),acknowledgedAt:null});
  audit('Вернули на исправление',id,reason);return;
 }
 if(kind==='advance'){
  const amt=Number(mandatory('amount'));if(!(amt>0&&amt<1000000))throw Error('Проверьте сумму');
  db.cashEvents.push({id:'C'+ids(),driverId:id,type:'advance',amount:amt,issuer:val('issuer'),method:val('method'),note:val('note'),at:now(),status:'issued'});
  audit('Выдача денег',id,UAH(amt)+' ожидает подтверждения водителя');return;
 }
}
document.addEventListener('click',ev=>{
 const btn=ev.target.closest('[data-act],[data-go]');if(!btn)return;
 const go=btn.getAttribute('data-go');if(go){tab=go;hideModal();render();window.scrollTo(0,0);return}
 const act=btn.getAttribute('data-act'),id=btn.getAttribute('data-id')||'';
 if(act==='close'){hideModal();return}
 if(act==='logout'){authenticated=false;sessionStorage.removeItem('logist-demo-session');render();return}
 if(act==='refresh'){reload();return}
 if(act==='expenseApprove'||act==='expenseReject'){
  db=read();ensure();const x=cashEvent(id);if(!x||x.type!=='expense'||x.status!=='pending')return;
  x.status=act==='expenseApprove'?'approved':'rejected';x.reviewedAt=now();audit(x.status==='approved'?'Расход подтверждён':'Расход возвращён',x.tripId||'',UAH(x.amount));persist();hideModal();render();return;
 }
 open(act,id)
});
document.addEventListener('submit',ev=>{
 if(ev.target.id==='loginForm'){ev.preventDefault();if(el('loginPin').value==='9090'){authenticated=true;sessionStorage.setItem('logist-demo-session','yes');render()}else alert('Неверный тестовый PIN');return}
 if(ev.target.id!=='formModal')return;ev.preventDefault();const btn=ev.target.querySelector('button[type=submit]');if(btn)btn.disabled=true;
 try{db=read();ensure();submit(ev.target.dataset.kind);persist();hideModal();render()}catch(err){alert(err.message);if(btn)btn.disabled=false}
});
window.addEventListener('storage',ev=>{if(ev.key===KEY)reload()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
reload();