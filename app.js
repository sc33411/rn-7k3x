const $=s=>document.querySelector(s);
const LS={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let me=LS.get('me',null), pressedAt=LS.get('pressedAt',null), pos=null, heading=null, setup=false, watchId=null;
const overrides=LS.get('placeOverrides',{});
const places=()=>{const o={};for(const k in CONFIG.places)o[k]={...CONFIG.places[k],...(overrides[k]||{})};return o};
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}

const rad=d=>d*Math.PI/180;
function dist(a,b){const R=6371000,dLa=rad(b.lat-a.lat),dLo=rad(b.lon-a.lon);const x=Math.sin(dLa/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function bearing(a,b){const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat));const x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));return (Math.atan2(y,x)*180/Math.PI+360)%360}
const fmtD=m=>m<1000?Math.round(m)+' m':(m/1000).toFixed(m<10000?1:0)+' km';
const dayStart=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
function dayCount(){return Math.round((dayStart(new Date())-dayStart(pressedAt))/864e5)}
function stageFor(n){return CONFIG.stages.find(s=>n>=s.fromDay&&n<=s.toDay)||CONFIG.stages[CONFIG.stages.length-1]}
function curStage(){const m=LS.get('stageOverride',null);if(m)return CONFIG.stages.find(s=>s.id===m);return stageFor(dayCount())}
function slotDate(t,addDays){const [h,m]=t.split(':').map(Number);const d=dayStart(new Date());d.setDate(d.getDate()+addDays);d.setHours(h,m,0,0);return d}
function nextSlotIdx(st){const now=new Date();for(let i=0;i<st.slots.length;i++){if(slotDate(st.slots[i].t,0)>=new Date(now-30*60000))return i}return 0}

function startGeo(){if(watchId!=null||!navigator.geolocation)return;watchId=navigator.geolocation.watchPosition(p=>{pos={lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy};update()},()=>{},{enableHighAccuracy:true,maximumAge:10000})}
function startCompass(){const h=e=>{if(e.webkitCompassHeading!=null)heading=e.webkitCompassHeading;else if(e.absolute&&e.alpha!=null)heading=(360-e.alpha)%360;update()};
 const add=()=>{window.addEventListener('deviceorientationabsolute',h,true);window.addEventListener('deviceorientation',h,true)};
 if(typeof DeviceOrientationEvent!=='undefined'&&DeviceOrientationEvent.requestPermission)DeviceOrientationEvent.requestPermission().then(r=>{if(r==='granted')add()}).catch(()=>{});else add()}

function render(){
  const app=$('#app');
  if(!me){app.innerHTML=`<h1>가족 재회</h1><div class="sub">개인 코드를 입력하세요</div><div class="card" id="login"><input id="code" inputmode="numeric" placeholder="개인 코드"><button id="go">로그인</button><div class="warn" id="err"></div></div>`;
    $('#go').onclick=()=>{const f=CONFIG.family.find(x=>x.code===$('#code').value.trim());if(f){me=f.name;LS.set('me',me);render()}else $('#err').textContent='코드가 맞지 않습니다'};return}
  startGeo();
  if(!pressedAt){app.innerHTML=`<h1>${me}님, 안녕하세요</h1><div class="sub">평소에는 이 화면입니다. 설치 후 비행기 모드에서도 열리는지 꼭 확인하세요.</div>
   <div class="card"><button class="war" id="war">⚠ 전시상황</button><div class="muted" style="margin-top:8px">누르면 "전쟁 난 지 며칠"을 물어보고 집결 규칙을 시작합니다. 늦게 눌렀다면 며칠 지났는지 입력하세요.</div></div>
   <div class="card noprint"><button id="prev">규칙 미리보기 / 종이 카드 인쇄</button><button id="setupBtn">설정 모드 (장소 좌표 보정)</button><button id="logout">로그아웃</button></div><div id="extra"></div>`;
    $('#war').onclick=()=>{const v=prompt('전쟁이 난 지 며칠 지났나요? (오늘 시작이면 0)','0');if(v===null)return;const n=Math.max(0,parseInt(v,10)||0);const d=dayStart(new Date());d.setDate(d.getDate()-n);pressedAt=d.toISOString();LS.set('pressedAt',pressedAt);render()};
    $('#prev').onclick=showCard;$('#setupBtn').onclick=()=>{setup=!setup;showSetup()};$('#logout').onclick=()=>{me=null;LS.set('me',null);render()};return}
  const st=curStage(),P=places(),ni=nextSlotIdx(st),n=dayCount();
  app.innerHTML=`<h1>${me} · 전시상황</h1><div class="sub">전쟁 ${n}일째 (D+${n})</div>
  <div class="card"><div class="stage big">${st.title}</div><div class="muted">${st.note}</div></div>
  <div class="card"><div class="muted">오늘의 집결 (기기 시각 기준)</div>${st.slots.map((s,i)=>`<div class="slot ${i===ni?'next':''}"><div class="row"><b>${s.t}</b><span>${P[s.p].name}</span></div><div class="muted">${P[s.p].desc}</div>${i===ni?`<div id="nav"></div>`:''}</div>`).join('')}</div>
  <div class="card noprint"><div class="row"><button class="sm" id="comp">나침반 켜기</button><button class="sm" id="chk">✔ 도착 체크인</button></div><div class="muted" id="log"></div></div>
  <div class="card noprint"><button id="prev">종이 카드 인쇄</button><button id="fix">날짜 보정 (전쟁 난 지 며칠?)</button><button id="stg">단계 수동 변경</button><button id="setupBtn">설정 모드</button><button id="reset">전시상황 해제</button></div><div id="extra"></div>`;
  $('#comp').onclick=startCompass;
  $('#chk').onclick=()=>{const L=LS.get('log',[]);L.unshift({t:new Date().toLocaleString('ko-KR'),p:st.slots[ni].p,pos});LS.set('log',L.slice(0,50));update()};
  $('#prev').onclick=showCard;$('#setupBtn').onclick=()=>{setup=!setup;showSetup()};
  $('#fix').onclick=()=>{const v=prompt('전쟁이 난 지 며칠 지났나요?',String(n));if(v===null)return;const k=Math.max(0,parseInt(v,10)||0);const d=dayStart(new Date());d.setDate(d.getDate()-k);pressedAt=d.toISOString();LS.set('pressedAt',pressedAt);render()};
  $('#stg').onclick=()=>{const v=prompt('단계 번호 (1/2/3). 비우면 자동','');if(v===null)return;LS.set('stageOverride',v===''?null:Number(v));render()};
  $('#reset').onclick=()=>{if(confirm('해제할까요? (D-day 기록 삭제)')){pressedAt=null;LS.set('pressedAt',null);LS.set('stageOverride',null);render()}};
  update();
}
function update(){
  if(!pressedAt||!me)return;const nav=$('#nav');if(!nav)return;
  const st=curStage(),P=places(),s=st.slots[nextSlotIdx(st)],pl=P[s.p],when=slotDate(s.t,0);
  let h=`<div class="muted">약속 시각까지 ${Math.max(0,Math.round((when-new Date())/60000))}분</div>`;
  if(pos){const d=dist(pos,pl),b=bearing(pos,pl),rot=heading==null?b:b-heading;
   h+=`<svg id="arrow" viewBox="0 0 100 100" style="transform:rotate(${rot}deg)"><path d="M50 8 78 80 50 64 22 80z" fill="#c0392b"/></svg><div class="big" style="text-align:center">${fmtD(d)}</div><div class="muted" style="text-align:center">${heading==null?'북쪽 기준 방위 '+Math.round(b)+'° (나침반을 켜면 실제 방향)':'화살표 방향으로 이동'} · GPS 오차 ±${Math.round(pos.acc)}m</div>`}
  else h+=`<div class="muted">GPS 신호 대기 중… 야외에서 위치 권한을 허용하세요.</div>`;
  nav.innerHTML=h;
  const L=LS.get('log',[]);const lg=$('#log');if(lg)lg.innerHTML=L.slice(0,3).map(x=>`${x.t} · ${places()[x.p].name}`).join('<br>')||'체크인 기록 없음';
}
function showCard(){
  const P=places();$('#extra').innerHTML=`<div class="card"><h1>가족 재회 카드</h1>${CONFIG.stages.map(st=>`<div class="slot"><b>${st.title}</b><div class="muted">${st.note}</div>${st.slots.map(s=>`<div>${s.t} → ${P[s.p].name} <span class="muted">(${P[s.p].lat.toFixed(4)}, ${P[s.p].lon.toFixed(4)})</span></div>`).join('')}</div>`).join('')}<div class="muted">D-day 기준 일수: 1단계 0~2일, 2단계 3~6일, 3단계 7일~</div><button class="noprint" onclick="window.print()">인쇄</button></div>`;
}
function showSetup(){
  const el=$('#extra');if(!setup){el.innerHTML='';return}
  const P=places();el.innerHTML=`<div class="card"><b>설정 모드</b><div class="warn">해당 장소에 서서 "현재 위치로 저장"을 누르면 좌표가 보정됩니다 (이 기기에만 저장). 가족 모두의 기기에서 각자 하거나, data.js의 값을 고치세요.</div>${Object.keys(P).map(k=>`<div class="slot"><b>${P[k].name}</b><div class="muted">${P[k].lat.toFixed(5)}, ${P[k].lon.toFixed(5)}</div><button class="sm" data-k="${k}">현재 위치로 저장</button></div>`).join('')}</div>`;
  el.querySelectorAll('button[data-k]').forEach(b=>b.onclick=()=>{if(!pos){alert('GPS 위치를 아직 못 잡았습니다');return}overrides[b.dataset.k]={lat:pos.lat,lon:pos.lon};LS.set('placeOverrides',overrides);showSetup()});
}
render();setInterval(update,5000);
