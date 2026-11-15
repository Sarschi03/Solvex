# CI/CD z GitHub Actions

## Obnašanje cevovoda

Datoteka `.github/workflows/ci-cd.yml` se zažene ob vsakem pushu, ob pull requestu
v `main` in ročno (`workflow_dispatch`). Ločeni opravili za frontend in backend
izvedeta `npm ci`, ESLint, produkcijsko gradnjo in teste. Backend dobi svežo
PostgreSQL 18 storitev, preveri prvi ter ponovni zagon migracije in zažene 9
integracijskih testov. Frontend zažene 5 testov prijave z Vitest in Testing Library.
Gradnji sta shranjeni kot artefakta za sedem dni.

Opravilo `deploy` se izvede samo ob pushu v `main`, tudi po združitvi PR-ja,
in šele po uspehu obeh preverjanj. Render deploy hook dobi natančen preizkušeni
commit SHA. Cevovod počaka, da `/api/health` potrdi povezavo z bazo in isti SHA;
sprožitev namestitve sama po sebi še ne šteje kot uspeh. PR in ročni zagon ne
nameščata aplikacije. Brez nastavitev za Render namestitev jasno odpove.

## Gostovanje celotne aplikacije

`render.yaml` opiše Node.js web service in PostgreSQL v Frankfurtu. React se
zgradi v `frontend/dist`, Express pa v produkciji streže statične datoteke in API
na istem naslovu. Zato ni potrebna ločena CORS konfiguracija. Render določi `PORT`,
podatke baze pa Blueprint poveže prek okolijskih spremenljivk.

Izbrana sta brezplačna paketa za demonstracijo; pred ustvarjanjem preverite
trenutno razpoložljivost, omejitve in veljavnost brezplačne baze pri ponudniku.
Konfiguracija ne ustvari plačljivih virov samodejno. Demo seed se na Renderju ne
izvaja. Pri vsakem zagonu se izvede migracija, ki znotraj transakcije in zaklepa
ustvari začetno shemo samo enkrat. Migracija je namenjena novi bazi; obstoječa
baza iz druge namestitve zahteva posebej pripravljeno migracijo.

## Aktivacija namestitve

1. Spremembe združite v `main` svojega forka, ne izvornega repozitorija.
2. V [Render Dashboard](https://dashboard.render.com/) izberite New → Blueprint,
   povežite `Sarschi03/Solvex` in uporabite `render.yaml` z veje `main`.
   Preverite izbrane pakete pred potrditvijo ustvarjanja virov.
3. V Settings nastalega web servisa kopirajte skrivni Deploy Hook URL.
4. V [GitHub Actions settings](https://github.com/Sarschi03/Solvex/settings/secrets/actions)
   dodajte secret `RENDER_DEPLOY_HOOK_URL` s celotnim hook URL-jem.
5. V Settings → Secrets and variables → Actions → Variables dodajte repository
   variable `RENDER_APP_URL`, npr. dejanski `https://ime-servisa.onrender.com`.
   Enaki imeni lahko nastavite tudi v environment `production`.
6. Združite naslednji PR v `main`. V Actions preverite obe preverjanji in
   uspešno opravilo Deploy to Render, nato odprite aplikacijo in `/api/health`.

Renderjeva lastna samodejna namestitev je izključena (`autoDeployTrigger: off`),
da spremembe ne obidejo GitHub preverjanj. Začetni uvoz Blueprinta lahko izvede
prvo namestitev. Če prvi push v `main` steče pred nastavitvijo hooka, bo CI uspešen,
deploy pa bo odpovedal z navodilom; po nastavitvi uporabite Re-run failed jobs.

Za demonstracijo aplikacije na javni storitvi uporabljajte izključno izmišljene
podatke. Prevzeti API še nima sej in preverjanja pravic (podrobnosti v pregledu
projekta). Za pravo uporabo je treba te pomanjkljivosti odpraviti.

## Lokalno preverjanje

Po zagonu baze in pripravi `.env` v posamezni mapi:

```powershell
cd backend
npm ci
npm run lint
npm run build
npm run db:migrate
npm run db:migrate
npm test
cd ../frontend
npm ci
npm run lint
npm run build
npm test
```

Backend uporablja TypeScript 6.0.3, ker trenutni `typescript-eslint` podpira
TypeScript pod 6.1; izvorni TypeScript 7 ni združljiv z njegovim peer dependency.
`npm audit` je ob pregledu po varnih popravkih še poročal o zmernih opozorilih v
razvojni odvisnosti `minimatch` prek `typescript-eslint`; prisilna nezdružljiva
nadgradnja oziroma znižanje različic ni bilo uporabljeno.

## Viri

- [GitHub: PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)
- [Render: Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render: deploy hooks in GitHub Actions](https://render.com/docs/deploy-hooks)
