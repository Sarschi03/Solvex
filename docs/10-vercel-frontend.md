# Frontend na Vercel Hobby

Frontend se objavi na brezplačnem paketu **Hobby**. Plačljivi paketi, dodatki in
lastna plačljiva domena niso potrebni. Backend in PostgreSQL sta ločena koraka;
sama objava prijavnega obrazca še ne pomeni delujoče celotne aplikacije.

## Paket za objavo

Iz korena projekta:

```powershell
npm ci --prefix frontend
npm run build --prefix frontend
npm run prepare:vercel --prefix frontend
```

Zadnji ukaz samo zapakira obstoječi `frontend/dist` v Vercel Build Output API
obliko `frontend/.vercel/output`. Ne izvaja nove gradnje. Isto vsebino shranjuje
job `build` kot artefakt `vercel-frontend`. V jobu za namestitev se paket prenese
z `actions/download-artifact` in objavi z `vercel deploy --prebuilt --prod`.

Za dejansko povezavo z API-jem pred pripravo paketa nastavite javni izvor backenda:

```powershell
$env:BACKEND_ORIGIN = 'https://dejanski-backend.onrender.com'
npm run prepare:vercel --prefix frontend
```

Frontend uporablja `VITE_API_URL=/api`, Vercel pa te zahteve posreduje na
`BACKEND_ORIGIN/api`. S tem v brskalniku ostane isti izvor in ni potreben CORS.
Vrednost `BACKEND_ORIGIN` se ob pripravi paketa zapiše v konfiguracijo poti.
Brez nje `/api` namerno vrne 503 s pojasnilom, da backend še ni nameščen;
ne prikazuje HTML prijavne strani kot navidezno uspešen API odgovor.

## Račun in objava

Potreben je dostop do uporabnikovega Vercel računa s paketom Hobby. Projekt naj
ima korensko mapo `frontend`. Pri objavi s CLI se mapa poveže z Vercel projektom,
nato se uporabi `vercel deploy --prebuilt --prod`. Mapa `.vercel` je prezrta v Gitu.

`frontend/vercel.json` izključi samodejne Git namestitve, da te ne obidejo
preverjanj v GitHub Actions. Uvoz projekta prek GitHub povezave sam po sebi ni
zamenjava za zahtevani deploy job, ki mora uporabljati že zgrajene artefakte.

Za CI/CD se v okolju GitHub `production` shranijo:

- secret `VERCEL_TOKEN`,
- spremenljivki `VERCEL_ORG_ID` in `VERCEL_PROJECT_ID`,
- spremenljivka `VERCEL_APP_URL` z dejanskim javnim naslovom.

API token se ne zapisuje v kodo. Vercel in GitHub povezava morata biti preverjeni
pred označitvijo namestitve kot uspešne. Dejanski URL bo zabeležen po objavi.

## Viri

- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Prebuilt deployment](https://vercel.com/docs/cli/deploy)
- [Build Output API](https://vercel.com/docs/build-output-api/configuration)
