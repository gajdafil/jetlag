JetLag_md.md
JetLag_md.md
MD
Brno_Treasure_Hunt_Clues_.txt
Brno_Treasure_Hunt_Clues_.txt
TXT

execute
Ran 4 commands, shared files
Readme
Document·MD 
App
JS 
Board
JS 
Config.example
JS 
Host
JS 
Styles
Code·CSS 
Host
Code·HTML 
Index
Code·HTML 
001 schema
Code·SQL 
002 seed
Code·SQL 

Continue
Summarized the build as an initial version, not the complete scope.
Summarized the build as an initial version, not the complete scope.

I built a first working slice of Jet Lag ve Štatlu, not the full spec. It is in jet-lag-ve-statlu/, and none of it has been run against a real Supabase instance.

What exists

    Player app (index.html): a password and team-name gate, then Hra and Tabulka tabs inside the same page. It covers start, GPS check (failure shows only “Ještě nejste na místě”), question after GPS, and answer check. It also has “Potřebuji pomoc” with live Otec Fura messages and a penalty notice.
    Organizer site (host.html): the three tabs Živý závod, Týmy a průběhy and Livechat. It has login, the same shared board, pending-help highlighting, and a one-time beep after you enable sound. Per-team detail shows attempts, split times and section times, with DNF, disqualify and end buttons that write to an audit log.
    Shared board (assets/board.js): one component for players and organizers, using the ranking rules from your spec. Bubble position comes only from confirmed stations, and the clock runs locally.
    Database (001_schema.sql, 002_seed.sql):
        Row Level Security is on for every table, and anonymous users can read only the board view.
        Stations, questions and answers are not readable by players.
        The server handles the game password, GPS distance, answer checks, advancing stations and the single help penalty per station.
    Seed data: your latest 12-station route is loaded, with every station marked needs_review.

What is not done

    Supabase Edge Functions: the server logic runs as SQL functions instead.
    Station editor and admin run controls: there is no UI to edit stations, create runs, restart, view run history or run the readiness check. You edit stations in Supabase’s Table Editor.
    Test-mode walkthrough, the tests/ folder, delivery status on chat messages, and rate limiting beyond the game password.
    Team recovery: the team token lives in localStorage, so clearing the browser loses the team.
    The README is short.
    Player chat updates by polling every 4 seconds, not by Realtime.

Before you deploy

    Run both SQL files, after changing the game password ZMENTE-MA in the seed.
    Create an organizer user and insert their UUID into admins.
    Copy config.example.js to config.js and fill in the project URL and publishable key.
    Add a question and answer for every station and set status='ready'. No station has a question or answer yet, so the race cannot start.
    Set reg_open=true, then host on GitHub Pages over HTTPS.

Conflicts in your old data (noted in the station note column)

    Špilberk radius: 80 in the JS version, 50 in the PHP version (I used 50).
    Husovice coordinates and the “Západní brána” stop each have an older set of coordinates.
    Station 8 is called a writer’s villa in one version and an entrepreneur’s in another, and the text has a typo (“podniaktele”).
    Station 10 says “labyrint” but its coordinates are the ossuary.
    Váchova 1 versus 6, and the coordinates for Nálevna, the colony and Srbská are approximate and unconfirmed.

Tests actually run: only a JavaScript syntax check on the three .js files. The SQL, RLS, realtime, GPS and chat have not been tested and need a real Supabase instance and a phone.

Security: your history file contains the InfinityFree database password and the old host password in plain text. Treat both as compromised and change them. I did not use either one.

I can continue with the station and run admin UI, tests, or recovery of a team on a new device. Tell me which you want first.
You are out of free messages until 2:30 PM


Claude is AI and can make mistakes.
App · JS
import{liveBoard}from'./board.js';
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
 
