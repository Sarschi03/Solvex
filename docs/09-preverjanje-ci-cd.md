# Dokaz preverjanj in zaščite veje

Repozitorij: [Sarschi03/Solvex](https://github.com/Sarschi03/Solvex).
Pull request: [#1](https://github.com/Sarschi03/Solvex/pull/1).

## Nastavljene zahteve

GitHub Actions so omogočene. Zaščita veje `main` zahteva pull request, ažurno
vejo in uspešne statuse `lint`, `build`, `test`; uveljavljena je tudi za
administratorja. Force push in brisanje veje sta izključena. Okolje `production`
dovoljuje namestitve samo iz zaščitenih vej.

## Preizkus namerne napake

V PR bo začasno dodana datoteka `frontend/src/ci-failure-demo.ts` z izrecnim
tipom `any`. TypeScript jo lahko prevede, ESLint pravilo
`@typescript-eslint/no-explicit-any` pa mora zavrniti job `lint`.
Napaka ostane na razvojni veji in se ne združi v `main`.

Po dejanskem neuspehu bo datoteka odstranjena, obvezne preverbe ponovno
izvedene, tukaj pa zapisane povezave do obeh izvajanj in stanje blokade.

## Lokalno preverjeno

- 11 integracijskih testov API-ja s PostgreSQL in 7 testov React prijave.
- ESLint in produkcijska gradnja frontenda ter backenda.
- HTML/LCOV poročili: `backend/coverage` in `frontend/coverage`.
- Začetna migracija baze in njena ponovitev brez podvajanja sheme.

Dejanski javni URL in uspešna namestitev bosta zabeležena šele po vzpostavitvi
brezplačnega Render računa in preverjanju objavljene aplikacije.
