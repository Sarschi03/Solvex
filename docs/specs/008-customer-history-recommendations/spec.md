# Lastnikova zgodovina in priporočila – US-03, US-04

## Pravila in API

`GET /plants/:plantId/history` je dovoljen samo lastniku elektrarne. Zbirka
vsebuje samo zaključene servise, padajoče po času izvedbe, nato po ID-ju.
Vrne vrsto servisa, datum, lastnikovo prijavljeno težavo, izrecni povzetek za
lastnika, rezultat/stanje in zabeležene porabljene/zamenjane dele. Čiščenje je
razvidno iz vrste dejansko opravljenega servisa, ne zgolj iz naročene dodatne storitve.
Interna polja poročila (`work_summary`, `findings`, `fault_cause`, interne opombe)
niso vrnjena. Nepovezana/tujа elektrarna vrne 404, prazen seznam ustrezno sporočilo.

Migracija 010 doda `service_reports.customer_summary`: serviser napiše razumljiv
opis opravljenega dela in odprave težave v ločeno polje. Ureja se samo do oddaje.
Stari zapisi ostanejo brez javnega povzetka, UI to pojasni; internega besedila ne
kopiramo samodejno. Poročilo brez tega neobveznega polja ostaja združljivo.

`GET /account/recommendations` vrne shranjeno nastavitev in aktualne predloge.
`PATCH /account/recommendations` sprejme samo `{enabled: boolean}`. Vloga in lastnik
se določita iz seje; sprememba ID-ja v telesu ni dovoljena. Nastavitev je globalna
za elektrarne lastnika in privzeto vklopljena, skladno z merilom možnosti izklopa.

Osnova priporočila je zadnji zaključen servis s povezanim zahtevkom
`regular_inspection` in oddanim poročilom. Samostojno čiščenje ali okvara ne sprožita
letnega priporočila. Neznani ali prihodnji datumi ne štejejo. Leto in mesec sta
koledarska intervala (PostgreSQL prilagodi 29. februar zadnjemu dnevu februarja).
Datumsko pravilo uporablja `Europe/Ljubljana`: leto po izvedbi je rok, en mesec
pred rokom se pojavi predlog. Zapadli predlog ostane, dokler ga ne nadomesti nov
redni pregled; ni obvezna naloga in ne ustvarja zahtevka samodejno.

Trajna obvestila se osvežijo ob zagonu backenda in vsako uro, dodatno ob branju
priporočil/obvestil. Unikatni indeks prepreči ponavljanje za isti letni cikel tudi
pri več procesih. Po novem pregledu stara obvestila niso več prikazana; izklop
prepreči nova in skrije obstoječa priporočila. Ni e-pošte ali zunanjega schedulerja.
Na uspavani brezplačni instanci se osvežitev opravi ob naslednjem zagonu/dostopu.

## Preverjanje in skilli

Uporabljeni skilli `solvex-user-story`, `solvex-api-endpoint`, `solvex-frontend`
in `solvex-tests`: preslikava meril, zaščiten API, ločitev javnih podatkov,
React stanja in integracijski testi na začasni PostgreSQL shemi.
Testi pokrivajo lastništvo, vrstni red, zasebnost, prazno stanje, samo redne
preglede, mejo meseca, nadomestitev cikla, idempotentna obvestila in opt-out.
Produkcija ni bila spreminjana. Objavo vej/PR-jev določi uporabnik.
