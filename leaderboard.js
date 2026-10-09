import { sb, rpc, fmt, now, sync, esc } from './supabase.js';
const LBL = { registered: 'Čeká', playing: 'Hraje', finished: 'Dokončeno', dnf: 'DNF' };
const ORD = { finished: 0, playing: 1, registered: 2, dnf: 3 };
export function mountBoard(el, o = {}) {
  let rows = [], total = 0, prev = new Map(), flash = new Set();
  const sorted = () => [...rows].sort((a, b) => ORD[a.status] - ORD[b.status] ||
    (a.status === 'finished' ? a.elapsed_seconds - b.elapsed_seconds : b.completed - a.completed || Date.parse(a.started_at) - Date.parse(b.started_at)));
  function draw() {
    let rk = 0;
    const body = sorted().map(r => {
      const fin = r.status === 'finished', dnf = r.status === 'dnf';
      const tm = fin ? fmt(r.elapsed_seconds) : dnf ? 'DNF' : r.status === 'playing' ? `<span data-s="${Date.parse(r.started_at)}"></span>` : '—';
      const act = o.host ? `<span class="ac">${dnf ? `<button data-a="resume" data-id="${r.id}">Obnovit</button>` : `<button data-a="dnf" data-id="${r.id}">DNF</button>`}<button data-a="reset_team" data-id="${r.id}">Restart</button><button data-a="rename" data-id="${r.id}">Přejmenovat</button></span>` : '';
      return `<div class="row${dnf ? ' dnf' : ''}${flash.has(r.id) ? ' fl' : ''}"><span>${fin ? ++rk : '—'}</span><b>${esc(r.name)}</b><span class="st">${LBL[r.status]}${fin || r.status === 'playing' ? ` · ${r.completed}/${total}` : ''}</span><span class="tm mono">${tm}</span>${act}</div>`;
    }).join('') || '<div class="row"><span></span><i>Zatím žádný tým.</i></div>';
    el.innerHTML = `<div class="board${o.host ? ' host' : ''}"><div class="row h"><span>#</span><span>Tým</span><span>Stav</span><span>Čas</span>${o.host ? '<span>Akce</span>' : ''}</div>${body}</div>`;
    tick();
  }
  const tick = () => el.querySelectorAll('[data-s]').forEach(c => { c.textContent = fmt((now() - c.dataset.s) / 1000); });
  async function load() {
    const m = await rpc('board_meta'); if (m.error) return;
    sync(m.now); total = m.total;
    const { data } = m.run ? await sb.from('teams').select('*').eq('run_id', m.run) : { data: [] };
    rows = data || [];
    for (const r of rows) {
      if (prev.get(r.id) && prev.get(r.id) !== 'finished' && r.status === 'finished') { flash.add(r.id); setTimeout(() => { flash.delete(r.id); draw(); }, 4000); }
      prev.set(r.id, r.status);
    }
    o.onRows?.(rows); draw();
  }
  el.onclick = e => { const b = e.target.closest('button[data-a]'); if (b) o.onAct?.(b.dataset.a, b.dataset.id); };
  sb.channel('board' + Math.random()).on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' }, load).subscribe();
  setInterval(tick, 1000); setInterval(load, 20000); load();
}
