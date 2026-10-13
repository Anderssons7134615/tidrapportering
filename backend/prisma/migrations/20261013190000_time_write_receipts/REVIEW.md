# Säker tidskrivning – migrationsunderlag

Status 2026-10-13: implementerad och provad lokalt. **Inte körd i produktion.** Push av denna ändring startar TidApps ordinarie deployment och får därför vänta på Ricks uttryckliga godkännande av denna migration enligt AGENTS.md.

## Ändringen

- Befintliga tidrader får `revision = 1`. Ändring, radering och attest använder därefter versionskontroll så att en gammal vy inte skriver över nyare arbete.
- `TimeEntryWriteRequest` sparar ett bestående kvitto per företag, utförande användare och begäransnyckel. Kvittot skapas i samma transaktion som tid, veckostatus och loggning. Samma begäran kan återförsökas utan att skapa en ny tidrad.
- Kvittot överlever radering av tidraden. Databasen förbjuder ändring och radering av kvitton. Det hindrar ett gammalt försök från att återuppliva raderad tid.
- Befintliga offline-nycklar och payload-hashar kopieras när de finns. Timmar, datum, attest och ekonomiska ögonblicksbilder ändras inte av migrationen.

Detta är ett tillägg till befintlig PostgreSQL, Prisma och lokal offlinekö. Ingen ny tjänst, meddelandekö eller driftplattform införs.

## Verifierad backup och provmigration

Backup finns lokalt i `C:\Users\rick8\AppData\Local\TidAppBackups\implementation-20261013-203409`.

- `TidApp-before.bundle` bevarar Git-historiken före ändringen. Kalkylens källkod, SQLite-databas och `Huvudkalkyl.xlsx` är också kopierade med kontrollsummor.
- `TidApp-production-before-stage1.dump`: färsk PostgreSQL-backup av `worthy-eagerness` / `production` / `tidrapportering-db`, 821 571 byte. Lästs med `pg_dump` via befintlig Railway SSH, utan att läsa ut hemligheter eller ändra produktionsdata/konfiguration.
- SHA-256: `036a13392fabd2f636dc6e96681e5ec9c0b1681b3e50a71a2ec2ec8dd53f03ca`. Serverns och den lokala filens hash matchar.
- Återställd till en separat lokal databas. Migrationen tillämpades där med `prisma migrate deploy`. Radantal och innehållsfingeravtryck för samtliga 25 befintliga verksamhetstabeller matchade före/efter, inklusive 754 tidrader. Alla tidrader fick revision 1. Kopian hade inga äldre offline-nycklar och inga Attachment-rader.
- Syntetiskt migrationstest verifierar separat backfill av äldre offline-nycklar, även på godkänd tid, samt kvittots oföränderlighet och överlevnad efter radering.

Detaljer finns i backupkatalogens `production-backup-hash.json`, `restored-before-migration.json` och `restored-after-migration.json`. Kopian är lokalt verifierad; extern lagring/molnsynkning påstås inte. Om deployment dröjer ska backupen förnyas före migrationen.

## Klientkompatibilitet och utrullning

1. Kontrollera aktuell Git-revision, färsk backup och Ricks godkännande innan push.
2. Backend tillämpar migrationen före start genom befintligt `start:migrate`. Ingen `migrate dev`, `db push`, reset eller seed används.
3. Befintliga v2-offlinerader behåller sina nycklar och kan synkas. Äldre v1-rader utan säker ägare behålls för manuell kontroll.
4. Gamla klienter kan fortfarande skapa tid genom befintlig endpoint. Ändring/radering utan revision avvisas med 428 och kräver omladdning. Ny klient mot gammal backend behåller det sparade försöket om operations-endpoint saknas; den faller inte tillbaka till ett anrop som riskerar dubbletter.
5. Efter deployment: kontrollera migrationsstatus, backend/frontend-version, readiness och behörigheter. Prova inga skrivningar mot riktiga tidrader bara för att verifiera leveransen.

## Felhantering och återställning

Behåll revisioner och kvitton om en deployment misslyckas. Åtgärda i första hand framåt med kompatibel appkod. Att bara återgå till äldre backend med öppna skrivningar är inte en säker återställning: den saknar revisions- och kvittoskyddet. En eventuell kodåtergång kräver därför en granskad kompatibel version eller stoppade skrivningar under avstämning.

En full databasåterställning kräver ett separat beslut och avstämning av registreringar efter backupen. Ta aldrig bort kvittotabellen för att få äldre kod eller seed att fungera. Lokal teståterställning görs till **en ny tom databas**; seed stoppar före första radering om bestående tidskvitton finns.

## Kontroller

Verifierat före commit: backend `npm test` 164/164, frontend `npm test` 111/111, `npm run build` i båda mapparna och `git diff --check` godkända. [PostgreSQL-testerna](../../../scripts/TIME_WRITE_POSTGRES_TESTS.md) passerar 9/9 och provar den riktiga skrivvägen. Webbläsarprovet tappade med avsikt svaret efter att servern sparat 7,25 timmar: återförsöket gav exakt en tidrad och en tömd kö. Mobilvy 390 px och förstoring 200 % med CSS zoom kontrollerades; sidhuvudet radbryts vid behov.

Oberoende slutgranskning med `tidapp-critical-review` och `tidapp_fullstack_reviewer` är godkänd utan kvarvarande P0/P1. Granskaren körde själv de 23 relevanta frontendflödestesterna. Projektets UI-polish genomfördes inom ändrade vyer. Kalkylimport och senare ekonomifaser ingår inte i denna migration.
