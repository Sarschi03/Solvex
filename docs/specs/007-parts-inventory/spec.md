# Deli in zaloga – US-10 ter deli US-05

Veja `feat/parts-inventory` izhaja iz `feat/technician-workflow`. Prvi korak je
objavljen v [PR #3](https://github.com/Sarschi03/Solvex/pull/3), drugi ostaja lokalen.
Uporabljeni so skilli solvex-api-endpoint, solvex-frontend in solvex-tests.

## Pogodba in pravice

- `GET /inventory/parts`: prijavljen serviser ali vodja prebere aktivni katalog.
- `GET /managers/inventory`: samo vodja prebere katalog, odprta opozorila in
  zadnjih 100 premikov s povezavo na servis in poročilo. Posnetek je konsistenten.
- Lastnik nima dostopa. Vnos poročila in oddaja ohranita preverjanje trenutne
  dodelitve ter vodje ekipe iz specifikacije 006.
- Postavka poročila vsebuje `inventory_part_id`, količino in podatke o menjavi.
  API naziv/proizvajalca prebere iz kataloga; odjemalec ju ne more ponarediti.
  Količina je celo število 1–10000, največ 50 postavk na poročilo.
- Stare neknjižene postavke ostanejo berljive, pred novo oddajo pa jih je treba
  povezati s katalogom. Stara že oddana poročila se ne knjižijo za nazaj.
- Poročilo brez porabljenih delov je veljavno. Osnutek ne rezervira zaloge.

## Transakcija oddaje

Po zaklepu zahtevka, servisa in poročila se enake dele sešteje. Zaloga se zaklene
po naraščajočih ID-jih, tudi če je uporabnik postavke vnesel v drugačnem vrstnem
redu. Pred zapisovanjem se preveri obstoj, aktivnost in količina vseh delov.
Pomanjkanje vrne 409 in ohrani osnutek; nepovezana stara postavka vrne 400.

V isti transakciji se zmanjša zaloga, zapiše dnevnik, označi
`inventory_posted_at`, odda/zaklene poročilo, zaključi servis, posodobi zahtevek
in zapiše obvestila. Vsaka napaka razveljavi celoto. Unikatnost
`(report_id, part_id)`, zaklep poročila in kontrola oddaje preprečijo dvojni odpis.
Sočasni porabi zadnjega kosa ne moreta obe uspeti; zaloga ne postane negativna.
Porabijo se vsi uporabljeni deli, tudi potrošni material brez označene menjave.

Vodja ob oddaji prejme obvestilo s porabljenimi deli in količinami. Pri količini
**manjši ali enaki meji** nastane opozorilo s priporočilom za dopolnitev, poslano
vsem vodjem. Eno odprto opozorilo na del preprečuje ponavljajoča obvestila med
isto epizodo nizke zaloge. Dopolnitev nad mejo opozorilo zaključi; kasnejši padec
lahko sproži novo. UI stanje izračuna tudi neposredno iz količine in meje.

## Model in lokalno vzdrževanje

Migracija 009 doda `inventory_parts`, `stock_movements`, `inventory_alerts`, čas
knjiženja poročila ter vrsto obvestila `low_stock`. Zgodovina poročila hrani
posnetek naziva/proizvajalca ob izbiri; katalog se lahko kasneje spremeni.

Po dokumentaciji vodja zalogo bere, administrator pa jo upravlja. Javnega
administratorskega vmesnika ali širših pravic vodje ta naloga ne dodaja.
Za lokalni razvoj sta na voljo varovana ukaza:

```powershell
npm run db:migrate --prefix backend
npm run db:seed:inventory --prefix backend
npm run inventory:adjust --prefix backend -- --sku FUSE-10A --quantity 10 --threshold 3
```

Seed ob ponovitvi ohrani obstoječo količino. Prilagoditev nastavi absolutno
količino, zabeleži razliko v dnevnik in uskladi opozorilo. Oba ukaza dovolita samo
lokalni `DB_HOST`; povezavo naložita sama brez izpisovanja skrivnosti. Produkcija
ni bila migrirana ali spreminjana.

## Preverjanje

- 83 backend in 63 frontend testov; oba lint in oba build uspešna.
- Prava PostgreSQL baza v ločeni začasni shemi: pomanjkanje, ponovna/sočasna oddaja,
  tekmovanje za zadnji kos, seštevanje postavk, rollback ob napaki dnevnika,
  obratni vrstni red zaklepov, pravice, stari zapisi in dopolnitev/nova epizoda.
- React: katalog v obrazcu, napaka 409 ohrani osnutek, bralni pregled zaloge,
  iskanje, filter in ponovitev nalaganja.
- Playwright MCP: lokalna dodelitev → izbira kataloškega dela → osnutek brez
  porabe → oddaja z enim odpisom → zavrnjena ponovitev → vodjev pregled/obvestilo
  nizke zaloge → dopolnitev in zaključeno opozorilo. Pregledana namizna in mobilna
  postavitev. Brskalnik zaprt. Demo zaloga po preizkusu vrnjena z revizijskim premikom.
- Migracija in seed preverjena tudi ob ponovitvi. Oddaljeni CI in produkcija za
  to vejo nista preverjena, ker spremembe še niso poslane.
