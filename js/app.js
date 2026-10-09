import { rpc, fmt, sync, now, esc } from './supabase.js';
import { locate, gpsMsg } from './gps.js';
import { mountBoard } from './leaderboard.js';
const $ = s => document.querySelector(s), view = $('#view'), KEY = 'jlvs_token';
const E = { bad_password: 'Špatné heslo.', inactive: 'Tato hra momentálně není aktivní.',
  name_taken: 'Tento název týmu už používá jiný tým. Zvolte prosím jiný název.',
  bad_name: 'Název týmu musí mít 2–30 znaků a nesmí obsahovat < > " &.',
  net: 'Spojení se serverem se nepodařilo navázat. Zkontrolujte připojení k internetu.', no_team: 'Tým nebyl nalezen.' };
let token = localStorage.getItem(KEY), pass = '', st = null, phase = '', timer;
const say = (t, bad) => { const m = $('#msg'); m.textContent = t || ''; m.className = bad ? 'bad' : 'ok'; };
// Stavy: PASSWORD_REQUIRED → TEAM_SETUP → PLAYING ⇄ CHECKING_LOCATION → FINISHED
function go(p) { phase = p; clearInterval(timer); say(''); ({ PASSWORD_REQUIRED: pw, TEAM_SETUP: setup, PLAYING: play, FINISHED: fin })[p](); }

function pw() {
  view.innerHTML = `<div class="card"><h1>Jet Lag ve Štatlu</h1><form id="f"><label for="p">Zadejte heslo ke hře</label><input id="p" type="password" autocomplete="off" required><button class="btn">Vstoupit</button></form></div>`;
  $('#f').onsubmit = async e => { e.preventDefault(); const p = $('#p').value, r = await rpc('join_game', { p_pass: p });
    if (r.error) return say(E[r.error], 1); pass = p; go('TEAM_SETUP'); };
}
function setup() {
  view.innerHTML = `<div class="card"><h1>Jet Lag ve Štatlu</h1><p>Čeká vás série nápověd, které vás provedou Štatlem. Každou nápovědu nejprve rozluštěte a potom se vydejte na místo, které podle vás označuje. Až tam dorazíte, ověříte svou polohu.</p><form id="f"><label for="n">Název týmu</label><input id="n" maxlength="30" required><button class="btn">Započněmež</button></form></div>`;
  $('#f').onsubmit = async e => { e.preventDefault(); const r = await rpc('start_team', { p_pass: pass, p_name: $('#n').value });
    if (r.error) return say(E[r.error], 1); token = r.token; localStorage.setItem(KEY, token); st = r; sync(r.server_now); go('PLAYING'); };
}
function play() {
  if (st.active === false) { view.innerHTML = `<div class="card"><h2>Hra je pozastavena</h2><p>Hostitel hru momentálně deaktivoval. Vyčkejte na další pokyny, nápověda se zobrazí, jakmile se hra obnoví.</p></div>`; return; }
  if (!st.clue) { view.innerHTML = `<div class="card"><p>Nápověda není k dispozici. Obnovte stránku.</p></div>`; return; }
  const c = st.clue;
  view.innerHTML = `<div class="card"><div class="mono big" id="t"></div><small>${esc(st.name)} · splněno ${st.completed}/${st.total}</small></div><div class="card"><h2>${esc(c.title)}</h2><p class="clue">${esc(c.text)}</p><button class="btn" id="go">Su správně?</button></div>`;
  const t = () => { $('#t').textContent = fmt((now() - Date.parse(st.started_at)) / 1000); }; t(); timer = setInterval(t, 1000);
  $('#go').onclick = check;
}
async function check() {
  const b = $('#go'); b.disabled = true; phase = 'CHECKING_LOCATION'; say('📍 Ověřuji vaši polohu…');
  const back = m => { b.disabled = false; phase = 'PLAYING'; say(m, 1); };
  try {
    const p = await locate(), r = await rpc('check_in', { p_token: token, p_lat: p.latitude, p_lon: p.longitude });
    if (r.error === 'ended') return ended();
    if (r.error) return back(E[r.error]);
    st = r; sync(r.server_now);
    if (!r.ok) return back('Ještě nejste na místě.');
    go(r.status === 'finished' ? 'FINISHED' : 'PLAYING');
    if (r.status !== 'finished') say('Správně! ✓ Stanoviště nalezeno. ' + (r.next_hint || ''));
  } catch (e) { back(gpsMsg(e)); }
}
function fin() {
  if (st.status === 'dnf') { view.innerHTML = `<div class="card"><h2>Hra pro váš tým skončila (DNF)</h2><p>Obraťte se na hostitele.</p></div>`; return; }
  const f = st.finale;
  view.innerHTML = `<div class="card fin"><h1>🎉 ${esc(f.title)}</h1><h2>Hra dokončena</h2><p>Gratulujeme! Úspěšně jste dokončili celou trasu.</p><p class="big mono">Váš čas: ${fmt(st.elapsed_seconds)}</p><p>${esc(f.text)}</p><p class="big">${esc(f.address || '')}</p></div>`;
}
function ended() {
  localStorage.removeItem(KEY); token = null; go('PASSWORD_REQUIRED');
  say('Tato hra skončila. Zadejte heslo a zaregistrujte se do nové hry.');
}
async function init() {
  if (!token) return go('PASSWORD_REQUIRED');
  const r = await rpc('get_state', { p_token: token });
  if (r.error === 'ended') return ended();
  if (r.error === 'no_team') { localStorage.removeItem(KEY); token = null; return go('PASSWORD_REQUIRED'); }
  if (r.error) { view.innerHTML = ''; say(E.net, 1); return setTimeout(init, 5000); }
  st = r; sync(r.server_now); go(r.status === 'playing' ? 'PLAYING' : 'FINISHED');
}
async function refresh() {
  if (!token || phase !== 'PLAYING') return;
  const r = await rpc('get_state', { p_token: token }); if (r.error === 'ended') return ended();
  if (r.error) return;
  sync(r.server_now);
  const ch = r.active !== st.active || r.status !== st.status || r.completed !== st.completed || r.started_at !== st.started_at;
  st = r; if (ch) go(r.status === 'playing' ? 'PLAYING' : 'FINISHED');
}
setInterval(refresh, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  $('#game').hidden = b.dataset.tab !== 'game'; $('#board').hidden = b.dataset.tab !== 'board';
  if (b.dataset.tab === 'board' && !$('#board').dataset.m) { $('#board').dataset.m = 1; mountBoard($('#board')); }
});
init();
