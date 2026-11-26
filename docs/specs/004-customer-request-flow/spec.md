# US-01, US-02 in US-08 – tok zahtevkov

## Obseg in vloge

Lastnik lahko v obrazcu izbere svojo elektrarno ali doda novo, odda okvaro oziroma
redni pregled ter po potrditvi spremlja shranjene zahtevke in servise.
Vodja prejme vse zahtevke v trajnem inboxu, ločeno po tipu, in določi nujnost.
Serviser zahtevkov ne upravlja; vidi nujnost dodeljenega servisa.
Uporabniški vmesnik uporablja obstoječo svetlo temo in slovenska besedila.

Obrazec za dodajanje elektrarne uporablja obstoječi `/api/plants` in njegove
obvezne podatke (ime, naslov, poštna številka, kraj). Samostojna stran upravljanja
elektrarn ostane naslednja UI naloga, urejanje pa je že podprto prek API-ja.

## Pogodba API

Vse poti preverjajo sejo. Brez nje vrnejo 401, napačna vloga 403.
Lastništvo se preveri v SQL po elektrarni; polje ali query parameter uporabnika
ne razširi dostopa. Tuj in neobstoječ posamezen zapis imata enak odgovor 404.

| Metoda in pot | Vloga in odgovor |
| --- | --- |
| `POST /api/requests` | Lastnik; 201 `{ message, request }` |
| `GET /api/requests` | Lastnik; 200 `{ requests, services }`, samo njegovi podatki |
| `GET /api/requests/:requestId` | Lastnik; 200 `{ request }` |
| `GET /api/managers/requests` | Vodja; 200 `{ requests }`, vsi lastniki, najnujnejši prvi |
| `PATCH /api/managers/requests/:requestId/urgency` | Vodja; 200 `{ request }` |

POST sprejme samo naslednja polja:

| Polje | Validacija |
| --- | --- |
| `id_solar_plant` | Veljaven pozitiven BIGINT ID elektrarne lastnika; niz ali varno celo JSON število |
| `request_type` | `fault_report` ali `regular_inspection` |
| `fault_type` | Obvezno za okvaro; obrezano neprazno besedilo do 100 znakov; za redni pregled ni dovoljeno |
| `description` | Obvezno za okvaro; za pregled neobvezno; obrezano besedilo do 4000 znakov |
| `requested_services` | Neobvezna zbirka enoličnih oznak dodatnih storitev; samo pri pregledu |
| `preferred_date` | Neobvezen veljaven datum YYYY-MM-DD danes ali v prihodnosti glede na UTC dan strežnika |

Dodatne storitve: `panel_cleaning`, `battery_inspection`, `electrical_inspection`,
`mounting_inspection`. Sam redni pregled ne zahteva dodatnih storitev.
Datum je želja, ne rezervacija termina. Neznana polja (npr. status, nujnost,
lastnik) vrnejo 400. Tudi napačna polja, tipi, datumi ali podvojene oznake vrnejo 400.

```json
{
  "id_solar_plant": "4",
  "request_type": "fault_report",
  "fault_type": "Razsmernik",
  "description": "Razsmernik se ne vklopi."
}
```

```json
{
  "id_solar_plant": "4",
  "request_type": "regular_inspection",
  "requested_services": ["panel_cleaning", "battery_inspection"],
  "description": "Prosim še za pregled priključkov."
}
```

PATCH sprejme samo `{ "urgency": "nujno" }` oziroma `resno` ali `standardno`.
Preslikava: nizka = standardno, srednja = resno, visoka = nujno (obstoječa shema servisov).
Ocena nastavi vodjo/čas pregleda in spremeni `submitted` v `reviewing`; že `scheduled`
se ohrani. Pri zaprtih stanjih (`completed`, `rejected`, `cancelled`) vrne 409.
Zahtevek in njegovi aktivni servisi se posodobijo v eni transakciji; zaključeni ali
preklicani servisi ohranijo zgodovinsko nujnost. Napaka razveljavi celotno spremembo.
Pri prihodnjem dodeljevanju novih servisov mora ta funkcija uporabiti trenutno nujnost zahtevka.

Lastnikov seznam zahtevkov je urejen po času od najnovejšega; vsebuje tudi že
zaključene zapise, ki jih vmesnik privzeto skrije. Servisi so prikazani ločeno s
stanjem in dejanskim terminom. API vrne samo javna polja servisov, brez internih
opomb ali zapisnikov. Inbox vodje vključuje čas, opis, tip, naslov, osnovne podatke
elektrarne ter ime in kontakt lastnika. Stare okvare brez vrste dobijo pojasnilo »Ni zabeležena«.

## Omejitve tega koraka

Posredovanje pomeni shranjen zahtevek v inboxu; ne pošilja e-pošte. Oddaja ne
ustvari dodeljenega servisa ali potrjenega termina. Dodeljevanje (US-09), skupine,
koledar/termini (US-12), zaloga in dodatni življenjski prehodi zahtevkov so ločene naloge.
Za običajen dvojni klik vmesnik med oddajo blokira ponovni submit; ponovljen ločen
POST predstavlja nov zahtevek, API nima ključa idempotentnosti.

## Sprejemna merila in dokazila

| Merilo | Status | Dokaz |
| --- | --- | --- |
| US-01/1: lastnik doda svojo elektrarno | PASS | Inline obrazec, React test in pravi lokalni brskalnik |
| US-01/2: izbere elektrarno, vrsto in opis okvare | PASS | Obrazec, API validacije/lastništvo, React in browser tok |
| US-01/3: shrani, posreduje vodji in potrdi | PASS | Preverjanje PostgreSQL, inbox in potrditev v brskalniku |
| US-02/1: lastnik doda elektrarno | PASS | Isti skupni tok kot US-01 |
| US-02/2: redni pregled in dodatne storitve | PASS | React test in dejanska oddaja s čiščenjem panelov |
| US-02/3: shranjevanje, inbox in potrditev | PASS | API in end-to-end lokalni browser tok |
| US-08/1: vodja vidi vse tipe zahtevkov | PASS | API podatki dveh lastnikov in oba tipa |
| US-08/2: okvare ločeno od pregledov | PASS | Ločeni UI skupini, filter, React in browser preverjanje |
| US-08/3: čas, napaka, elektrarna in lastnik | PASS | Pogodba API, testi in pregled inboxa |
| US-08/4: tri stopnje nujnosti in prikaz serviserju | PASS | API test vseh stopenj; povezan aktivni servis v odgovoru serviserja |
| Shranjeno stanje po ponovnem nalaganju | PASS | Browser: visoka nujnost in »V pregledu« po reloadu lastnika |
| Izolacija, rollback, napake in dvojni klik | PASS | Integracijski in React testi |
| Lint/testi/gradnja | PASS | Backend 57 in frontend 51 testov; oba lint in build |
| Produkcija in oddaljeni PR/CI | NOT VERIFIED | Lokalna priprava brez pusha po navodilu uporabnika |
