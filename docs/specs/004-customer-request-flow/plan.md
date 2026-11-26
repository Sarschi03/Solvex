# Načrt izvedbe

1. Preberi US-01, US-02, US-08, model, wireframe in lokalne skille.
2. Iz obstoječe prijavne/lastniške osnove ustvari odvisno vejo `feat/customer-request-flow`.
3. Dodaj migracijo 006 z vrsto okvare, dodatnimi storitvami, nujnostjo in sledjo pregleda;
   ohrani obstoječe zahtevke in povezave servisov.
4. Dodaj varno oddajo, lastnikov seznam/podrobnosti in transakcijsko oceno nujnosti.
5. Poveži obrazca, inline dodajanje elektrarne, potrditev in prikaz stanja/terminov.
6. Razširi inbox vodje z ločenima skupinama in shranjevanjem nujnosti.
7. Testiraj tuje ID-je, vloge, validacije, skrite interne podatke in rollback;
   preveri uporabniški uspeh, napake, prazna stanja in ponovni poskus.
8. Poženi lint, teste in gradnjo obeh delov. Migracijo preveri tudi ob ponovitvi.
9. S Playwright MCP preveri celoten lokalni tok lastnik → vodja → lastnik po reloadu.
10. Pripravi slovenski opis PR in lokalni commit. Uporabnik objavi vejo in odpre PR.
