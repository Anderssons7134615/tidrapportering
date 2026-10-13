# Kalkylbrygga – granskad produktionsmigration

Status 2026-10-13: implementerad och lokalt verifierad. Denna nya migration är ännu inte godkänd eller körd i produktion. Push till master väntar eftersom den startar automatisk driftsättning.

## Ändring

Migrationen skapar `ProjectCalculation`, dess index, företagsavgränsade främmande nycklar och ett databasskydd mot ändring/radering av sparade versioner. Inga befintliga verksamhetsrader ändras. En källrevision kan kopplas till ett projekt per företag; identiska omförsök återger samma version. Annat innehåll eller annat projekt med samma källidentitet ger konflikt.

Endast ADMIN kan förhandsgranska, spara och läsa. Projekt, skapare och kalkyl måste tillhöra samma företag. Version och audit sparas atomärt. Importen påverkar inte projektbudget, fastpris, materialåtgång, inköp eller fakturor. Arkiverade projekt behåller läsbar historik men tar inte emot nya importer.

Källans priser, tider, material och summor sparas som låst JSON. Servern räknar enligt desktopprogrammets Rust-regler och stoppar import vid totalskillnad. Schema och beräkning v1 är frysta; framtida regler måste få en ny version. Databasen har inget generellt redigerings- eller raderings-API för kalkyler.

## Backup och provmigration

Färsk logisk produktionsbackup: `C:\Users\rick8\AppData\Local\TidAppBackups\kalkyl-production-20261013-225651\production-before.dump`, 826 953 byte. SHA-256: `33a344550f24a69db9b7175a94dc31e98cf87842efdae450fe308a31c60d5603`. Serverns och den lokala filens hash matchar.

Backupen återställdes till separat lokal PostgreSQL-databas `tidapp_kalkyl_restore_20261013`. `prisma migrate deploy` tillämpade den nya migrationen. Radantal och innehållsfingeravtryck stämmer för de 26 befintliga verksamhetstabellerna; den nya tabellen är tom. Jämförelseverktyget undantar User.allowIncompleteWeekApproval från innehållshashen; separat kontroll visar fortsatt exakt ett aktiverat konto. Kopian har 756 tidrader och 9 användare. Bevis: `backup-proof.json`, `before-fingerprints.json`, `after-fingerprints.json` i backupkatalogen. Ingen produktionsskrivning har gjorts för detta prov.

Desktopkällan har kopierats genom SQLite:s backupfunktion med skrivskyddad källanslutning. Två sparade revisioner har exporterats till `C:\Users\rick8\AppData\Local\TidAppBackups\kalkyl-bridge-20261013`. Källfilens hash före och efter är samma. Alla totalsummor i båda verkliga revisionerna stämmer med serverberäkningen. Riktiga kalkyler har inte importerats till något produktionsprojekt.

## Utrullning och återgång

1. Rick godkänner denna granskade migration och publicering. Förnya backupen om driftsättningen dröjer.
2. Push till master startar normal driftsättning. Befintlig Railway preDeploy anropar `prisma migrate deploy` genom root-scriptet `db:push` (inte Prisma db push).
3. Kontrollera migrationens resultat, Railway/Cloudflare-version och API-readiness. Verifiera att oinloggad åtkomst nekas. Ingen verklig import sker som automatiskt test.
4. Rick väljer rätt projekt och granskar en export före första skarpa importen; se `backend/scripts/KALKYL_IMPORT.md`.
5. Vid fel kan föregående kompatibla appversion återställas och den nya tabellen lämnas kvar. Underlag får inte raderas. Databasåterställning är ett separat beslut eftersom ny rapportering kan ha tillkommit.

## Verifiering och begränsningar

- Backend `npm test`: 171/171. Frontend `npm test`: 118/118. `npm run test:calculations:postgres`: 3/3 med riktig PostgreSQL/Prisma. Python `python -m unittest discover -s scripts -p test_export_kalkyl.py`: 2/2.
- Båda `npm run build` godkända. Backendbygget kördes om separat efter ett Windows-lås på Prisma-DLL under parallellt databastest.
- Tester täcker negativa roller/företag, samtidiga omförsök, innehållskonflikt, fel projekt, inaktivt projekt, gammal förhandsgranskning, databasens låsning och rollback vid auditfel. Exporttesterna kontrollerar oförändrad källa, exakta revisioner, ingen överskrivning och avvisad felaktig källidentitet.
- Lokal webbläsare med syntetiska data: välj fil, granska, obligatorisk bekräftelse, spara och återläs. Mobil 390 px och dator 1280 px kontrollerade. CSS zoom 2 är visuellt kontrollerad; full webbläsarzoom är inte verifierad. Radtabellen har egen horisontell rullning på mobil.
- UI-polish följer befintliga komponenter: neutral låst status, tydligt målprojekt, belopp med ören, separat manuellt anbud, fel och omförsök med bibehållen förhandsgranskning.
- Begränsningar (P2): importen kräver 1–500 rader och högst 30 material per rad; desktop kan spara större kalkyler och tomma utkast som därför avvisas. De 200 senast importerade versionerna listas; äldre poster ligger kvar i databasen. Käll-id och fingeravtryck finns i API/audit men visas inte i vyn, så olika källor med samma namn/revision/importdatum kan ha identiska alternativ i versionsväljaren. Desktop saknar exportknapp, så en liten lokal exporthjälpare används. Kalkyleditor, automatisk synk, fasta prislistor och offertflöde ingår i senare delsteg.

Slutlig läsande granskning med tidapp-critical-review och tidapp_fullstack_reviewer är klar utan P0/P1. Kvarvarande P2 finns ovan. `git diff --check` är godkänd. Lokal commit kan förberedas; produktionsmigration och push väntar fortsatt på Ricks uttryckliga godkännande av detta underlag.
