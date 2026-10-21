import{liveBoard,renderBoard}from'./board.js';
const sb=supabase.createClient(CFG.URL,CFG.KEY),$=i=>document.getElementById(i);let sel=null,sound=false,known=new Set(),H=[];
$('go').onclick=async()=>{const{error}=await sb.auth.signInWithPassword({email:$('em').value,password:$('pw').value});if(error)return $('err').textContent=error.message;init()};
function beep(){try{const c=new AudioContext(),o=c.createOscillator();o.connect(c.destination);o.frequency.value=880;o.start();o.stop(c.currentTime+.25)}catch{}}
const pend=()=>new Set(H.filter(h=>h.status==='requested').map(h=>h.team_id));
function openConv(team,help){const h=H.find(x=>x.id===help)||H.find(x=>x.team_id===team&&x.status!=='cancelled');if(!h)return;sel={team:h.team_id,help:h.id};$('conv').classList.remove('hide');$('to').textContent=`Odpověď týmu: ${h.teams.name} (stanoviště ${h.ord}) – první odpověď započte penalizaci`;msgs()}
async function msgs(){const s=sel;if(!s)return;const{data}=await sb.from('chat').select('*').eq('help_id',s.help).order('at');if(sel!==s)return;$('msgs').replaceChildren(...data.map(m=>{const d=document.createElement('div');d.className='msg '+(m.from_host?'me':'host');d.textContent=(m.from_host?'Otec Fura: ':'Tým: ')+m.body;return d}))}
async function loadH(){const r=await sb.from('help').select('*,teams(name)').order('created_at',{ascending:false});H=r.data||[];
H.filter(h=>h.status==='requested'&&!known.has(h.id)).forEach(h=>{known.add(h.id);if(sound)beep()});
$('sum').textContent=`Čekající žádosti o pomoc: ${pend().size}`;
$('list').replaceChildren(...H.filter(h=>h.status!=='cancelled').sort((a,b)=>(b.status==='requested')-(a.status==='requested')).map(h=>{const b=document.createElement('button');b.className='card'+(h.status==='requested'?' alert':'');b.textContent=`${h.teams.name} · stanoviště ${h.ord} · ${h.status}`;b.onclick=()=>openConv(h.team_id,h.id);return b}));msgs()}
async function teams(){const[t,c,a]=await Promise.all([sb.from('teams').select('*').order('id'),sb.from('completions').select('*').order('ord'),sb.from('attempts').select('*').order('at')]);const root=$('p2');root.replaceChildren();
t.data.forEach(tm=>{const d=document.createElement('details');d.className='card';const s=document.createElement('summary');s.textContent=`${tm.name} (#${tm.id}) – ${tm.status}`;d.append(s);
const st=tm.started_at&&new Date(tm.started_at),p=document.createElement('p');p.textContent=`Start: ${tm.started_at||'—'} · Cíl: ${tm.finished_at||'—'} · penalizace ${tm.penalty_s} s`;d.append(p);
c.data.filter(x=>x.team_id===tm.id).forEach((x,i,arr)=>{const q=document.createElement('div');q.textContent=`St. ${x.ord}: mezičas ${st?Math.round((new Date(x.at)-st)/1e3):'—'} s · úsek ${st?Math.round((new Date(x.at)-(i?new Date(arr[i-1].at):st))/1e3):'—'} s`;d.append(q)});
a.data.filter(x=>x.team_id===tm.id).forEach(x=>{const q=document.createElement('div');q.className='stat';q.textContent=`${new Date(x.at).toLocaleTimeString('cs')} st.${x.ord} ${x.kind}: ${x.value} → ${x.ok?'správně':'špatně'}`;d.append(q)});
['dnf','disqualified','ended'].forEach(k=>{const b=document.createElement('button');b.textContent=k.toUpperCase();b.onclick=async()=>{const r=prompt('Důvod (zapíše se do auditu):');if(!r)return;const{error}=await sb.rpc('host_set',{p_team:tm.id,p_status:k,p_reason:r});if(error)alert(error.message);else teams()};d.append(b)});root.append(d)})}
async function ctl(){const{data:r}=await sb.from('runs').select('*').eq('active',true).limit(1).single();const{data:prob}=await sb.rpc('host_readiness');const c=$('ctl');c.replaceChildren();
const line=t=>{const p=document.createElement('p');p.textContent=t;return p};
const btn=(t,fn)=>{const b=document.createElement('button');b.textContent=t;b.onclick=async()=>{const{error}=await fn();if(error)alert(error.message);ctl();testBoard()};return b};
c.append(line(`Registrace: ${r.reg_open?'OTEVŘENÁ':'zavřená'} · Testovací režim: ${r.test_mode?'ZAPNUTÝ (nové týmy jsou testovací)':'vypnutý'}`),
btn(r.reg_open?'Zavřít registraci':'Otevřít registraci',()=>sb.rpc('host_settings',{p_reg:!r.reg_open,p_test:r.test_mode})),
btn(r.test_mode?'Vypnout testovací režim':'Zapnout testovací režim',()=>sb.rpc('host_settings',{p_reg:r.reg_open,p_test:!r.test_mode})),
btn('Vytvořit testovací tým',async()=>{const{data,error}=await sb.rpc('host_make_test_team');if(!error)prompt('Odkaz pro testovací tým (otevřete ho na telefonu; přepíše tam uložený tým):',location.href.split('#')[0].replace('host.html','index.html')+'#t='+data);return{error}}));
if(prob?.length){const u=document.createElement('ul');prob.forEach(x=>{const li=document.createElement('li');li.textContent=x;u.append(li)});c.append(line('Ostrý závod je blokován, dokud nevyřešíte:'),u)}else c.append(line('✔ Data jsou připravena pro ostrý závod.'))}
async function testBoard(){const{data}=await sb.rpc('host_board');const rows=(data||[]).filter(r=>r.is_test);
renderBoard($('tb'),rows,{extra:r=>{const s=document.createElement('span');const mk=(t,f)=>{const b=document.createElement('button');b.textContent=t;b.onclick=async()=>{if(!confirm(t+'?'))return;const{error}=await f();if(error)alert(error.message);testBoard()};s.append(b)};
mk('Přeskočit GPS',()=>sb.rpc('host_test_skipgps',{p_team:r.id}));mk('Smazat test. tým',()=>sb.rpc('host_test_delete',{p_team:r.id}));return s}})}
async function init(){const{data:ok}=await sb.rpc('is_admin');if(!ok){$('err').textContent='Tento účet není organizátor.';return}
$('login').classList.add('hide');$('app').classList.remove('hide');
[1,2,3].forEach(n=>$('t'+n).onclick=()=>{[1,2,3].forEach(m=>{$('p'+m).classList.toggle('hide',m!==n);$('t'+m).setAttribute('aria-selected',m===n)});if(n===2)teams()});
$('snd').onclick=()=>{sound=true;beep();$('snd').remove()};
$('ms').onclick=async()=>{if(!sel||!$('mt').value)return;const{error}=await sb.rpc('host_reply',{p_help:sel.help,b:$('mt').value,cid:crypto.randomUUID()});if(error)return alert(error.message);$('mt').value='';loadH()};
await loadH();ctl();testBoard();setInterval(testBoard,5000);
await liveBoard(sb,$('b'),{pending:{has:id=>pend().has(id)},extra:r=>{const a=document.createElement('a');a.href='#';a.textContent=' → chat';a.onclick=e=>{e.preventDefault();$('t3').click();openConv(r.id)};return a}});
sb.channel('h').on('postgres_changes',{event:'*',schema:'public',table:'help'},loadH).on('postgres_changes',{event:'*',schema:'public',table:'chat'},loadH).subscribe(s=>{if(s==='SUBSCRIBED')loadH()});setInterval(loadH,15000)}
sb.auth.getSession().then(({data})=>data.session&&init());
