## Solvex - opis projekta
Solvex je spletna rešitev za lastnike sončnih elektrarn, ki želijo prijaviti napako ali naročiti redni pregled svoje elektrarne. Serviserji preko sistema prejemajo delovne naloge, beležijo ugotovljene napake, opravljeno delo in pripravljajo poročila o servisih. Vodja servisa uporablja rešitev za razporejanje servisov, dodeljevanje nalog in spremljanje zaloge rezervnih delov. Sistem lastnikom omogoča tudi pregled zgodovine servisov in pridobivanje priporočil za prihodnje preglede.

## Uporabljene tehnologije
- Frontend: React, Typescript, CSS
- Backend: Node.js in Express.js
- Podatkovna baza: PostgreSQL
- Avtentikacija: prijava uporabnikov z uporabo e-poštnega naslova in gesla

## Povezava do dokumentacije
https://github.com/lea250301/Solvex 

## Prevzem projekta in CI/CD

Fork: [Sarschi03/Solvex](https://github.com/Sarschi03/Solvex).
Pregled MVP in petih uporabniških zgodb: [docs/07-pregled-projekta.md](docs/07-pregled-projekta.md).
GitHub Actions in navodila za aktivacijo Render namestitve: [docs/08-ci-cd.md](docs/08-ci-cd.md).

## Zagon

Potrebujete Node.js 24, npm in zagnan Docker Desktop. Iz korenske mape:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
docker compose up -d --wait db
cd backend
npm ci
npm run db:migrate
npm run db:seed:demo
npm run dev
```

V drugem terminalu:

```powershell
cd frontend
npm ci
npm run dev
```

Odprite http://localhost:5173. Lokalna demo prijava je `demo@solvex.local` /
`SolvexDemo123!`; seed je namenjen samo lokalni bazi in vsebuje izmišljene podatke.
Baza je dostopna na `localhost:55432`, backend na `http://localhost:3000`,
preverjanje povezave pa na `http://localhost:3000/api/health`.
Datotek `.env` ne dodajajte v Git. Obstoječih `.env` ne prepisujte, temveč
v njih prilagodite nastavitve po primerih.

Za lokalno preverjanje produkcijskega načina najprej zgradite oba dela:

```powershell
npm ci --prefix frontend
npm run build --prefix frontend
npm ci --prefix backend
npm run build --prefix backend
cd backend
$env:SERVE_FRONTEND = 'true'
npm start
```

Celotna aplikacija je nato dostopna na `http://localhost:3000`. Če na teh vratih
že teče razvojni backend, ga pred produkcijskim zagonom ustavite.
