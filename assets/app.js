import{liveBoard}from'./board.js';
if(location.hash.startsWith('#t=')){localStorage.setItem('jl_tok',location.hash.slice(3));history.replaceState(null,'',location.pathname)}
const sb=supabase.createClient(CFG.URL,CFG.KEY),$=i=>document.getElementById(i);let tok=localStorage.getItem('jl_tok'),S=null,skew=0,busy=0,boardLoaded=0;
const fmt=s=>{s=Math.max(0,Math.floor(s));const p=n=>String(n).padStart(2,'0');return`${Math.floor(s/3600)}:${p(Math.floor(s/60)%60)}:${p(s%60)}`};
const rpc=async(f,a)=>{const{data,error}=await sb.rpc(f,a);if(error)throw error;return data};
$('join').onclick=async()=>{try{$('err').textContent='';const r=await rpc('join_team',{p_pass:$('pw').value,p_name:$('tn').value});tok=r.token;localStorage.setItem('jl_tok',tok);boot()}catch(e){$('err').textContent=e.message}};
function tab(b){$('game').classList.toggle('hide',b);$('board').classList.toggle('hide',!b);$('tg').setAttribute('aria-selected',!b);$('tt').setAttribute('aria-selected',b);if(b&&!boardLoaded){boardLoaded=1;liveBoard(sb,$('board'))}}
$('tg').onclick=()=>tab(false);$('tt').onclick=()=>tab(true);
async function refresh(){if(!tok||busy)return;try{S=await rpc('team_state',{tok});skew=new Date(S.now)-Date.now();draw()}catch(e){if(/relace/.test(e.message)){localStorage.removeItem('jl_tok');location.reload()}}}
function draw(){$('gate').classList.add('hide');$('app').classList.remove('hide');$('tname').textContent=S.name;
const run=S.status==='running';$('start').classList.toggle('hide',S.status!=='new');$('act').classList.toggle('hide',!run);$('fin').classList.toggle('hide',S.status!=='finished');
$('prog').textContent=run?`Stanoviště ${S.ord} z ${S.total}`:'';$('clue').textContent=S.clue||'';
$('q').classList.toggle('hide',!S.question);$('qt').textContent=S.question||'';
const open=S.help==='requested'||S.help==='in_conversation';$('cancel').classList.toggle('hide',S.help!=='requested');$('say').classList.toggle('hide',!open);$('help').disabled=!!S.help&&S.help!=='cancelled';
$('hs').textContent={requested:'Žádost odeslána – čeká se na Otce Furu',in_conversation:'Otec Fura odpověděl',resolved:'Pomoc uzavřena (jedna placená pomoc na stanoviště)'}[S.help]||$('hs').textContent;
$('chat').replaceChildren(...S.chat.map(m=>{const d=document.createElement('div');d.className='msg '+(m.host?'host':'me');d.textContent=(m.host?'Otec Fura: ':'Vy: ')+m.body+' ('+new Date(m.at).toLocaleTimeString('cs')+')';return d}))}
setInterval(()=>{if(S?.started_at)$('clock').textContent=fmt(((S.finished_at?new Date(S.finished_at):Date.now()+skew)-new Date(S.started_at))/1e3)+(S.penalty_s?` (+${fmt(S.penalty_s)} penalizace)`:'')},1000);
const once=(btn,fn)=>btn.onclick=async()=>{if(busy)return;busy=1;btn.disabled=true;try{await fn()}catch(e){alert(e.message)}finally{busy=0;btn.disabled=false;refresh()}};
once($('start'),()=>rpc('start_team',{tok}));
once($('gps'),()=>new Promise((res,rej)=>navigator.geolocation?navigator.geolocation.getCurrentPosition(async p=>{try{const ok=await rpc('check_gps',{tok,lat:p.coords.latitude,lon:p.coords.longitude});$('gmsg').textContent=ok?'Poloha ověřena.':'Ještě nejste na místě';res()}catch(e){rej(e)}},()=>{$('gmsg').textContent='Polohu se nepodařilo získat (oprávnění/časový limit/GPS). Zkuste znovu.';res()},{enableHighAccuracy:true,timeout:20000}):rej(new Error('Zařízení nepodporuje geolokaci'))));
once($('send'),async()=>{const r=await rpc('submit_answer',{tok,ans:$('ans').value});$('amsg').textContent=r.ok?'Správně! Odemkla se další nápověda.':'To není správná odpověď. Zkuste to znovu.';$('ans').value=''});
once($('help'),()=>rpc('request_help',{tok}));once($('cancel'),()=>rpc('cancel_help',{tok}));
once($('ms'),async()=>{await rpc('team_msg',{tok,b:$('mt').value,cid:crypto.randomUUID()});$('mt').value=''});
function boot(){refresh();setInterval(refresh,4000);sb.channel('p').on('postgres_changes',{event:'*',schema:'public',table:'ping'},refresh).subscribe()}
if(tok)boot();
