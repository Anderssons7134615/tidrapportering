# Fakturatester mot lokal PostgreSQL

Det separata kommandot `npm run test:invoices:postgres` provar den riktiga Prisma-klienten, transaktioner och Fastify-svar. Det ingår inte i `npm test`, eftersom en separat databas måste vara startad. PDF-tolkningen är ersatt med syntetisk text här; den riktiga PDF-workern har egna tester.

## Avgränsad testmiljö

Använd en **ny, separat lokal PostgreSQL-instans** som endast lyssnar på `127.0.0.1:65432`. Databasen måste heta `tidapp_invoice_test` och användaren `invoice_test`. Testerna tillåter bara exakt följande offentliga testanslutning:

```text
postgresql://invoice_test:invoice_test@127.0.0.1:65432/tidapp_invoice_test
```

Det är avsiktligt inga riktiga inloggningsuppgifter. Kopiera aldrig en produktionsdatabas hit. Testfilen avvisar saknad/annan adress innan Prisma eller appens databasmodul laddas. Den använder aldrig ärvd `DATABASE_URL` som reserv. Före första skrivningen kontrolleras även databasens namn, användare, serveradress och port via SQL.

På Windows kan officiella [PostgreSQL-binärer från EDB](https://www.enterprisedb.com/download-postgresql-binaries) packas upp i en ny uppgiftsspecifik tempmapp. Initiera en ny datakatalog med `initdb`, starta med `pg_ctl` och explicit `-h 127.0.0.1 -p 65432`, och skapa databasen med `createdb`. Ingen Windows-tjänst, global PATH-ändring eller ändring av en befintlig databas behövs. Se [initdb](https://www.postgresql.org/docs/17/app-initdb.html) och [pg_ctl](https://www.postgresql.org/docs/17/app-pg-ctl.html). Starta bakgrundsprocesser dolt; vid `Start-Process` kan `-Wait` vänta även på PostgreSQL-barnprocessen, så vänta på enbart pg_ctl-processens avslut med `WaitForExit()`.

När den nya lokala instansen är verifierad, kör från `backend` i en separat PowerShell-process:

```powershell
$env:DATABASE_URL = 'postgresql://invoice_test:invoice_test@127.0.0.1:65432/tidapp_invoice_test'
$env:INVOICE_TEST_DATABASE_URL = $env:DATABASE_URL
& .\node_modules\.bin\prisma.cmd migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'Lokal migration misslyckades' }
npm run test:invoices:postgres
if ($LASTEXITCODE -ne 0) { throw 'Fakturatester misslyckades' }
```

Kör bygge/`prisma generate` **sekventiellt efter** dessa tester. På Windows kan en testprocess som använder Prisma låsa dess DLL under genereringen.

## Vad som verifieras

- Två uppladdningar av samma fil når dokumentlagringen samtidigt men skapar bara en faktura, ett original och en skapandelogg.
- Två ändringar av samma revision ger en komplett vinnande version och en revisionskonflikt.
- Spara/bekräfta respektive bekräfta/makulera konkurrerar på samma revision utan blandade versioner eller dubbel loggning.
- Ett riktigt SQL-fel vid loggning rullar tillbaka både nya fakturor/original och ändrad revision/projektfördelning. Omförsök lyckas efter att felet tagits bort.
- PDF-byteföljd, datum, företags-/rollskydd och projektets bekräftade inköpssumma fungerar genom Prisma och Fastify. Rättelse tar bort summan tills den bekräftas igen.

En testbarriär kräver två ankomster från riktiga interaktiva transaktioner före skrivningen. Kontrollerna läser sedan den committade databasen med en annan Prisma-klient. Rollback-testet skapar en tillfällig SQL-trigger som enbart träffar testets egen användare och tas bort i `finally`.

Varje körning skapar nya syntetiska företag/användare/projekt/fakturor. Inga befintliga rader raderas eller återställs. Behåll datakatalogen för felsökning eller arkivera den separat. Stoppa just den här instansen med `pg_ctl -D <testets datakatalog> -m fast -w stop` när testerna är klara.

## Verifierad körning 2026-10-02

PostgreSQL 17.11, Prisma 5.22.0, alla 15 migrationer tillämpade med `migrate deploy` i en tom lokal databas; 7/7 integrationstester godkända. Produktionsdata, Railway-konfiguration och produktionsmigration berördes inte. En riktig Bevego-faktura och skarp pilot återstår.
