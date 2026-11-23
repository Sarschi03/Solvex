# Agentno programiranje v Solvexu

## Orodje in nastavitve

Izbrano orodje je Codex CLI (preverjena različica 0.169.0). Navodila za zagon in
pregled datotek so v razdelku »Agentno programiranje« korenskega README.
Varnostni profil in hooki so opisani v `AGENTS.md`.

Codex za MCP bere projektni `.codex/config.toml` šele v zaupanem projektu.
`.mcp.json` vsebuje isto definicijo strežnika za združljive druge odjemalce;
omejitve `enabled_tools` so del Codex konfiguracije. Ne vključujte obeh definicij
kot dveh strežnikov v istem odjemalcu.

## Zakaj Playwright MCP

Solvex ima React vmesnik, Express API in PostgreSQL. Playwright omogoča preverjanje
prijave, seznamov in obrazcev v brskalniku ter pregled odgovorov API-ja. Dopolnjuje
obstoječe frontend teste, kjer je `fetch` nadomeščen z mockom. Za MCP ne potrebujemo
GitHub ali podatkovnih poverilnic in ne dodajamo odvisnosti v aplikacijo.

Strežnik se zažene prek STDIO z `npx --yes @playwright/mcp@0.0.86`. Uporablja
nameščen Google Chrome, `--headless`, `--isolated`, blokado service workerjev in
izključen WebMCP. Dovoljene zahteve so lokalni origini na vratih 5173 in 3000.
Origin allowlist ne prepreči vseh preusmeritev in ni varnostna meja.
Codex ima seznam dovoljenih orodij za navigacijo, obrazce, posnetke strukture in
diagnostiko; izvajanje poljubnega JavaScripta in nalaganje datotek nista vključena.
Drug odjemalec mora svoje omejitve nastaviti ločeno. Izhodi brskalnika so ignorirani
v `.gitignore` in lahko vsebujejo testne podatke; ne dodajajte jih v Git.

## Dejanska povezava in uporaba — 23. 11. 2026

Preverjanje ni bilo omejeno na uspešen zagon procesa:

1. `codex mcp get playwright --json` je v izoliranem testnem Codex domu z zaupanjem
   temu projektu pravilno prebral projektni strežnik, argumente in `enabled_tools`.
   Globalnih nastavitev zaupanja uporabnika nismo spreminjali. Brez zaupanja je
   Codex pričakovano vrnil, da strežnik ni registriran.
2. Agent je prek MCP SDK 1.32.2 vzpostavil dejansko STDIO povezavo s strežnikom,
   zagnanim z definicijo iz `.mcp.json` (enaki argumenti kot v TOML).
   Odgovor inicializacije: `Playwright`, `1.66.0-alpha-2026-11-18`.
   To je različica strežniškega jedra; različica npm paketa je `0.0.86`.
3. `tools/list` je vrnil orodja. `browser_navigate` je odprl
   `http://localhost:5173`, naslov strani `Solvex` in prijavni obrazec.
4. `browser_fill_form` in `browser_click` sta izvedla prijavo z javnim lokalnim
   demo računom. `browser_wait_for` in `browser_snapshot` sta potrdila naslov
   »Živjo, Demo!« in seznam dveh servisov za »Demo elektrarna«.
5. `browser_network_requests` je potrdil dejansko povezavo vmesnika in API-ja:

   ```text
   POST http://localhost:5173/api/employees/login -> 200 OK
   GET  http://localhost:5173/api/services        -> 200 OK
   ```

6. `browser_close` je zaprl testni brskalnik. Preizkus je uporabil lokalno bazo;
   servisov in poročil ni spreminjal. Gesla ali tokeni niso del MCP konfiguracije.

Preizkus je izvedel agent prek protokola MCP z ločenim validacijskim odjemalcem;
že odprta seja T3 ni samodejno naložila novega projektnega MCP strežnika. Za uporabo
iz nove native Codex seje zaupajte projektu in preverite strežnik v `/mcp`.

### Ponovitev preizkusa

Zaženite lokalno aplikacijo po README. Nato iz korena zaženite Codex, preglejte
zaupanje in `/hooks`, v `/mcp` preverite `playwright` ter naročite:

> S Playwright MCP odpri http://localhost:5173, preveri prijavni obrazec, prijavi
> lokalni demo račun, preveri seznam servisov in HTTP odgovora prijave ter seznama.
> Ne spreminjaj poročil ali servisov. Na koncu zapri brskalnik.

Če Chrome ni nameščen, ga pred uporabo pripravite; konfiguracija uporablja kanal
`chrome`. Pri novi namestitvi je potreben tudi dostop do npm za prvi prenos paketa.

## Dva projektna skilla

- `solvex-api-endpoint`: validacija Express zahtev, parametriziran SQL, API statusi,
  pravila zaklepanja poročil, integracijski testi in omejitve avtentikacije.
- `solvex-tests`: začasna PostgreSQL shema za API teste ter Vitest/Testing Library,
  mocki `fetch`, čiščenje stanja in preverjanje uporabniških scenarijev.

Oba sta v `.agents/skills/<name>/SKILL.md` z `name` in `description` v YAML
frontmatterju. Zamenjujeta prazni predlogi `skill-1` in `skill-2`.

## Predlog funkcionalnosti za točko 2.5

Priporočilo: **ločena filtra servisov po statusu in terminu** na dashboardu kot
nadgradnja US-06. Trenutni vmesnik že omogoča besedilno iskanje, sortiranje in
pripenjanje; nova filtra bi omogočila npr. pregled nedokončanih servisov v izbranem
obdobju. Predlog še ni implementiran ali potrjen kot vsebina točke 2.5.

Predlagan obseg:

- API sprejme neobvezna parametra za datumski interval in status z validacijo;
  brez filtrov ohrani dosedanje vedenje. Ne potrebuje novih tabel ali migracij.
- Vmesnik dobi izbor statusa, datumski interval in ponastavitev, skupaj s prikazom
  praznega rezultata in sporočilom ob neveljavnem intervalu.
- API in React testi preverijo kombinacijo filtrov, robne datume, neveljavne
  vrednosti ter ohranitev pripetih servisov. Playwright MCP preveri lokalno pot.

Pri razvoju bi uporabili oba skilla. Izolacija po ID zaposlenega še ni varna
avtorizacija: obstoječa aplikacija nima strežniške seje, kot je zapisano v pregledu
projekta. Filtri te omejitve ne odpravljajo. Večja ločena nadgradnja bi bila varna
prijavna seja in omejitev dostopa na dodeljene servise (US-06).

**Preostala zahteva:** pridobiti navodilo točke 2.5 oziroma izbrati funkcionalnost,
jo razviti z vsaj enim skillom in v dejanskem PR navesti konkretno uporabo skilla
ter opravljena preverjanja. Samo ustvarjena skilla in ta predlog tega ne dokazujeta.
PR za novo funkcionalnost še ni ustvarjen.

## Preverjanje sprememb — 23. 11. 2026

Uspešno opravljeno:

- `npm run lint --prefix frontend` in `npm run lint --prefix backend`;
- `npm test --prefix frontend`: 7 uspešnih testov;
- `npm test --prefix backend`: 11 uspešnih integracijskih testov;
- `quick_validate.py` iz skilla `skill-creator` za oba nova skilla;
- `git diff --check`; `AGENTS.md` ima 135 vrstic (omejitev 150).

Spremembe so lokalne; v tej nalogi še ni bilo commita, pusha ali novega PR.

## Uporaba skilla pri prenovi prijave — 23. 11. 2026

Pri uporabnikovi zahtevi za prenovo prijave po slikovnem vzoru je agent prebral
in uporabil `.agents/skills/solvex-tests/SKILL.md`. Prenovljena stran ohranja
svetlo temo, obrazec postavi levo in fotografijo v grid desno, vključno z zelenim,
črnim in belim kvadratkom. Izvorna fotografija je lokalni asset uporabnika.

Frontend je razdeljen v `pages`, `components` in `hooks`, skupne TypeScript tipe
ter API URL. Prijavna logika je v `useAuth`, pripeti servisi v `useServicePins`;
dashboard se ob odjavi odmontira in ob novi prijavi obnovi uporabnikove pripete
servise. Vsa aplikacijska logika uporablja `.ts` oziroma React `.tsx` datoteke.

Po navodilih skilla sta dodana vedenjska testa za odjavo/ponovno prijavo in obnovo
pripetih servisov po ponovni prijavi. Uporabljata Testing Library, `userEvent`,
mock `fetch` in čiščenje lokalne shrambe. Obstoječih sedem scenarijev ostaja.
Poročilo pokritosti zdaj vključuje tudi izvlečene strani, komponente in hooke.

Lint in gradnja obeh delov sta uspešna; uspešnih je 9 frontend in 11 backend testov.
Playwright MCP je preveril prikaz pri 1440 × 900 in 390 × 844; testni brskalnik je
zaprt, lokalni posnetki so v ignorirani `.playwright-mcp/`. PR še ni ustvarjen;
ob njegovi pripravi naj opis navede to uporabo skilla in ta preverjanja. Brez
celotnih navodil točke 2.5 ne trdimo, da je prenova izpolnila vsa njena merila.

## Nadzorna plošča lastnika — oblikovna predloga

Lokalni naslov: `http://localhost:5173/#lastnik`. Referenca za obseg strani je
`docs/06-wireframes.md` (Lastnik), za povezave do pregleda/okvare in priporočil
pa US-01 do US-04 v `docs/05-uporabniske-zgodbe.md`.

Pripravljeno v `frontend/src/pages/customer/`:

- naslovna predloga s fotografijo, zamegljenim spodnjim delom, tremi povezavami
  in tremi vzorčnimi vsebinskimi karticami;
- prazne strani: elektrarne, trenutni servisi, zgodovina, koristne informacije,
  priporočila, redni pregled in prijava okvare;
- prazen profil uporablja obstoječi `ProfilePage.tsx`, dostopen samo prek avatarja.

To je predloga brez podatkov lastnika in brez klicev zasebnega API-ja. Prijava
lastnika, nalaganje elektrarn in oddaja zahtevkov niso implementirani. Prijava
zaposlenega ostaja ločena; njegov dokumentirani koledar je dodan kot prazna stran.

Skupni bel navigacijski stolpec uporablja ikone in označi aktivno stran s črno
podlago/zeleno ikono; profil ni v navigaciji. Iskanje je v glavi ob avatarju.
Pri zaposlenem filtrira servise oziroma poročila, pri vzorčni plošči lastnika
pa povezave in vsebinske kartice. Zunanji okvir seznama in naslovna ločnica sta odstranjena.

Po skillu `solvex-tests` so preverjeni prazni cilji navigacije, povezave,
iskanje, vrnitev na prijavo ter odsotnost zasebnih zahtev na vzorčni poti.
Uspešnih je 16 frontend in 11 backend testov ter lint in gradnja obeh delov.
Dejanska uporaba Playwright MCP je potrdila namizni in mobilni prikaz, prehod na
prazno stran elektrarn ter nič napak v konzoli. Brskalnik je po preverjanju zaprt.

## Viri

- [Codex MCP konfiguracija](https://developers.openai.com/codex/mcp)
- [Playwright MCP navodila in omejitve](https://github.com/microsoft/playwright-mcp)
