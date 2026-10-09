import { rpc } from './supabase.js';
import { mountBoard } from './leaderboard.js';
const $ = s => document.querySelector(s), dlg = $('dialog');
let pass = sessionStorage.getItem('jlvs_host') || '', rows = [];
const msg = t => { $('#msg').textContent = t || ''; };
const ask = (q, inp) => new Promise(r => { $('#q').textContent = q; const i = $('#qi'); i.hidden = !inp; i.value = ''; dlg.returnValue = '';
  dlg.onclose = () => r(dlg.returnValue === 'ok' ? (inp ? i.value.trim() : true) : null); dlg.showModal(); });
async function call(a, id, arg) {
  const r = await rpc('host_do', { p_pass: pass, p_action: a, p_team: id || null, p_arg: arg || null });
  if (r.error) { msg(r.error === 'name_taken' ? 'Tento název už existuje.' : r.error === 'bad_password' ? 'Špatné heslo.' : 'Spojení se serverem se nepodařilo navázat. Zkontrolujte připojení k internetu.'); return null; }
  msg(''); $('#gname').textContent = r.game; $('#act').textContent = r.is_active ? 'Deaktivovat hru' : 'Aktivovat hru'; return r;
}
async function open() {
  if (!await call('ping')) { $('#gate').hidden = false; $('#panel').hidden = true; return; }
  sessionStorage.setItem('jlvs_host', pass); $('#gate').hidden = true; $('#panel').hidden = false;
  mountBoard($('#board'), { host: true, onRows: r => { rows = r; const n = s => r.filter(x => x.status === s).length;
    $('#cnt').textContent = `Týmů: ${r.length} · hraje: ${n('playing')} · dokončilo: ${n('finished')} · DNF: ${n('dnf')}`; },
    onAct: async (a, id) => { const t = rows.find(x => x.id === id);
      if (a === 'dnf' && await ask(`Označit tým „${t.name}“ jako DNF?`)) call('dnf', id);
      if (a === 'resume') call('resume', id);
      if (a === 'reset_team' && await ask(`Restartovat tým „${t.name}“? Tým začne od začátku a jeho čas se vynuluje.`)) call('reset_team', id);
      if (a === 'rename') { const n = await ask('Nový název týmu:', true); if (n) call('rename', id, n); } } });
}
$('#gf').onsubmit = e => { e.preventDefault(); pass = $('#gp').value; open(); };
$('#act').onclick = async () => { if (await ask('Změnit aktivitu hry? Při deaktivaci se nikdo nepřihlásí ani neověří polohu.')) call('toggle_active'); };
$('#newrun').onclick = async () => { if (await ask('Opravdu založit novou hru? Aktuální výsledky zůstanou v historii, tabulka začne prázdná.')) call('new_run'); };
if (pass) open();
