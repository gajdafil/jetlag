// Sdílená tabulka pro hráče i organizátora. Jen textContent (žádné innerHTML).
const fmt=s=>{s=Math.max(0,Math.floor(s));const p=n=>String(n).padStart(2,'0');return`${Math.floor(s/3600)}:${p(Math.floor(s/60)%60)}:${p(s%60)}`};
const BAD={dnf:'DNF',disqualified:'DISKVALIFIKOVÁN',ended:'UKONČEN ORGANIZÁTOREM'};
const D=x=>new Date(x);
export function sortBoard(rows){const el=r=>(D(r.finished_at||r.server_now)-D(r.started_at))/1e3;
const g={fin:[],run:[],new:[],bad:[]};rows.forEach(r=>(BAD[r.status]?g.bad:r.status==='finished'?g.fin:r.status==='running'?g.run:g.new).push(r));
g.fin.sort((a,b)=>el(a)+a.penalty_s-el(b)-b.penalty_s||el(a)-el(b));
g.run.sort((a,b)=>b.done-a.done||(D(a.last_done_at||a.server_now)-D(a.started_at))-(D(b.last_done_at||b.server_now)-D(b.started_at)));
return g}
let skew=0,timer;
export function renderBoard(root,rows,opts={}){clearInterval(root._t);if(rows[0])skew=D(rows[0].server_now)-Date.now();
const g=sortBoard(rows);root.replaceChildren();
const lane=(r,i)=>{const d=document.createElement('div');d.className='lane'+(opts.pending?.has(r.id)?' alert':'');
const n=Math.max(r.total,1),pos=r.status==='finished'?100:Math.min(r.done/n*100,95);
const h=document.createElement('div');h.className='meta';
const nm=document.createElement('strong');nm.textContent=(i?i+'. ':'')+r.name;nm.title=r.name;
const dn=document.createElement('span');dn.textContent=`${r.done}/${r.total} stanovišť`;
const tm=document.createElement('span');tm.className='t';tm.dataset.s=r.started_at||'';tm.dataset.f=r.finished_at||'';tm.dataset.p=r.penalty_s;
const pn=document.createElement('span');pn.textContent=`pomoci: ${r.helps}, penalizace ${fmt(r.penalty_s)}`;
const st=document.createElement('span');st.className=BAD[r.status]?'bad':'';st.textContent=BAD[r.status]||({new:'nezačal',running:'v závodě',finished:'v cíli'})[r.status];
h.append(nm,dn,tm,pn,st);if(opts.extra)h.append(opts.extra(r));
const ax=document.createElement('div');ax.className='axis';ax.style.setProperty('--n',n+1);
const b=document.createElement('span');b.className='bub';b.textContent=r.name;b.style.left=Math.max(pos,5)+'%';ax.append(b);
d.append(h,ax);return d};
const sec=(t,a,num)=>{if(!a.length)return;const h=document.createElement('h3');h.textContent=t;root.append(h);a.forEach((r,i)=>root.append(lane(r,num?i+1:0)))};
const note=document.createElement('p');note.className='stat';note.textContent='Start → 1 → … → Cíl. Poloha bubliny = potvrzený postup, ne GPS.';root.append(note);
sec('V cíli',g.fin,1);sec('V závodě',g.run,1);sec('Nezačali',g.new,0);sec('Nedokončili',g.bad,0);
const tick=()=>root.querySelectorAll('.t').forEach(e=>{if(!e.dataset.s)return e.textContent='—';const sec=((e.dataset.f?D(e.dataset.f):Date.now()+skew)-D(e.dataset.s))/1e3;e.textContent='čas '+fmt(sec)+(+e.dataset.p?` → výsledný ${fmt(sec+ +e.dataset.p)}`:'')});
tick();root._t=setInterval(tick,1000)}
export async function liveBoard(sb,root,opts){const load=async()=>{const{data,error}=await sb.from('board').select('*');if(error){root.dataset.stale=1;return}delete root.dataset.stale;renderBoard(root,data,opts)};
await load();sb.channel('ping'+Math.random()).on('postgres_changes',{event:'*',schema:'public',table:'ping'},load).subscribe(s=>{if(s==='SUBSCRIBED')load()});setInterval(load,20000);return load}
