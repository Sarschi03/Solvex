# Izvedba in preverjanje

- [x] Zahteve US-01/02/08 prevedene v polja, pravice in merila.
- [x] Migracija 006 uporabljena lokalno in ponovljena brez sprememb.
- [x] POST/GET zahtevkov in lastnikov pregled servisov; preverjanje lastništva.
- [x] Pregled vodje in transakcijska ocena nujnosti z revizijsko sledjo.
- [x] Povezani aktivni servisi prejmejo nujnost; zaključeni ostanejo nespremenjeni.
- [x] Obrazca za okvaro/pregled, dodajanje elektrarne, potrditev in statusna stran.
- [x] Inbox vodje z ločenima skupinama, filtrom, podatki in oceno.
- [x] API testi: uspeh, napačni vnosi/vloge/lastnik, skriti zapisniki, zaklenjena stanja, rollback.
- [x] React testi: zahtevana polja, extras/datum, dodajanje elektrarne, ponovni poskus,
      ohranjen vnos, dvojni klik, stanje po oddaji in managerjev uspeh/napaka.
- [x] Backend: lint, 57/57 testov in gradnja. Frontend: lint, 51/51 testov in gradnja.
- [x] Playwright MCP: lastnik doda elektrarno in oba zahtevka, vodja vidi oba ter
      nastavi visoko nujnost; lastnik vidi »V pregledu« in visoko nujnost po reloadu.
- [x] Pregled postavitve pri 1440 in 390 px; brskalnik po preverjanju zaprt.
- [x] README, model, specifikacija in lokalni slovenski osnutek PR.
- [ ] Uporabnik objavi vejo in odpre PR; oddaljeni CI in merge še nista izvedena.

Skilli: `solvex-user-story` za merila in obseg, `solvex-api-endpoint` za SQL/seje/statusne
kode, `solvex-frontend` za forme/hooks/stanja ter `solvex-tests` za integracijske in React teste.
