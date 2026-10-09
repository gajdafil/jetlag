-- Jet Lag ve Štatlu – schéma, RLS, RPC, realtime, seed. Spusťte celé v Supabase SQL editoru.
create extension if not exists pgcrypto with schema extensions;

create table games(
  id uuid primary key default gen_random_uuid(),
  name text not null, password_hash text not null, host_hash text not null,
  is_active boolean not null default true,
  default_radius int not null default 50,
  finale_title text not null default 'Štatl je váš!',
  finale_text text not null, finale_address text,   -- adresa Nálevny: konfigurovatelná (viz README, rozpor)
  created_at timestamptz not null default now());
create table runs(  -- jeden běh hry; historie zůstává
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games on delete cascade,
  is_current boolean not null default true, created_at timestamptz not null default now());
create unique index one_current_run on runs(game_id) where is_current;
create table clues(
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games on delete cascade,
  sequence int not null, title text not null, clue_text text not null,
  latitude double precision not null, longitude double precision not null,
  radius int,  -- NULL = games.default_radius
  next_hint text, is_final boolean not null default false,
  unique(game_id, sequence));
create table teams(
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs on delete cascade,
  name text not null check (char_length(name) between 2 and 30),
  status text not null default 'registered' check (status in ('registered','playing','finished','dnf')),
  started_at timestamptz, finished_at timestamptz, elapsed_seconds int,
  current_seq int not null default 1, completed int not null default 0,
  last_seen_at timestamptz default now(), created_at timestamptz default now(), updated_at timestamptz default now());
create unique index team_name_uq on teams(run_id, lower(name));
create table team_secrets(team_id uuid primary key references teams on delete cascade, token uuid not null unique default gen_random_uuid());

-- RLS: veřejně čitelné jsou jen týmy (bez tokenů) a aktuální běh. Souřadnice/nápovědy čte jen server (RPC).
alter table games enable row level security; alter table runs enable row level security;
alter table clues enable row level security; alter table teams enable row level security;
alter table team_secrets enable row level security;
create policy teams_read on teams for select using (true);
create policy runs_read on runs for select using (is_current);
revoke insert, update, delete on all tables in schema public from anon, authenticated;

create function dist_m(a1 float8,o1 float8,a2 float8,o2 float8) returns float8 language sql immutable as $$
  select 12742000*asin(sqrt(sin(radians(a2-a1)/2)^2+cos(radians(a1))*cos(radians(a2))*sin(radians(o2-o1)/2)^2)) $$;

create function team_view(t teams) returns json language sql security definer set search_path=public as $$
  select json_build_object('id',t.id,'name',t.name,'status',t.status,'started_at',t.started_at,
   'elapsed_seconds',t.elapsed_seconds,'completed',t.completed,'server_now',now(),
   'total',(select count(*) from clues c join runs r on r.game_id=c.game_id where r.id=t.run_id),
   'clue',(select json_build_object('title',c.title,'text',c.clue_text) from clues c join runs r on r.game_id=c.game_id
           where r.id=t.run_id and c.sequence=t.current_seq and t.status='playing'),
   'finale',(select json_build_object('title',g.finale_title,'text',g.finale_text,'address',g.finale_address)
           from games g join runs r on r.game_id=g.id where r.id=t.run_id and t.status='finished')) $$;
revoke execute on function team_view(teams) from public, anon, authenticated;

create function board_meta() returns json language sql security definer set search_path=public as $$
  select json_build_object('now',now(),'run',(select id from runs where is_current limit 1),
   'total',(select count(*) from clues c join runs r on r.game_id=c.game_id where r.is_current)) $$;

create function join_game(p_pass text) returns json language plpgsql security definer set search_path=public,extensions as $$
declare g games;
begin
  select * into g from games where password_hash=crypt(p_pass,password_hash) limit 1;
  if not found then return '{"error":"bad_password"}'::json; end if;
  if not g.is_active then return '{"error":"inactive"}'::json; end if;
  return json_build_object('game',g.name);
end $$;

create function start_team(p_pass text,p_name text) returns json language plpgsql security definer set search_path=public,extensions as $$
declare g games; r uuid; t teams; n text:=trim(p_name); tok uuid;
begin
  select * into g from games where password_hash=crypt(p_pass,password_hash) limit 1;
  if not found then return '{"error":"bad_password"}'::json; end if;
  if not g.is_active then return '{"error":"inactive"}'::json; end if;
  if not (char_length(n) between 2 and 30) or n ~ '[<>"&]' then return '{"error":"bad_name"}'::json; end if;
  select id into r from runs where game_id=g.id and is_current;
  insert into teams(run_id,name,status,started_at) values(r,n,'playing',now()) returning * into t;  -- čas startu = serverový čas
  insert into team_secrets(team_id) values(t.id) returning token into tok;
  return (team_view(t)::jsonb||jsonb_build_object('token',tok))::json;
exception when unique_violation then return '{"error":"name_taken"}'::json;
end $$;

create function get_state(p_token uuid) returns json language plpgsql security definer set search_path=public as $$
declare t teams;
begin
  select t2.* into t from teams t2 join team_secrets s on s.team_id=t2.id where s.token=p_token;
  if not found then return '{"error":"no_team"}'::json; end if;
  return team_view(t);
end $$;

-- Kontrola polohy a posun hry se dějí VÝHRADNĚ tady (souřadnice ani radius klient nikdy nedostane).
create function check_in(p_token uuid,p_lat float8,p_lon float8) returns json language plpgsql security definer set search_path=public as $$
declare t teams; c clues; g games; ok boolean:=false; nh text;
begin
  select t2.* into t from teams t2 join team_secrets s on s.team_id=t2.id where s.token=p_token for update of t2;
  if not found then return '{"error":"no_team"}'::json; end if;
  select g2.* into g from games g2 join runs r on r.game_id=g2.id where r.id=t.run_id;
  if t.status='playing' and g.is_active then
    select * into c from clues where game_id=g.id and sequence=t.current_seq;
    if dist_m(p_lat,p_lon,c.latitude,c.longitude) <= coalesce(c.radius,g.default_radius) then
      ok:=true; nh:=c.next_hint;
      if c.is_final then
        update teams set status='finished',finished_at=now(),elapsed_seconds=extract(epoch from now()-started_at)::int,
          completed=completed+1,updated_at=now() where id=t.id;
      else
        update teams set current_seq=current_seq+1,completed=completed+1,updated_at=now() where id=t.id;
      end if;
    end if;
  end if;
  select * into t from teams where id=t.id;
  return (team_view(t)::jsonb||jsonb_build_object('ok',ok,'next_hint',nh))::json;
end $$;

create function host_do(p_pass text,p_action text,p_team uuid default null,p_arg text default null)
returns json language plpgsql security definer set search_path=public,extensions as $$
declare g games;
begin
  select * into g from games where host_hash=crypt(p_pass,host_hash) limit 1;
  if not found then return '{"error":"bad_password"}'::json; end if;
  if p_action='dnf' then update teams set status='dnf',finished_at=null,elapsed_seconds=null,updated_at=now() where id=p_team;
  elsif p_action='resume' then update teams set status='playing',updated_at=now() where id=p_team and status='dnf';
  elsif p_action='reset_team' then update teams set status='playing',started_at=now(),finished_at=null,elapsed_seconds=null,current_seq=1,completed=0,updated_at=now() where id=p_team;
  elsif p_action='rename' then update teams set name=left(trim(p_arg),30),updated_at=now() where id=p_team;
  elsif p_action='toggle_active' then update games set is_active=not is_active where id=g.id;
  elsif p_action='new_run' then update runs set is_current=false where game_id=g.id and is_current; insert into runs(game_id) values(g.id);
  end if;
  return json_build_object('ok',true,'game',g.name,'is_active',(select is_active from games where id=g.id));
exception when unique_violation then return '{"error":"name_taken"}'::json;
end $$;

alter publication supabase_realtime add table teams, runs;

-- SEED: hesla ZMĚŇTE (viz README §6).
insert into games(name,password_hash,host_hash,default_radius,finale_text,finale_address) values(
 'Jet Lag ve Štatlu', crypt('zmenit-heslo',gen_salt('bf')), crypt('zmenit-host',gen_salt('bf')), 50,
 'Pro závěrečné vyhodnocení a zaslouženou odměnu se dostavte do Nálevny. Čeká vás tam filosofování nad Plzní, ethanolem, ethylestery kyseliny octové, mravenčí a propionové a kyselinou octovou.',
 'Váchova 1');
insert into runs(game_id) select id from games;
insert into clues(game_id,sequence,title,clue_text,latitude,longitude,radius,next_hint,is_final)
select g.id,v.* from games g, (values
(1,'Nasměrování 1',$q$Začněte svou cestu tam, kde kdysi prosperovalo barevné tržiště, nyní živé náměstí s morovým sloupem sahajícím k nebi.$q$,49.19522,16.60801,60,$q$Z centra města hledejte 'Červený kostel' s jeho charakteristickou cihlovou fasádou.$q$,false),
(2,'Nasměrování 2',$q$Najděte výraznou novogotickou památku, která kdysi sloužila specifické komunitě v Brně.$q$,49.19635,16.61215,50,$q$Nyní se vydejte severněji a hledejte secesní baziliku, která byla zhotovena z návrhu prof. arch. Karla Huga Kepky.$q$,false),
(3,'Nasměrování 3',$q$Hledejte secesní baziliku, která byla zhotovena z návrhu prof. arch. Karla Huga Kepky.$q$,49.2118903,16.6306672,70,$q$Nyní zamiřte k návrší, kde bdí mohutná pevnost nabízející panoramatické výhledy.$q$,false),
(4,'Nasměrování 4',$q$Vystoupejte k pevnosti na kopci, místu historie a úžasných výhledů. Najděte místo, kde kdysi stála děla.$q$,49.19639,16.60667,50,$q$Sestupte z výšin a hledejte palác, který kdysi hostil guvernéra a nyní ukrývá umělecké poklady.$q$,false),
(5,'Nasměrování 5',$q$Vaším dalším cílem je palác, který v minulosti sloužil jako sídlo guvernéra a dnes v něm můžete obdivovat umělecká díla.$q$,49.19485,16.60525,70,$q$Nyní se vydejte na západ, kde najdete futuristickou dopravní stavbu, o které se říká, že je předzvěstí budoucího metra.$q$,false),
(6,'Nasměrování 6',$q$Hledejte futuristickou zastávku, která je považována za předzvěst brněnského metra a denně hostí desítky budoucích lékařů.$q$,49.1734897,16.5671544,50,$q$Hledejte místo, které vzniklo nelegálně v roce 1925 v bývalém pískovcovém lomu na severním svahu Červeného kopce nad Svratkou. Byla to nouzová kolonie dělníků z cihelny.$q$,false),
(7,'Nasměrování 7',$q$Hledejte místo, které vzniklo nelegálně v roce 1925 v bývalém pískovcovém lomu na severním svahu Červeného kopce nad Svratkou. Byla to nouzová kolonie dělníků z cihelny.$q$,49.183,16.587,80,$q$Odtud se vydejte do čtvrti, kde stojí vily bohatých, včetně té, která patřila slavnému podnikateli, jehož jméno připomíná dvě zvířata.$q$,false),
(8,'Nasměrování 8',$q$Objevte vilu významného podniaktele, jehož jméno evokuje zvěřenu. Tento dům nyní slouží jako muzeum.$q$,49.2060172,16.6134131,50,$q$Vraťte se zpět k centru a najděte kostel se dvěma výraznými věžemi, sídlo brněnského biskupa.$q$,false),
(9,'Nasměrování 9',$q$Vaše další nápověda čeká v sídle brněnského biskupa, významné památce s impozantními věžemi.$q$,49.19365,16.60435,50,$q$Hledejte unikátní podzemní labyrint, který kdysi sloužil překvapivému účelu pro město.$q$,false),
(10,'Nasměrování 10',$q$Prozkoumejte hlubiny Brna a najděte podzemní labyrint, fascinující a trochu strašidelné historické místo.$q$,49.19465,16.60735,50,$q$Nyní se vydejte na místo, kde se dříve konaly sportovní klání a které nese jméno investiční společnosti. Zbrojovka se sem přestěhovala z Lužánek.$q$,false),
(11,'Nasměrování 11',$q$Vaší předposlední zastávkou je místo, které dříve neslo jméno ulice a sloužilo sportovním účelům. Hledejte arénu s názvem investiční společnosti.$q$,49.213,16.621,100,$q$Váš poslední úkol: Dostaňte se do místa, kde vás čeká filosofování nad Plzní, ethanolem, ethylestery kyseliny octové, mravenčí a propionové a kyselinou octovou...$q$,false),
(12,'Nasměrování 12',$q$Váš poslední úkol: Dostaňte se do místa, kde vás čeká filosofování nad Plzní, ethanolem, ethylestery kyseliny octové, mravenčí a propionové a kyselinou octovou...$q$,49.197,16.604,50,$q$Gratulujeme k dokončení brněnské honby za pokladem!$q$,true)
) v(a,b,c,d,e,f,h,i,j);
