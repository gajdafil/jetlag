# Jet Lag ve Štatlu

## 1. Co aplikace dělá
Městská hra: týmy luští nápovědy, jdou na místo a tlačítkem **Su správně?** jednorázově ověří GPS. Kontrola, posun hry i čas běží na serveru (Supabase RPC); klient nikdy nedostane souřadnice ani radius. Žádná mapa, navigace ani sledování na pozadí. Živá **Tabulka** (realtime), samostatný **display.html**, chráněný **host.html**.

## 2. Struktura
`index.html` hráči · `host.html` hostitel · `display.html` projektor · `css/styles.css` · `js/` (`app.js` stavový automat hry, `gps.js`, `leaderboard.js`, `host.js`, `supabase.js` klient + časovač/formát, `config.js`) · `supabase/schema.sql`.

## 3–5. Supabase
1. Na supabase.com založte projekt. 2. *SQL Editor* → vložte celý `supabase/schema.sql` → Run. 3. *Project Settings → API*: zkopírujte **Project URL** a **anon public** klíč do `js/config.js`. Nikdy nevkládejte `service_role`.

## 6. Hesla
Seed: heslo hry `zmenit-heslo`, heslo hostitele `zmenit-host`. **Změňte je** v SQL editoru:
`update games set password_hash=extensions.crypt('nove-heslo',extensions.gen_salt('bf')), host_hash=extensions.crypt('nove-host',extensions.gen_salt('bf'));`
Hesla jsou ověřována na serveru (bcrypt), v klientském kódu nejsou.

## 7–9. Nápovědy, souřadnice, radius
Tabulka `clues` (Table Editor nebo SQL): `clue_text`, `latitude`, `longitude`, `radius`, `sequence`, `is_final`. `radius = NULL` → použije se `games.default_radius` (50 m). Přidání stanoviště = nový řádek, bez zásahu do kódu. Poslední stanoviště musí mít `is_final = true`. Adresa závěru: `games.finale_address`, text: `games.finale_text`.

## 10. Nová hra
Na host.html tlačítko **Nová hra** (s potvrzením): založí nový běh se stejnou trasou a prázdnou tabulkou, starý zůstává v tabulce `runs`/`teams`.

## 11–13. Adresy
Hráči `index.html` · tabulka `display.html` · hostitel `host.html`.

## 14. GitHub Pages
Repozitář → nahrajte soubory → Settings → Pages → větev `main`, složka `/ (root)`. Žádný build.

## 15. GPS na mobilu
Potřeba HTTPS (Pages ho má). iOS: Nastavení → Soukromí → Polohové služby → Safari = *Při používání*, povolit přesnou polohu. Android: Chrome → oprávnění polohy → Povolit. Venku mezi budovami počkejte pár vteřin na přesnou polohu.

## 16. Řešení chyb
„Spojení se serverem…“ → špatné URL/klíč v `config.js` nebo SQL nebylo spuštěno. Tabulka se neobnovuje → ověřte `alter publication supabase_realtime add table teams, runs`. (Odpoví se i polling po 20 s.)

## Nejasnosti / rozpory ve zdrojovém materiálu (ověřit před ostrým použitím)
1. **Adresa Nálevny**: starší verze „Váchova 6“, novější „Váchova 1“ (údajně z Map). Seed má `Váchova 1` – nastavte skutečnou v `games.finale_address`.
2. **Souřadnice** všech stanovišť pocházejí z konverzace s AI a nebyly ověřeny v terénu. Zvlášť nejisté: Nálevna (49.197, 16.604, v konverzaci označeno „přibližná“), Kamenná kolonie (49.183, 16.587; dříve 49.182, 16.583 a 49.206, 16.568 pro zastávku), Místodržitelský palác, katedrála, kostnice.
3. **Radiusy se liší** mezi verzí HTML a `insert_hints.php`. Použita novější (PHP). HTML mělo: č. 4 Špilberk 80 (PHP 50), č. 6 zastávka 40 (50), č. 8 vila 60 (50), č. 9 katedrála 70 (50). Shodné: 60, 50, 70, 70, 80, 100, 50 (č. 1, 2, 3, 5, 7, 11, 12).
4. **Texty** převzaty doslovně včetně překlepu „podniaktele“ (č. 8). Nápověda č. 2 nepojmenovává kostel, zatímco `next_hint` č. 1 jej jmenuje. `next_hint` č. 7 mluví o „dvou zvířatech“, č. 8 o „zvěřenu“. Starší verze měla „spisovatele“, novější „podnikatele“.
5. Starší verze mezi č. 2 a Špilberkem měla Husovický kostel Srdce Páně; novější jej nahrazuje „secesní bazilikou (Kepka)“ – převzato novější.
6. Ve zdroji byly **přístupové údaje k databázi InfinityFree** a staré heslo hostitele. Nebyly použity; hesla změňte/zneplatněte.
7. Stará hra nezobrazovala `nextHint` posledního stanoviště; nová ukazuje závěrečnou obrazovku s `finale_text` + adresou.
