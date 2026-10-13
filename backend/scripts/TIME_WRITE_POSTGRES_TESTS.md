# Tidskrivning mot lokal PostgreSQL

`npm run test:time:postgres` kör riktiga Prisma-transaktioner och Fastify-anrop. Testet tillåter endast denna separata, syntetiska databas:

```text
postgresql://time_write_test:time_write_test@127.0.0.1:65434/tidapp_time_write_test
```

Adressen måste uttryckligen anges i `TIME_WRITE_TEST_DATABASE_URL`. Testet avvisar andra adresser innan Prisma laddas och kontrollerar databasnamn, användare, serveradress och port före skrivning. Ärvt `DATABASE_URL` används aldrig som reserv. Kopiera inte produktion till testdatabasen.

Skapa en ny lokal PostgreSQL-datakatalog med `initdb`, starta den med `pg_ctl` och serverargument `-o "-h 127.0.0.1 -p 65434"`, och skapa användaren/databasen ovan. Använd en uppgiftsspecifik katalog och starta ingen Windows-tjänst. Från backend i en separat PowerShell-process:

```powershell
$env:DATABASE_URL = 'postgresql://time_write_test:time_write_test@127.0.0.1:65434/tidapp_time_write_test'
$env:TIME_WRITE_TEST_DATABASE_URL = $env:DATABASE_URL
& .\node_modules\.bin\prisma.cmd migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'Lokal migration misslyckades' }
npm run test:time:postgres
if ($LASTEXITCODE -ne 0) { throw 'Tidskrivningstester misslyckades' }
```

Nio fall verifierar dubblettåterförsök, ändrat innehåll med samma nyckel, radering och gamla återförsök, konkurrerande revisioner, rollback vid loggningsfel, atomisk semestervecka, attest/upplåsning/rättelse, attest samtidigt med redigering, företagsgränser samt återinskickning av upplåst vecka utan ändrade timmar.

Varje körning skapar nya syntetiska företag. Befintliga rader raderas inte. Kvittotabellen är avsiktligt oföränderlig: använd **en ny databas/datakatalog** för en helt ren körning. Seed är ingen återställningsväg för en databas med kvitton och stoppar innan data raderas. Stäng just denna instans med `pg_ctl -D <testets datakatalog> -m fast -w stop`; bevara katalogen för felsökning.

Kör `npm run build` efter avslutade tester och lokal API-server. På Windows kan Prisma-processer annars låsa DLL-filen under `prisma generate`.
