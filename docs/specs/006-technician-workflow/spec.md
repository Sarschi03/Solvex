# Serviserjev delovni tok – US-05, US-06 in US-07

## Obseg in pravila

Odvisna veja `feat/technician-workflow` izhaja iz preverjenega commita dodelitev
`9c54750` na `feat/assignment-scheduling`. Uporabljeni so skilli solvex-user-story,
solvex-api-endpoint, solvex-frontend in solvex-tests. Produkcija ni bila spremenjena.

US-06: strežnik filtrira po trenutnem članstvu M:N, za stare uvoze brez ekipe uporabi
obstoječega posameznega serviserja. Ko ekipa obstaja, sama stara referenca ne podeli
dostopa. Seznam je po nujnosti in terminu; UI privzeto skrije zaključene/preklicane,
ohrani pripenjanje in omogoča zgodovinski prikaz. Podrobnosti vsebujejo čas dodelitve,
začetek, konec/rok, lokacijo in lastnika. Pri starih prenesenih članstvih datum dodelitve
pomeni čas migracije, ker izvorna aplikacija zgodovinskega časa ni hranila.

US-07: `GET /employees/:employeeId/services/:serviceId` preveri sejo in trenutno
dodelitev. Vrne osnovne podatke elektrarne, znane tehnične podatke, opis okvare,
ekipo in največ pet zadnjih zaključenih servisov iste elektrarne. Zgodovina vsebuje
samo oddana poročila, njihove ugotovitve, rezultat in strukturirane dele.
Za znane menjave se prikaže proizvajalec, namestitev in približna starost v dnevih.
Neznani stari podatki so označeni kot neznani; ne izmišljamo opreme ali datumov.
Serviser teh podatkov ne more spreminjati. Lastnik ne dobi internih poročil.

US-05: samo trenutni vodja ekipe piše in odda skupno poročilo. Ostali člani lahko
preberejo podrobnosti svoje naloge in zgodovino. Za en servis obstaja največ eno
poročilo, osnutek se ureja, oddano pa je zaklenjeno. Vnos in spremembe preverja API,
zato skrivanje gumbov ni varnostna meja. Po začetku osnutka se vodje ne zamenja;
ostali člani in termin se še lahko uredijo, brez izgube avtorstva.

## Poročilo in API

Obstoječe poti ohranijo pogodbo `{ report }` oziroma `{ reports }`:

- `GET/POST /employees/:employeeId/service-reports`
- `PUT /employees/:employeeId/service-reports/:reportId`
- `POST /employees/:employeeId/service-reports/:reportId/submit`

Osnutek potrebuje `work_summary` (neprazno, do 4000 znakov). Ohranijo se
`findings`, `recommendations` (do 4000), `reported_at` in `id_service` ob ustvarjanju.
PUT delno posodobi osnutek, ne spremeni servisa ali avtorja. Pred oddajo so obvezni:

| Polje | Pravilo |
| --- | --- |
| `performed_at` | Veljaven datum/čas s časovnim pasom, ne prihodnost (do minute tolerance ure) |
| `plant_condition` | `operational`, `limited`, `not_operational` |
| `outcome` | `resolved` ali `follow_up` |
| `fault_found` | boolean, izrecno da ali ne |
| `fault_cause` | Ob napaki neprazno besedilo do 2000 znakov |
| `parts_used` | Do 50 postavk; lahko prazno, če deli niso bili uporabljeni |

Postavka dela: `name` (do 100), `manufacturer` (do 100 ali null), `quantity`
(celo 1–10000), `replaced` (boolean) in `installed_on` (znan datum ali null).
Pri novem zamenjanem delu brez datuma API uporabi datum izvedbe, ker se del
zabeleži kot nameščen pri tem posegu. Poljubna stara neznana oprema se ne dopolnjuje.
Neveljavni vnosi ali nepopolna oddaja vrnejo 400, nedostopen zapis 404, zaklenjeno
poročilo/podvojitev 409, neprijavljen 401 in napačna vloga/ID zaposlenega 403.

Shranjevanje osnutka označi servis `in_progress`. Oddaja zaklene zahtevek, servis
in poročilo v enakem vrstnem redu kot razporejanje. Transakcija zabeleži oddajo,
zaključi servis, nastavi `completed_at` in posodobi stanje zahtevka:

- Drugi aktivni servisi istega zahtevka → ostane `scheduled`.
- Potreben nadaljnji poseg → `follow_up_required=true`, brez drugih aktivnih servisov `reviewing`.
- Vse delo opravljeno brez nerešene težave → `completed`.

Nova dodelitev vodje za nadaljevanje potrdi prevzem nerešene težave in počisti
zastavico, hkrati ustvari novo aktivno delo. Zgolj sprememba termina je ne počisti.
Ob napaki se transakcija razveljavi. Sočasna dvojna oddaja povzroči samo en
zaključek in en komplet obvestil. Lastnik prejme samo obvestilo o stanju, brez
internega vzroka, ugotovitev ali poročila. Vodja prejme poročilo in obvestilo.

Migracija 008 ohrani stara poročila in doda nullable strukturirana polja ter
seznam delov. Staro oddano poročilo ostane zaklenjeno, neznana polja ostanejo neznana.
Zaloga delov in njeno avtomatsko zmanjšanje (US-10) nista del te naloge.

## Dokazila po merilih

| Merilo | Status in dokaz |
| --- | --- |
| US-06/1,5 lastne dodelitve | PASS – testi obeh članov, tujega servisa, odstranitve in vloge |
| US-06/2 nujnost | PASS – API vrstni red, React test in ohranjeno pripenjanje |
| US-06/3 časi in podatki | PASS – čas članstva, konec termina/rok in browser podrobnosti |
| US-06/4 pinned | PASS – obstoječi testi lokalne shrambe in pripenjanja ostanejo uspešni |
| US-07/1 podatki in okvara | PASS – endpoint/React ter dejanski browser |
| US-07/2 zadnjih 5 | PASS – test sedmih zaključenih zapisov vrne najnovejših pet |
| US-07/3 deli, starost, proizvajalec | PASS za zabeležene podatke – strukturirane menjave in prikaz; stara neznana oprema ostane neznana |
| US-07/4 samo branje | PASS – sejna zaščita in brez tehnikovih poti za spremembe elektrarn |
| US-05/1 dodelitev/poročilo | PASS – član bere, samo vodja piše |
| US-05/2 strukturiran obrazec | PASS – validacije, React polja in browser vnos dela/proizvajalca |
| US-05/3 urejanje do oddaje | PASS – osnutek, zaklep, sočasna oddaja 200/409 |
| US-05/4 potrditev | PASS – prikaz shranitve osnutka in zaključka v browserju |

Končni pregledi: 69 backend in 59 frontend testov, oba lint in build. Migraciji
007/008 sta lokalno preverjeni tudi ob ponovitvi. Playwright MCP je preveril managerjevo
dodelitev dvočlanske ekipe, koledar, serviserjeve podrobnosti in oddajo dela s količino,
managerjev prikaz poročila ter lastnikovo zaključeno stanje in obvestilo. Pregledana
namizna in mobilna postavitev, brskalnik zaprt. Oddaljeni CI/produkcija nista preverjena.
