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

## Viri

- [Codex MCP konfiguracija](https://developers.openai.com/codex/mcp)
- [Playwright MCP navodila in omejitve](https://github.com/microsoft/playwright-mcp)
