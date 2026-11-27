[![CI/CD](https://github.com/Sarschi03/Solvex/actions/workflows/ci-cd.yml/badge.svg?branch=main)](https://github.com/Sarschi03/Solvex/actions/workflows/ci-cd.yml)

## Solvex - opis projekta
Solvex je spletna rešitev za lastnike sončnih elektrarn, ki želijo prijaviti napako ali naročiti redni pregled svoje elektrarne. Serviserji preko sistema prejemajo delovne naloge, beležijo ugotovljene napake, opravljeno delo in pripravljajo poročila o servisih. Vodja servisa uporablja rešitev za razporejanje servisov, dodeljevanje nalog in spremljanje zaloge rezervnih delov. Sistem lastnikom omogoča tudi pregled zgodovine servisov in pridobivanje priporočil za prihodnje preglede.

## Uporabljene tehnologije
- Frontend: React, Typescript, CSS
- Backend: Node.js in Express.js
- Podatkovna baza: PostgreSQL
- Avtentikacija: prijava uporabnikov z uporabo e-poštnega naslova in gesla

## Povezava do dokumentacije
https://github.com/lea250301/Solvex 

## Prevzem projekta in CI/CD

Agentska navodila, skilli, MCP in specifikacija so pripravljeni v ločenem PR
z veje `agents`. Ta veja `frontend` vsebuje aplikacijsko izvedbo in pripadajoče teste.

Fork: [Sarschi03/Solvex](https://github.com/Sarschi03/Solvex).
Pregled MVP in petih uporabniških zgodb: [docs/07-pregled-projekta.md](docs/07-pregled-projekta.md).
GitHub Actions in navodila za aktivacijo Render namestitve: [docs/08-ci-cd.md](docs/08-ci-cd.md).


### Faze cevovoda

- `lint`: ESLint preveri frontend in backend; napake ustavijo cevovod.
- `build`: TypeScript/Vite zgradita oba dela; `application-build` vsebuje prevedeno aplikacijo in podatke za zagon. Odvisnosti se predpomnijo z npm cache.
- `test`: 20 API testov s PostgreSQL in 28 frontend testov; HTML in LCOV poročili sta v artefaktu `coverage-reports`.
- `deploy`: samo po pushu v `main` in uspehu `lint`, `build`, `test`; prenese artefakte in objavi že prevedeni backend na Render ter frontend na Vercel. Render namesti samo izvajalne odvisnosti, Vercel uporabi `--prebuilt`; aplikaciji se ne gradita ponovno.

**Javna aplikacija: [solvex-henna.vercel.app](https://solvex-henna.vercel.app)**

Backend: [solvex-api-sarschi03.onrender.com](https://solvex-api-sarschi03.onrender.com).
[Preverjanje API-ja in baze](https://solvex-henna.vercel.app/api/health).
PostgreSQL baza `solvex-db` je na Render Free in ima inicializirano shemo.
[Stanje namestitve](docs/11-stanje-namestitve.md).

Za šolski preizkus javne aplikacije: `demo@solvex.local` / `SolvexDemo123!`.
Račun vsebuje izključno izmišljene demonstracijske podatke.

Za oddajo na Moodle je pripravljena [oddaja.txt](oddaja.txt) z obema povezavama.

Frontend bo objavljen na **Vercel Hobby**, backend na **Render Free**, baza pa bo **Free PostgreSQL**. Brezplačna Render baza poteče po 30 dneh; samodejna plačljiva nadgradnja ni nastavljena. Nastavitve so v [docs/08-ci-cd.md](docs/08-ci-cd.md), prva objava frontenda pa v [docs/10-vercel-frontend.md](docs/10-vercel-frontend.md).

## Zagon

### Kaj pomenijo mape in nastavitve

| Pot | Namen |
| --- | --- |
| `frontend/src/`, `backend/src/` | Izvorna koda aplikacije; strani, komponente, hooki in API. |
| `frontend/src/App.test.tsx`, `backend/test/` | Avtomatizirani testi; potrebni tudi za CI. |
| `coverage/` v frontendu/backendu | Generirana HTML/LCOV poročila o pokritosti testov. Varno jih izbrišemo; `npm run test:coverage` jih ustvari znova. |
| `dist/` v frontendu/backendu | Generirana produkcijska gradnja; `npm run build` jo ustvari znova. Za `npm start` backenda mora gradnja že obstajati. |
| `node_modules/` | Nameščene odvisnosti. Potrebne za lokalni razvoj; po brisanju je potreben `npm ci`. |
| `.playwright-mcp/` | Lokalni posnetki in dnevniki preverjanja brskalnika; po potrebi jih lahko izbrišemo. |
| `.vercel/project.json` | Povezava lokalne mape s projektom Vercel; `.vercel/output/` je generiran namestitveni paket. |
| `package.json`, `package-lock.json` | Ukazi in odvisnosti ter ponovljiva namestitev njihovih različic. |
| `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js` | Nastavitve TypeScripta, razvoja/gradnje, testov in linta. |
| `database/`, `docs/`, `oddaja.txt` | Podatkovni model, podedovani SQL primeri, projektna dokumentacija in šolska oddaja. |
| `.github/`, `.codex/`, `.agents/`, `.mcp.json`, `AGENTS.md` | CI/CD ter zahtevana navodila, varovalke, skilli in MCP za agenta. |

Generirani izhodi, dnevniki, odvisnosti in lokalne skrivnosti niso namenjeni dodajanju v Git.

### Nadzorna plošča in profil lastnika

Po lokalnem zagonu odprite [nadzorno ploščo lastnika](http://localhost:5173/#lastnik).
Povezava zahteva prijavo. Vpišite e-pošto ali uporabniško ime in geslo; vloga se ugotovi iz računa.
Lokalni demo: `demo-owner@solvex.local` / `SolvexDemo123!`. Za zaposlenega vpišite
e-pošto zaposlenega; njegova prijava odpre ločen delovni prostor.

Na podlagi `docs/06-wireframes.md` so pripravljene prazne strani za elektrarne,
pretekle servise in koristne informacije. Profil prek avatarja
zdaj prikazuje ime, shranjeno fotografijo, shematsko hišo z elektrarno in lastnikove
zaključene servise. Fotografijo lahko zamenjate ali odstranite; shrani se v PostgreSQL.
Obrazca za redni pregled in prijavo okvare sta povezana z API-jem; »Trenutni servisi«
prikaže lastnikove shranjene zahtevke in servise. Stran priporočil ostaja predloga.
Serviser ima dodatno prazen koledar.

Fotografije PNG/JPEG/WebP do 5 MB se v brskalniku izrežejo in zmanjšajo na 256 × 256;
API sprejme samo raster do 256 KB. Seja traja sedem dni in uporablja HttpOnly piškotek;
v bazi se hrani hash žetona. `localStorage` vsebuje le nenevarno oznako za obnovo seje.
Profil in podatki elektrarn se preverjajo na strežniku po seji, ne po ID-ju v URL-ju.
Vsi obstoječi API-ji servisov in poročil zdaj zahtevajo sejo in preverijo vlogo ter
dodelitev servisa. Sprememba ID-ja v URL-ju ne omogoči dostopa do drugega serviserja.

Po posodobitvi kode zaženite `npm run db:migrate --prefix backend`; migracija
`002-user-profiles-and-sessions` doda stolpce za slike in tabelo sej brez ponastavitve
podatkov. Migracija `003-manager-accounts-and-access` razširi seje in fotografije še
na vodje servisa. Migraciji sta lokalno preverjeni tudi ob ponovitvi; produkcija v tem koraku ni spreminjana.

### Moje elektrarne – API

Backend omogoča seznam, dodajanje, ogled in delno urejanje elektrarn prijavljenega
lastnika: `GET/POST /api/plants` ter `GET/PATCH /api/plants/:plantId`.
Lastništvo se preverja po seji. Pred uporabo nove kode lokalno zaženite
`npm run db:migrate --prefix backend` (migracija 004 doda proizvajalca in leto).
Polja, primer zahteve, pravila validacije in statusi so v
[`specifikaciji API-ja`](docs/specs/003-owner-plants/spec.md).
Samostojni vmesnik »Moje elektrarne« še ni povezan; elektrarno lahko lastnik
doda tudi neposredno v obrazcu pred oddajo zahtevka.

### Oddaja zahtevkov – US-01, US-02 in US-08

Lastnik odpre **Prijavi okvaro** ali **Naroči pregled**, izbere svojo elektrarno
oziroma jo doda v istem toku. Okvara zahteva vrsto in opis težave; redni pregled
ponudi dodatno čiščenje panelov ter pregled baterije, električnih komponent ali
nosilne konstrukcije. Želeni datum je neobvezen predlog, ne potrjen termin.
Po uspešnem shranjevanju dobi potrditev in povezavo na **Trenutni servisi**.
Tam vidi svoje zahtevke, stanje, ocenjeno nujnost in morebitne dodeljene servise/termine;
zaključene zapise vključi z izbiro »Prikaži tudi zaključene«.

Vodja v **Zahtevkih** vidi okvare in redne preglede ločeno, podatke elektrarne/lastnika,
čas oddaje in opis. Določi nizko, srednjo ali visoko nujnost. Ob prvi oceni zahtevek
preide iz »Oddan« v »V pregledu«; nujnost se v isti transakciji prenese na povezane
aktivne servise, zato jo vidi tudi dodeljeni serviser. Zaprti zahtevki in zaključeni
servisi se ne prepisujejo. Oddaja ne pošilja e-pošte; prejem pomeni trajen zapis v inboxu vodje.

Po posodobitvi lokalno zaženite `npm run db:migrate --prefix backend` za migracijo 006.
API: `GET/POST /api/requests`, `GET /api/requests/:requestId` in
`PATCH /api/managers/requests/:requestId/urgency` ter obstoječi pregled vodje.
Pravila, primeri in dokazila: [specifikacija zahtevkov](docs/specs/004-customer-request-flow/spec.md).

### Tri vrste računov

Za US-09/11/12 ima vodja dodatno stran **Razporeditev** za veččlansko ekipo,
vodjo, odgovornosti in termin z začetkom/koncem. Razpoložljivost in obremenitev se
preverjata na strežniku, prekrivanja so zavrnjena tudi ob sočasnih zapisih.
**Koledar** prikazuje termine glede na vlogo; zvonček odpira lastna trajna obvestila
o dodelitvah, spremembah in preklicih. Po prevzemu zaženite lokalno migracijo 007.
Podrobnosti: [dodeljevanje in termini](docs/specs/005-assignment-scheduling/spec.md).

Pri prijavi ni izbire vloge. Skupni `POST /api/auth/login` sprejme `{ identifier, password }`
in vrne račun z vlogo, določeno ob registraciji. `identifier` je e-pošta ali dodeljeno
uporabniško ime; spremenjena vloga v zahtevi ne vpliva na prijavo.
Na strani Registracija so trije ločeni obrazci:
`#registracija/lastnik`, `#registracija/serviser` in `#registracija/vodja`.
Po izrecni odločitvi za ta šolski projekt je registracija vseh treh vrst javna,
brez vabil ali potrjevanja. Vloga se določi na strežniku glede na registracijsko pot;
polje `role` v zahtevi ne spremeni pravic. E-pošta je enolična znotraj vrste računa.
Če imajo stari računi različnih vrst enako e-pošto in geslo, skupna prijava vrne 409;
ne izbere privilegirane vloge po vrstnem redu tabel. Enolično uporabniško ime razreši tak primer.

Lokalni testni računi, zahtevani za preizkušanje:

| Uporabniško ime | Geslo | Vloga |
| --- | --- | --- |
| `lastnik` | `geslo123` | Lastnik |
| `zaposlen` | `geslo123` | Serviser |
| `vodja` | `geslo123` | Vodja servisa |

Po migraciji `005-account-usernames` jih ustvari `npm run db:seed:accounts --prefix backend`.
Ukaz deluje samo proti lokalni bazi, je ponovljiv in ne prepisuje obstoječih računov.
Uporabniška imena so v skupni tabeli `account_usernames`, povezana s točno enim računom;
gesla se shranijo kot Argon2 hash. Ti testni računi niso bili ustvarjeni v produkciji.

| Račun | Trenutno dostopno |
| --- | --- |
| Lastnik | Osebna nadzorna plošča, profil/fotografija, lastne elektrarne prek API-ja ali dodajanja pred zahtevkom, obrazca za okvaro/pregled, stanje zahtevkov in servisov ter zaključeni servisi v profilu. |
| Serviser | Samo dodeljeni servisi, lastni osnutki in oddana poročila; pisanje/oddaja poročila le za trenutno dodeljen servis; profil in fotografija. |
| Vodja servisa | Pregled dejanskih števcev, ločen inbox okvar/pregledov z določanjem nujnosti, vsi servisi, serviserji z obremenitvijo, oddana poročila, lasten profil in fotografija. |

Vodja je poslovna vloga, ločena od administratorja iz US-15. Ne ureja poročil
serviserjev in ne upravlja računov. Zaloga ostaja pripravljena stran;
dodeljevanje nalog, skupine in koledar so zdaj povezani. Poslovna logika
zaloge ostaja ločena naloga. Podroben začetni obseg in preverjanje:
[`docs/specs/002-account-roles-foundation/spec.md`](docs/specs/002-account-roles-foundation/spec.md).

### Serviserjev delovni tok – US-05, US-06 in US-07

Serviser vidi samo trenutne dodelitve, privzeto aktivne naloge po nujnosti, in lahko
naloge pripne. V podrobnostih so čas dodelitve, rok/konec termina, celotna ekipa,
podatki elektrarne, opis okvare in zadnjih pet opravljenih servisov z ugotovitvami,
rezultatom ter znanimi menjavami delov. Ti podatki so samo za branje.

Poročilo piše in odda samo trenutni vodja ekipe. Osnutek se shrani s povzetkom;
pred oddajo so obvezni čas izvedbe, stanje elektrarne, rezultat in podatek o napaki
(z vzrokom, če je bila ugotovljena). Deli so strukturirane postavke z nazivom,
proizvajalcem, količino in podatki o menjavi/namestitvi. Oddaja v eni transakciji
zaklene poročilo, zaključi servis, posodobi zahtevek in obvesti lastnika ter vodjo.
Če je potreben nadaljnji poseg, zahtevek ostane v pregledu za novo dodelitev.

Lokalno zaženite `npm run db:migrate --prefix backend` (migraciji 007 in 008).
Veji sta ločeni: `feat/assignment-scheduling` vsebuje prvi korak, odvisna
`feat/technician-workflow` pa dodaja poročila in zaključevanje. Opis in dokazila:
[specifikacija delovnega toka](docs/specs/006-technician-workflow/spec.md).

### Lokalna aplikacija

Potrebujete Node.js 24, npm in zagnan Docker Desktop. Iz korenske mape:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
docker compose up -d --wait db
cd backend
npm ci
npm run db:migrate
npm run db:seed:demo
npm run dev
```

V drugem terminalu:

```powershell
cd frontend
npm ci
npm run dev
```

Odprite http://localhost:5173. Lokalna demo prijava je `demo@solvex.local` /
`SolvexDemo123!`; seed je namenjen samo lokalni bazi in vsebuje izmišljene podatke.
Baza je dostopna na `localhost:55432`, backend na `http://localhost:3000`,
preverjanje povezave pa na `http://localhost:3000/api/health`.
Datotek `.env` ne dodajajte v Git. Obstoječih `.env` ne prepisujte, temveč
v njih prilagodite nastavitve po primerih.

Za lokalno preverjanje produkcijskega načina najprej zgradite oba dela:

```powershell
npm ci --prefix frontend
npm run build --prefix frontend
npm ci --prefix backend
npm run build --prefix backend
cd backend
$env:SERVE_FRONTEND = 'true'
npm start
```

Celotna aplikacija je nato dostopna na `http://localhost:3000`. Če na teh vratih
že teče razvojni backend, ga pred produkcijskim zagonom ustavite.

## Deli in zaloga (razvojna veja)

Serviser v poročilu izbere kataloški del in količino. Shranjevanje osnutka ne
spremeni zaloge; oddaja jo odpiše v isti transakciji kot zaključek servisa.
Ob pomanjkanju ostane osnutek za popravek ali ponovno oddajo po dopolnitvi.
Vodja ima stran **Zaloga** s količinami, mejami, iskanjem, filtrom ter dnevnikom
premikov. Nizka zaloga sproži trajno obvestilo s priporočilom za dopolnitev.

Lokalno po migraciji za demo katalog izvedite `npm run db:seed:inventory --prefix backend`.
Podrobnosti, vzdrževanje in dokazila: [specifikacija US-10](docs/specs/007-parts-inventory/spec.md).
Ta veja ima 83 backend in 63 frontend uspešnih testov; prvi serviserjev korak je
v [PR #3](https://github.com/Sarschi03/Solvex/pull/3). Zaloga je pripravljena lokalno.

## Agentno programiranje

### Administracija in analize

Po `npm run db:migrate --prefix backend` lokalni šolski račun pripravi
`npm run db:seed:admin --prefix backend`: `admin` / `geslo123`.
Prijava odpre administracijo računov, katalog delov, audit in zahtevane analize.
Sprememba vloge/deaktivacija prekliče seje in ohrani povezano zgodovino.
Vodja na strani **Analize** zahteva obdobje/skupino; administrator pripravi
in posreduje razpredelnico, ki je nato vidna vlagatelju. US-13 stikala so po
dogovoru odložena. [Pravila in dokazila](docs/specs/009-administration-analytics/spec.md).

Lastnikovi strani **Pretekli servisi** in **Priporočila** sta povezani s pravimi
podatki. Zgodovina omogoča izbor elektrarne in prikaže javni povzetek brez
internih poročil. Letni predlogi temeljijo samo na opravljenih rednih pregledih;
lastnik jih lahko trajno izklopi. Potrebna je lokalna migracija 010.
Podrobnosti: [US-03 in US-04](docs/specs/008-customer-history-recommendations/spec.md).

Uporabljamo **Codex CLI**. Po namestitvi CLI-ja in prijavi ga zaženemo iz korena
projekta (Node.js 24 in npm morata biti na `PATH`):

```powershell
cd C:\Sara\Feri\RIRS\Solvex
codex
```

Ob prvem zagonu preglejte projektne nastavitve in potrdite zaupanje projektu.
Hooka preglejte v `/hooks`, povezavo z MCP pa v `/mcp`. Če konfiguracijo dodate
med odprto sejo, ponovno zaženite Codex. Pred zagonom aplikacije pripravite lokalno
bazo po razdelku »Zagon«. Za delo v varnem profilu podajte povezovalne spremenljivke
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` v okolje pred zagonom
Codexa; agentu ne odpirajte dostopa do `.env`.

### Datoteke za agenta

- [AGENTS.md](AGENTS.md): ukazi, struktura, dokumentacija, konvencije in zaščiteni deli.
- [.codex/config.toml](.codex/config.toml): varnostni profil in dejanska Codex MCP konfiguracija.
- [.codex/hooks.json](.codex/hooks.json), `.codex/hooks/` in `.codex/rules/safety.rules`:
  varovalke pred nevarnimi ukazi ter ESLint po spremembi izvorne kode.
- [.mcp.json](.mcp.json): enaka definicija zagona Playwright strežnika za odjemalce,
  ki berejo ta format; Codex uporablja `.codex/config.toml`. Codex omejitev orodij
  se pri uvozu JSON v drugo orodje ne prenese samodejno.
- [.agents/skills/solvex-api-endpoint/SKILL.md](.agents/skills/solvex-api-endpoint/SKILL.md):
  postopek dodajanja ali spreminjanja Express API-ja.
- [.agents/skills/solvex-tests/SKILL.md](.agents/skills/solvex-tests/SKILL.md):
  API testi s PostgreSQL in testi React vmesnika.
- [.agents/skills/solvex-frontend/SKILL.md](.agents/skills/solvex-frontend/SKILL.md):
  spremembe React/TypeScript vmesnika in povezava z API-jem.
- [.agents/skills/solvex-user-story/SKILL.md](.agents/skills/solvex-user-story/SKILL.md):
  izvedba dokumentirane uporabniške zgodbe skozi celoten sklad.
- [.agents/skills/solvex-refactor/SKILL.md](.agents/skills/solvex-refactor/SKILL.md):
  preureditev kode z ohranitvijo opaznega vedenja.
- `docs/05-uporabniske-zgodbe.md`, `docs/adr/` in `docs/07-pregled-projekta.md`:
  zahteve, arhitekturne odločitve in dejansko stanje aplikacije.
- `docs/specs/001-funkcionalnost/`: specifikacija, načrt in opravila za osebni profil;
  aplikacijska izvedba je pripravljena v ločenem PR z veje `frontend`.
- [docs/12-agentno-programiranje.md](docs/12-agentno-programiranje.md):
  preverjanje MCP in predlog naslednje funkcionalnosti.

### Playwright MCP in skilli

Ta PR vsebuje agentsko pripravo in ohranja aplikacijsko kodo veje `main`.
Ločeni PR `frontend` vsebuje prenovo vmesnika, razdelitev na strani, komponente
in hooke ter osebne profile. Rezultati preverjanj so zato v dokumentu 12 ločeni
po obeh vejah.

Playwright MCP `@playwright/mcp@0.0.86` omogoča preverjanje lokalnega React vmesnika
in njegove povezave z Express API-jem. Potrebuje nameščen Google Chrome; ob prvem
zagonu `npx` prenese pripeto različico paketa. Ne potrebuje tokena ali gesla za MCP.
Zažene se brez vidnega okna, z ločenim začasnim profilom in dovoljenimi lokalnimi
origini. Seje osebnega brskalnika se ne uporabljajo. Seznam originov je omejitev
zahtev, ne varnostna izolacija pred preusmeritvami. Izhodi `.playwright-mcp/` niso v Gitu.

Po zagonu aplikacije lahko agentu naročite: »S Playwright MCP preveri lokalno
prijavo in nalaganje servisov.« Uspešen dejanski preizkus je opisan v dokumentu 12.
Za skille uporabite `$solvex-api-endpoint`, `$solvex-tests`, `$solvex-frontend`,
`$solvex-user-story` ali `$solvex-refactor` v navodilu agentu;
Codex ju lahko glede na opis izbere tudi sam. Pred predajo spremembe vedno izvede
lint in teste obeh delov po `AGENTS.md`.
