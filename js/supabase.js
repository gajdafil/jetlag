import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export async function rpc(fn, args) {
  try { const { data, error } = await sb.rpc(fn, args); return error ? { error: 'net' } : data; }
  catch { return { error: 'net' }; }
}
// timer: zdrojem pravdy je serverový started_at; klient jen dopočítává (offset k serverovému času)
let off = 0;
export const sync = iso => { off = Date.parse(iso) - Date.now(); };
export const now = () => Date.now() + off;
export const fmt = s => { s = Math.max(0, Math.floor(s)); const p = n => String(n).padStart(2, '0'); return `${p(s / 3600 | 0)}:${p(s % 3600 / 60 | 0)}:${p(s % 60)}`; };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
