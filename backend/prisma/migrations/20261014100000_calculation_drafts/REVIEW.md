# Kalkyleditor – granskad produktionsmigration

Status 2026-10-14: implementerad och lokalt verifierad. Denna nya migration väntar på Ricks uttryckliga godkännande före push/publicering. Godkännandet för importbryggan omfattade den tidigare migrationen.

## Ändring och skydd

Migrationen skapar `ProjectCalculationDraft` med revisionsnummer, kalkylsnapshot och eventuell koppling till en låst `ProjectCalculation`. Företag, projekt och skapare avgränsas av främmande nycklar. Även länken till den låsta versionen måste avse samma företag och projekt. Ett index tillkommer på den befintliga versionstabellen. En trigger hindrar uppdatering/radering av redan låsta utkast. Inga befintliga verksamhetsrader ändras.

Endast ADMIN kan skapa, läsa, redigera och låsa. Sparning kontrollerar förväntad revision; gamla formulär får konflikt i stället för att skriva över. Identiska omförsök återger tidigare resultat. Låsning kontrollerar granskad revision och fingeravtryck. Utkast, slutversion och audit skrivs transaktionellt. Ett inaktivt projekt kan läsas och tidigare lyckade anrop kvitteras, men tar inte emot nya ändringar.

Servern använder den befintliga frysta V1-beräkningen. Artikelregistrets inköpspris kopieras vid val; saknat inköpspris kräver manuell inmatning. Försäljningspris används aldrig som inköpspris. Utkastets priser uppdateras inte automatiskt från registret. Kopiering behåller komplexa rader, material och beräkningsunderlag, men nollställer offertnummer och offertdatum/giltighet. Låsning betyder tekniskt låst kalkyl, inte att en offert har skickats. Projektbudget, tid, inköp, faktisk materialåtgång och desktopdatabas ändras inte.

## Backup och återställningsprov

Färsk skrivskyddad produktionsbackup: `C:\Users\rick8\AppData\Local\TidAppBackups\editor-before-20261014-190128\production-before.dump`, 834 737 byte. SHA-256 `184b7510a8beafbab821057c857bbdda12d803b4c9b11642e74ed217b6f9565a`. Serverns och den lokala filens hash matchar.

Backupen återställdes till separat lokal PostgreSQL-databas `tidapp_editor_restore_20261014`. `prisma migrate deploy` tillämpade migrationen där. Innehållshash för samtliga kolumner och radantal stämmer för alla 27 befintliga verksamhetstabeller, inklusive Ricks användarinställning. Den nya tabellen är tom. Kopian innehåller 762 tidrader och 9 användare. Bevis finns som `backup-proof.json`, `before-fingerprints.json` och `after-fingerprints.json` i backupkatalogen. Ingen produktionsmigration eller verksamhetsskrivning har utförts.

## Verifiering

- Backend `npm test`: 173/173. Frontend `npm test`: 124/124. Båda `npm run build` godkända.
- `npm run test:calculations:postgres`: 7/7 på separat syntetisk PostgreSQL-databas. Täcker samtidiga skapar-/spar-/låsanrop, gamla revisioner, företags-/projektgränser, inaktiva projekt, audit-rollback och databasens låsskydd.
- Lokal browser med syntetiskt projekt: skapa, välja material, räkna, spara, återöppna, låsa, återgå till Kalkyl-fliken, kopiera, ändra mängd, spara och återöppna. Exempel: 20 enheter, 12 min/enhet, 0,6 m²/enhet à 79 kr och 10 % spill gav 4 h, 1 042,80 kr material och 4 503,50 kr räknat pris med 800 kr/h och 25 % påslag. Kopians 25 enheter gav 5 629,38 kr.
- Dator 1440 px, mobil 390 px och reflow 720 px kontrollerade. Sparhandling och prisgenväg ligger kvar vid rullning. CSS-zoom 2 provades men motsvarar inte browserzoom: det gav trång desktoplayout. Full browserzoom 200 % är därför inte verifierad; 720 px-kontrollen verifierar den halverade layoutbredden separat.
- `tidapp-critical-review` med läsande `tidapp_fullstack_reviewer`: inga kvarvarande P0/P1. UI-polish: synliga sparhandlingar, fältfel, felåterhämtning, mobilfält, kontakt/offertfält och varningar före låsning. `git diff --check` godkänd.

## Avgränsningar

Kalkyleditorn kräver uppkoppling för beräkning och sparning. Max 500 moment och 30 material per moment; listorna visar 200 senaste utkast/versioner. Gamla poster ligger kvar. P2: återhämtningsknappen kan visas före första lyckade sparningen, vilket också tillåter återhämtning om svaret tappats; finns inget sparat utkast behålls formuläret och ett tydligt fel visas. Artikelväljaren har samma etikett i varje moment och använder en gemensam sökning. Separat kundtext per moment bevaras från import men redigeras inte i denna första editor. Offert-PDF, fasta prislistor och automatisk budgetöverföring ingår inte i detta delsteg.

## Publicering och återgång

1. Rick godkänner denna granskade migration och publicering. Förnya backup om publiceringen dröjer.
2. Normal push till master. Railway använder befintlig preDeploy med `prisma migrate deploy` genom root-scriptet `db:push`; kör inte Prisma `db push`.
3. Kontrollera migration, Railway/Cloudflare-version, API-readiness och nekad oinloggad åtkomst. Skapa ingen skarp kalkyl som automatiskt test.
4. Genomför [första jobbtestet](../../../scripts/KALKYL_EDITOR_PILOT.md) på Ricks valda projekt.
5. Vid appfel återställ föregående kompatibla appversion och lämna nya tabellen/underlagen kvar. Återställning av produktionsdatabasen är ett separat beslut eftersom ny rapportering kan ha tillkommit. Ingen automatisk nedmigration/radering.
