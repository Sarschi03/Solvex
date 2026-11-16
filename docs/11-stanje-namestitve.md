# Stanje namestitve

## PostgreSQL na Renderju

Ustvarjeno in preverjeno 16. 11. 2026:

- Ime: `solvex-db`.
- Paket: **Free**, brez visoke razpoložljivosti in samodejnega povečevanja diska.
- Regija: Frankfurt.
- PostgreSQL: 18.
- Iztek brezplačne baze: **16. 12. 2026**.
- [Render Dashboard](https://dashboard.render.com/d/dpg-dbtd076k1f9s73c733r0-a).

Inicializirana je shema iz `database/schema.sql`, zabeležena kot
`001-initial-schema` v `solvex_migrations`. Preverjene so tabele `customers`,
`employees`, `managers`, `solar_plants`, `service_requests`, `services`,
`service_reports` in `solvex_migrations`.

Inicializacija je uporabila TLS s preverjanjem certifikata. Začasni zunanji dostop
je po inicializaciji odstranjen (`ipAllowList: []`); baza je namenjena interni
povezavi Render backenda. Povezovalni podatki in API ključ niso zapisani v Git.
Lokalni ali osebni podatki niso bili preneseni v oblak.

## Še potrebno za celotno aplikacijo

Frontend za Vercel Hobby je pripravljen, vendar še ni objavljen. Backend storitev
še ni nameščena oziroma povezana z bazo. Sama baza nima uporabniškega javnega
URL-ja aplikacije in ne nadomesti uspešnega joba `deploy`.

Po objavi backenda je treba nastaviti proxy `BACKEND_ORIGIN`, povezati Vercel
račun, nastaviti GitHub environment secrets/variables, preveriti samodejno
namestitev po združitvi PR-ja ter dodati javni URL v README in datoteko za oddajo.
