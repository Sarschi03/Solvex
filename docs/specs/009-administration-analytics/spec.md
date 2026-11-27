# Administracija in analize – US-15, US-14

## Dogovor in obseg

Uporabnik je potrdil: US-13 in stikala funkcionalnosti se izvedejo pozneje.
V tej izvedbi zato ni dinamičnega nalaganja kode ali stikal osnovnih postopkov.
Pripravljene veje se objavijo v ločenih odvisnih PR-jih na Sarschi03/Solvex.
Merge, produkcijske migracije in deployment niso izvedeni.

## US-15: identiteta, vloga in aktivnost

Migracija 012 doda `administrators` in `account_registry`. Register poveže profile
istega računa in določa eno aktivno vlogo ter omogočenost. Obstoječe lastnike,
zaposlene in vodje ohrani; insert trigger registrira tudi nove račune.
Administrator nima javne registracije. Vsi se prijavijo prek `/auth/login`.
Vloga je določena na strežniku. Obstoječe posebne prijavne poti prav tako
preverijo aktivnost in trenutno vlogo; z njimi blokade ni mogoče obiti.

- `GET /admin/accounts`: seznam registriranih identitet, imen, e-pošte, vloge/stanja.
- `PATCH /admin/accounts/:accountId`: vloga in/ali omogočenost, po potrebi dodatni
  obvezni podatki novega profila (telefon, specializacija, naslov).
- `GET /admin/audit`: zadnjih 100 sprememb vlog/stanja z administratorjem in časom.
- Samo administrator lahko upravlja račune. Vodja, serviser in lastnik nimajo dostopa.
- Administrator ne dostopa do servisnih postopkov; za drugačno delo mora biti
  računu izrecno določena druga vloga. Seje uporabljajo iste obstoječe mehanizme.
- Sprememba vloge in deaktivacija prekličeta vse prejšnje seje. Vsak zaščiten
  endpoint še vedno preveri register. Ponovna aktivacija zahteva novo prijavo.
- Uporabniško ime se prenese na aktivni profil. Obstoječi podatki lastništva,
  dodelitev in poročil ostanejo povezani s prvotnimi profili; vrnitev na staro
  vlogo obnovi isti profil. E-poštni konflikt z drugo identiteto vrne 409, ne združi oseb.
- Serviser/vodja z aktivnimi servisi mora delo najprej prerazporediti. Onemogočeni
  ali drugače razvrščeni računi niso na seznamu razpoložljivih serviserjev.
- Administrator ne more odstraniti lastnega administratorskega dostopa; zadnji
  aktivni administrator mora ostati. Spremembe se serializirajo in zapišejo v audit.
- API ne vrača gesel, hashov ali sejnih žetonov. Brisanja računov ni: merilo zahteva
  deaktivacijo, ohranjanje zgodovine pa prepreči izgubo povezanih podatkov.

Za lokalni šolski preizkus po migraciji izvedi:

```powershell
npm run db:seed:admin --prefix backend
```

Ukaz dovoli samo lokalno bazo. Ustvari demonstracijski `admin` / `geslo123`,
obstoječega računa pa ne prepiše. To ni produkcijski način priprave administratorja.
Produkcijski administrator se pripravi ločeno z varno posredovanim geslom.

## Katalog delov

Administrator ima `/admin/inventory` za branje in dodajanje kataloškega dela ter
`PATCH /admin/inventory/:partId` za absolutno količino, mejo in aktivnost.
Sprememba zaklene isto vrstico kot poraba poročila, zapiše razliko v dnevnik in
uskladi opozorilo. Negativne količine so zavrnjene. Vodja ohrani samo bralni pogled.
Opozorilo ob dopolnitvi se zaključi; ustvarjanje/urejanje kataloga se prikaže v
vodjevem pregledu, poraba po poročilu pa ohrani svoja obvestila iz specifikacije 007.

## US-14: zahteva → priprava → posredovanje

1. Vodja na strani Analize izbere vključujoče datumsko obdobje in združevanje po
   proizvajalcu, moči ali letu namestitve; `POST /managers/analytics-requests`.
2. Administrator vidi vložene zahteve. Brez zahteve vodje analize ne generira.
3. `POST /admin/analytics-requests/:requestId/share` izračuna in shrani posnetek
   ter ga v isti transakciji označi kot posredovanega vlagatelju.
4. `GET /analytics-requests`: administrator vidi vse zahteve, vodja samo svoje.
   Posredovana razpredelnica je trajno dostopna vlagatelju v aplikaciji. Za novo
   stanje podatkov se vloži nova zahteva; že posredovanega posnetka ne prepisujemo.

Analiza šteje zaključene servise z oddanim poročilom in znanim časom izvedbe
(nadomestno `completed_at`). Datumsko obdobje uporablja `Europe/Ljubljana`.
`faults` je število poročil z izrecno ugotovljeno napako, `repairs` podmnožica z
rezultatom `resolved`. Neznano stanje napake se šteje posebej. To je število
evidentiranih servisnih dogodkov, ne ocena vseh fizičnih okvar ali delov.
Manjkajoč proizvajalec/moč/leto je »Ni podatka«; prazno obdobje ostane prazno.
Združevanje uporablja trenutno shranjene podatke elektrarne; zgodovinskih
posnetkov proizvajalca/moči ta podatkovni model nima. Internih zapisnikov analiza ne razkriva.

## Dokazila

Uporabljeni skilli: solvex-user-story, solvex-api-endpoint, solvex-frontend in
solvex-tests. Integracijski testi uporabljajo pravo PostgreSQL bazo v začasni shemi.

| Merilo | Preverjanje |
| --- | --- |
| US-15/1 pregled in sprememba vlog | API/React, prenos username in vrnitev ohrani elektrarno |
| US-15/2 dovoljenja | 401/403, administrator brez servisnih postopkov, napačna vloga brez pravic |
| US-15/3 aktivacija/deaktivacija | preklic sej, stare prijavne poti, ponovna prijava, aktivne dodelitve |
| US-14/1 zahteva vodje | zaščiten vložnik in generiranje samo obstoječe zahteve |
| US-14/2 štetje napak/popravkov | preverjene znane količine po treh skupinah |
| US-14/3 obdobje in prikaz | validacija datumov, prazni podatki, prava HTML razpredelnica |
| US-14/4 posredovanje | nespremenljiv posnetek, prikaz samo vlagatelju |
| US-13 | Odloženo po izrecni izbiri uporabnika |

Playwright MCP je lokalno preveril lastnikovo zgodovino in zasebnost, priporočila
z izklopom/vklopom, prijavo administratorja, pripravo analize ter njen prikaz pri
vodji. Pregledani namizni/mobilni posnetki; brskalnik zaprt. Migracije in lokalni
admin seed so preverjeni tudi ob ponovitvi. Produkcija ni spremenjena.

Končni lokalni pregledi: 99 backend testov in 70 frontend testov, oba lint in
obe produkcijski gradnji. Frontend je zaradi uspavanja/obremenitve računalnika
preverjen tudi z `npm test --prefix frontend -- --maxWorkers=1 --testTimeout=30000`;
vsa pričakovanja ostanejo nespremenjena. Zgodnje neuspešne zagone je nadomestil
uspešen celoten zagon brez neobravnavanih napak. Oddaljeni CI ni potrjen s temi
lokalnimi rezultati; odvisne PR-je je treba združevati po vrsti in ciljati na main
za obvezne GitHub preverbe obstoječega workflowa.
