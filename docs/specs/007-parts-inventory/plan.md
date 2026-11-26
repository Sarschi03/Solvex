# Načrt izvedbe

1. Ohraniti ločen objavljen PR za serviserjev tok in nadaljevati na odvisni veji.
2. Dodati migracijo kataloga, dnevnika in opozoril brez prepisovanja starih poročil.
3. Povezati postavke osnutka s katalogom ter odpis priključiti isti transakciji
   kot oddajo in zaključek. Zaklepi imajo določen vrstni red, dnevnik unikatnost.
4. Dodati vodjev bralni pregled ter trajna obvestila z mejo dopolnitve.
5. Preveriti konkurenco, rollback, stare zapise, pravice in dejanski brskalniški tok.
6. Dokumentirati lokalno vzdrževanje; commit v slovenščini, brez drugega pusha.
