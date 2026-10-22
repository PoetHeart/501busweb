'use strict';
const API='https://rt.data.gov.hk/v2/transport/citybus/';
const $=id=>document.getElementById(id);
let stops=window.ROUTE_STOPS||[],selected,arrivals=[],controller,requestId=0,nextRefresh=Date.now()+30000,lastDataTime=null,hasResponse=false,loadFailed=false;
try{selected=localStorage.getItem('b3a-stop')}catch{}
const time=d=>new Date(d).toLocaleTimeString('zh-CN',{timeZone:'Asia/Hong_Kong',hour12:false,hour:'2-digit',minute:'2-digit'});
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function getJSON(path,signal){const response=await fetch(API+path,{signal,cache:'no-cache'});if(!response.ok)throw new Error('HTTP '+response.status);return response.json()}
function setStatus(message,type=''){$('connection').textContent=message;$('connection').className='status '+type}
function renderStops(){
 const query=$('search').value.trim().toLowerCase();$('stops').replaceChildren();$('stop-count').textContent=stops.length+' 个站';
 const matched=stops.filter(s=>(s.name_sc+s.name_tc+s.name_en).toLowerCase().includes(query));
 for(const s of matched){const terminal=s===stops[stops.length-1];const button=document.createElement('button');button.type='button';button.className='stop'+(s.stop===selected?' active':'');button.disabled=terminal;button.setAttribute('aria-pressed',String(s.stop===selected));button.innerHTML=`<span class="stop-num">${String(s.seq).padStart(2,'0')}</span><span><strong>${escapeHTML(s.name_sc.split(',')[0])}</strong><small>${terminal?'终点站 · 只供下车':escapeHTML(s.name_sc.split(',').slice(1).join(',').trim()||s.name_en)}</small></span>`;button.addEventListener('click',()=>selectStop(s.stop));$('stops').append(button)}
 if(!matched.length){const p=document.createElement('p');p.className='empty';p.style.minHeight='100px';p.textContent='没有找到车站，试试其他关键词';$('stops').append(p)}
}
function selectStop(id){selected=id;try{localStorage.setItem('b3a-stop',id)}catch{}const stop=stops.find(s=>s.stop===id);$('current-stop').textContent=stop.name_sc.split(',')[0];$('stop-en').textContent=stop.name_en;$('map-link').href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.lat+','+stop.long)}`;renderStops();arrivals=[];hasResponse=false;lastDataTime=null;loadFailed=false;$('arrivals').innerHTML='<div class="empty">正在获取实时到站信息…</div>';$('updated').textContent='等待数据更新';refresh()}
function renderArrivals(){if(!hasResponse)return;
 const usable=arrivals.filter(a=>a.eta&&Number.isFinite(Date.parse(a.eta))&&Date.parse(a.eta)>Date.now()-60000).sort((a,b)=>Date.parse(a.eta)-Date.parse(b.eta)).slice(0,3);
 if(!usable.length){const remark=arrivals.find(a=>a.rmk_sc||a.rmk_tc);$('arrivals').innerHTML=`<div class="empty"><strong>暂无预计到站时间</strong><span>${escapeHTML(remark?(remark.rmk_sc||remark.rmk_tc):'官方暂未提供该站的班次预测。')}<br>请稍后刷新或查看城巴官方资讯。</span></div>`;return}
 $('arrivals').innerHTML=usable.map((a,i)=>{const minutes=Math.max(0,Math.ceil((Date.parse(a.eta)-Date.now())/60000));return `<div class="arrival${i===0?' first':''}"><div><div class="arrival-label"><span class="ordinal">0${i+1}</span>${i===0?'下一班到站':'随后班次'}</div><div class="arrival-time">预计 ${time(a.eta)} 到站</div>${a.rmk_sc||a.rmk_tc?`<div class="remark">${escapeHTML(a.rmk_sc||a.rmk_tc)}</div>`:''}</div><div class="eta">${minutes===0?'<b style="font-size:28px;letter-spacing:0">即将到站</b>':`<b>${minutes}</b> 分钟`}</div></div>`}).join('');
}
function updateFreshness(){if(!lastDataTime)return;const stale=Date.now()-Date.parse(lastDataTime)>120000;if(stale&&!loadFailed)setStatus('数据已超过 2 分钟，请谨慎参考','error');$('updated').textContent=`数据时间 ${time(lastDataTime)}${stale?' · 可能已过期':''}`;$('refresh-dot').style.background=stale||loadFailed?'#bb8b44':'#6a9442'}
async function refresh(){
 controller?.abort();controller=new AbortController();const currentController=controller;const id=++requestId,stopId=selected;const timer=setTimeout(()=>currentController.abort(),15000);$('refresh').disabled=true;$('refresh').textContent='↻ 更新中…';$('arrivals').setAttribute('aria-busy','true');setStatus('正在更新官方数据…');
 try{const json=await getJSON('eta/CTB/'+stopId+'/B3A',controller.signal);if(id!==requestId)return;if(!Array.isArray(json.data))throw new Error('Invalid data');arrivals=json.data.filter(a=>a.dir==='O'&&a.route==='B3A'&&a.stop===stopId);hasResponse=true;loadFailed=false;lastDataTime=arrivals.map(a=>a.data_timestamp).filter(Boolean).sort().at(-1)||json.generated_timestamp;setStatus('官方数据已连接','ok');renderArrivals();updateFreshness()}
 catch(error){if(id!==requestId)return;loadFailed=true;setStatus('连接失败 · 请重试','error');if(!hasResponse)$('arrivals').innerHTML='<div class="empty"><strong>暂时无法获取到站数据</strong><span>请检查网络连接，然后点击“手动刷新”。<br>实时数据需要联网，页面不会展示模拟班次。</span></div>';else{$('updated').textContent='更新失败 · 保留上次数据';$('refresh-dot').style.background='#bb8b44'}}
 finally{clearTimeout(timer);if(id===requestId){$('refresh').disabled=false;$('refresh').textContent='↻ 手动刷新';$('arrivals').setAttribute('aria-busy','false');nextRefresh=Date.now()+30000}}
}
async function init(){
 if(stops.length){if(!stops.slice(0,-1).some(s=>s.stop===selected))selected=stops[0].stop;selectStop(selected)}
 try{const route=await getJSON('route-stop/CTB/B3A/outbound',AbortSignal.timeout(15000));const fresh=await Promise.all(route.data.map(async s=>({...s,...(await getJSON('stop/'+s.stop,AbortSignal.timeout(15000))).data})));if(!fresh.length)throw new Error('No stops');stops=fresh;if(!stops.slice(0,-1).some(s=>s.stop===selected)){selectStop(stops[0].stop)}else{renderStops();const current=stops.find(s=>s.stop===selected);$('current-stop').textContent=current.name_sc.split(',')[0];$('stop-en').textContent=current.name_en}}
 catch{if(!stops.length)setStatus('车站加载失败，请重新打开页面','error');else $('stop-count').textContent=stops.length+' 个站 · 本地站表'}
}
$('search').addEventListener('input',renderStops);$('refresh').addEventListener('click',refresh);$('auto').addEventListener('change',()=>{nextRefresh=Date.now()+30000;tick()});
function tick(){const now=new Date();$('clock').textContent=now.toLocaleTimeString('zh-CN',{timeZone:'Asia/Hong_Kong',hour12:false});$('next-refresh').textContent=$('auto').checked?Math.max(0,Math.ceil((nextRefresh-Date.now())/1000))+' 秒后更新':'自动刷新已暂停';if(hasResponse){renderArrivals();if(!loadFailed)updateFreshness()}if($('auto').checked&&Date.now()>=nextRefresh&&!$('refresh').disabled&&!document.hidden)refresh()}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('auto').checked&&Date.now()>=nextRefresh&&!$('refresh').disabled)refresh()});
window.addEventListener('offline',()=>setStatus('网络已断开 · 数据可能已过期','error'));window.addEventListener('online',()=>{if(selected)refresh()});
tick();setInterval(tick,1000);init();
