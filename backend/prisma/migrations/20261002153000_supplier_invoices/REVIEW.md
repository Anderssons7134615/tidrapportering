# Leverantörsfakturor – migrationsunderlag

Status 2026-10-02: implementerad, lokalt provad och oberoende fullstackgranskad utan kvarvarande P0/P1. Inte körd i produktion. Gren: `codex/project-invoices`, bas `7e96493`.

Appkod är lokalt committad i `1510be6`. Push/driftsättning inväntar Ricks uttryckliga migrationsgodkännande och en aktuell verifierad backup.

## Kontroll av målmiljö och backup 2026-10-02

Read-only Railway CLI/API bekräftar projekt `worthy-eagerness`, miljö `production`, tjänster `tidrapportering-api` och `tidrapportering-db`. API-tjänsten kör `7e96493` med status SUCCESS. Databasen är PostgreSQL 17. Volymen är READY och använder cirka 123,4 MB av 500 MB. PDF-lagringen bör därför börja som en liten pilot; lagringsutrymme behöver följas innan historik laddas in.

Railway listar endast `Pre-Security-Patch Backup`, skapad 2026-08-22 med utgång 2026-09-21, och inga backupscheman. Ingen aktuell backup kan därför verifieras. Försök att skapa en separat manuell säkerhetskopia inför migrationen nekades av Railway med `Not Authorized`. Ingen ny backup skapades och inget schema/driftläge ändrades. Rick behöver skapa en manuell backup eller ordna behörighet; agenten ska läsa tillbaka och verifiera den innan driftsättning. Hemligheter har inte lästs ut. En återställning har inte testats.

## Vad ändras?

- Två enumtyper och tre nya tabeller: `SupplierInvoice`, `SupplierInvoiceDocument`, `SupplierInvoiceAllocation`.
- Nya sammansatta unika index på `Project(id, companyId)` och `User(id, companyId)` möjliggör företagsavgränsade främmande nycklar. Befintliga id är redan unika; indexen ändrar inte affärsdata.
- Inga gamla tabeller, kolumner eller rader raderas eller skrivs om. Ingen import eller backfill.
- Original-PDF lagras som `bytea` i samma databas som fakturan, högst 10 MB per fil. Befintlig databasbackup måste därför omfatta dokumenten och ha tillräcklig kapacitet.
- Databasregler skyddar bolagskopplingar, filhashens unikhet/format, dokumentstorlek/PDF-signatur, stabil fakturaidentitet, valuta, beloppstecken och fullständighet/summa vid bekräftelse.
- API-tjänsten beräknar själva SHA-256-hashen, kontrollerar fördelningens summa/tecken och uppdaterar revision/status/fördelning/audit i samma transaktion. En SQL-CHECK kan inte ensam skydda summan över flera fördelningsrader.
- Makulering behåller leverantör, fakturanummer, original och audit, men släpper den aktiva dubblettnyckeln. Ett annat, korrekt original kan därefter få samma fakturaidentitet. Samma filhash returnerar fortsatt sin befintliga post; en makulerad post räknas aldrig som inköp.

## Kontroller som har körts

- Alla repo-migrationer i ordning i en ny lokal PGlite-databas (PostgreSQL i WebAssembly), utan nätverksanslutning eller produktionsdata.
- Företagsgränser för faktura, skapare, dokument, projektfördelning; dubblettnycklar inom/över bolag; check constraints; rollback och revisionskonflikt.
- Fastify-inject med injicerat transaktionellt testlager för behörighet, upload, parserfel, originalhämtning, fördelning, rättelse/makulering och auditfel.
- Riktig PDF.js-worker med syntetisk PDF, timeout och trasig PDF. Inga privata fakturor används som testdata.
- Lokal browserkontroll med syntetiska API-svar. Den provar React-användarvägen, inte en skarp bokföringsintegration.
- Slutkontroller: backend `npm test` 127/127, frontend `npm test` 43/43, båda `npm run build`, kompilerad PDF-worker 6/6 och `git diff --check`. Relevanta rättelsetester kördes om av läsande fullstackgranskare: backend 17/17, frontend 10/10, frontendbygge och diffkontroll godkända.
- Browser: läsa förslag, fylla i, fördela, spara, bekräfta och öppna för rättelse; mobil 390 px och reflow 720 px med 200 procent textstorlek (inte verifierad faktisk browserzoom), utan horisontell scroll eller JavaScript-fel i fakturaflödet. Skydd vid länk/bakåt/makulering och bevarad inmatning vid avbryt verifierat. Alla fyra rollers startsidor har provats igen efter routerbytet; mocken saknar registration-status och löneunderlag och gav avsiktligt 503 för dessa vägar.

Utökad kontroll: alla 15 migrationer har även tillämpats med `prisma migrate deploy` i en ny lokal PostgreSQL 17.11-instans. Sju separata integrationstester med riktig Prisma 5.22.0 passerar: samtidiga uppladdningar, spara/spara, spara/bekräfta, bekräfta/makulera, SQL-utlöst rollback av skapande/ändring samt originalets bytes, datum, behörighet och inköpssummering via Fastify. Två transaktioner måste nå testbarriären före skrivningen; efterkontroll sker med en annan klient. Testkommandot har ett strikt lokalt anslutningsskydd. Se `backend/scripts/INVOICE_POSTGRES_TESTS.md`.

Dessa lokala kontroller är inte ett driftprov mot Railway. Ingen autentiserad produktionskontroll eller riktig Bevego-faktura har använts. Dessa begränsningar ska finnas kvar i leveransrapporten.

Frontend använder den befintliga React Router-versionens `RouterProvider` runt samma ruttträd för att skydda osparade fakturauppgifter även vid bakåt- och sidmenynavigering. `beforeunload` hanterar full sidladdning. Detta följer [React Routers dokumentation för useBlocker](https://reactrouter.com/6.30.1/hooks/use-blocker) och [inkrementell övergång](https://reactrouter.com/6.30.1/upgrading/v6-data); inget ramverksbyte eller versionslyft görs.

## Före produktionsstart

1. Slutför läsande fullstackgranskning och åtgärda blockerande fynd. Båda byggena, backendtester, frontendtester och diffkontroll ska vara gröna.
2. Rick godkänner denna granskade migration uttryckligen enligt AGENTS.md. Push till master startar den konfigurerade Railway-migreringen och får därför inte ske före detta godkännande.
3. Verifiera målmiljö och en aktuell återställningsbar databasbackup, inklusive lagringsutrymme. Läs inte ut hemligheter. Om backup eller målmiljö inte kan verifieras ska driftsättning vänta.
4. Använd endast `prisma migrate deploy` genom befintligt leveransflöde. Ingen reset, db push, seed eller migrate dev i produktion.
5. Kontrollera migrationens resultat, deploystatus, `/api/ready`, frontendversion samt att befintlig tidrapportering/attest fungerar. Prova först läsning; skapa inte produktionsfakturor för att bevisa ett test.
6. Pilot: ladda in ett av Rick valt original och stäm av normalfaktura, kredit, delning, restbelopp och omuppladdning. Bekräftelse kräver mänsklig originalkontroll. Bokföring och betalning påverkas inte.

## Återgång och kapacitet

Vid appfel kan föregående fungerande appversion återställas medan de nya tabellerna behålls. Kör inte en destruktiv nedmigration; uppladdade original och revisionshistorik ska bevaras. Om själva migreringen misslyckas: läs felet och migrationsstatus, granska en riktad korrigering och besluta om en framåtriktad rättelse. Ändra inte en redan tillämpad migrationsfil och markera inte en misslyckad migration löst utan verifiering.

En första pilot på få projekt gör lagring och PDF-tolkning mätbar. Följ databasstorlek, backupstorlek, uploadtid och parserfel innan bred historikimport. Workertrådar har tidsgräns och V8-heapgräns men utgör inte ett strikt totalt minnes-/CPU-tak. Skannade PDF:er kräver manuell inmatning; OCR ingår inte.
