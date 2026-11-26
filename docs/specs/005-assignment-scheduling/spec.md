# Dodeljevanje, ekipe in termini – US-09, US-11, US-12

Vodja ima stran »Razporeditev«: izbere zahtevek, tip servisa, začetek/konec termina,
enega ali več serviserjev in točno enega vodjo ekipe. Odgovornost člana ustreza
njegovi trenutni specializaciji (čiščenje, elektro servis ali montaža). Več različnih
specializacij je lahko v isti ekipi. Vodja preveri razpoložljivost in vidi aktivne naloge.

Migracija 007 doda `service_assignments` (M:N servis–serviser), `scheduled_end_at`
in `notifications`. Stari `services.id_employee` ostane referenca na vodjo za združljivost.
Obstoječi zapisi se prenesejo v enočlanske ekipe; ker zgodovinski čas dodelitve ni znan,
je začetni `assigned_at` čas migracije. Stari termini brez trajanja dobijo eno uro.
Nove dodelitve zahtevajo izrecen začetek in konec. Konec termina predstavlja tudi rok.

## API in pravila

- `GET /managers/schedule`: pregled vseh dodelitev in članov.
- `GET /managers/availability?start=...&end=...&exclude_service_id=...`: specializacija,
  aktivna obremenitev, prost/zaseden in prekrivajoči termini. Čas zahteva časovni pas.
- `POST /managers/services`: `request_id`, `service_type`, `scheduled_at`,
  `scheduled_end_at`, `leader_id`, `assignments: [{ employee_id, responsibility }]`.
- `PUT /managers/services/:id/schedule`: zamenja termin/ekipo; iste podatke kot POST,
  brez obveznega request_id. Zahtevka obstoječega servisa ni mogoče zamenjati.
- `POST /managers/services/:id/cancel`: preklic brez izgube poročil in zgodovine.
- `GET /calendar?from=...&to=...`: vodja vsi aktivni termini, član samo njegovi,
  lastnik samo termini svojih elektrarn. Sosednja termina se ne prekrivata.
- `GET /notifications`, `PATCH /notifications/:id/read`: le obvestila prijavljenega računa.

Shranjevanje v transakciji zaklene zahtevek, servis in ID-je serviserjev v enakem
vrstnem redu. Dostop do skupne ekipe se preveri po trenutnih članstvih. Ob prekrivanju
API vrne 409 tudi pri sočasnih rezervacijah; neveljavna ekipa/termin 400, tuja vloga
403 in neprijavljen račun 401. Zaključeni/preklicani servisi se ne prerazporejajo.
Po začetku osnutka se vodje ne zamenja, da se ne izgubi avtorstvo poročila.
Odstranjeni član izgubi dostop takoj. Čas dodelitve ohranjenega člana ostane nespremenjen.

Nujnost novega servisa se prevzame iz zahtevka. Dodelitev ga označi `scheduled`.
Preklic zadnjega aktivnega servisa zahtevek vrne v pregled, da lahko vodja načrtuje novega.
Obvestila so trajna **v aplikaciji**, dostopna prek zvončka (osvežitev ob odprtju),
za nove/spremenjene termine, odstranitve in preklic. Brez plačljivih storitev ali e-pošte.
Sporočila in dodelitev se zapišejo v isti transakciji.

## Dokazila

| Merilo | Preverjanje |
| --- | --- |
| Več članov, vodja, odgovornosti in obremenitev | Integracijski testi M:N dodelitve, oba člana vidita servis |
| Razpoložljivost in sočasnost | Prekrivanje zavrnjeno, sosednja termina dovoljena, sočasna rezervacija 201/409 |
| Urejanje in odstranitev | Odstranjeni član izgubi dostop in dobi obvestilo |
| Preklic in zgodovina | Servis ostane v bazi, koledar ga skrije, zahtevek vrnjen v pregled |
| Koledar in obvestila | Lastnik/član/vodja, tuji račun izključen, označitev samo lastnega obvestila |
| UI | React testi shranjevanja ekipe, prikaza koledarja in označitve obvestila |

Pred zaključkom: lint, testi in build obeh delov po AGENTS.md. Backend: 63 testov,
frontend: 54 testov. Brskalniški celotni tok se preveri z naslednjim korakom poročil;
na tej točki ga ne predstavljamo kot izvedenega. Produkcija ni spremenjena.
Uporabljeni skilli: solvex-user-story, solvex-api-endpoint, solvex-frontend, solvex-tests.
