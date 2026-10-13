# Personligt undantag från fullständig vecka

Status 2026-10-13: färdig och verifierad lokalt. **Inte driftsatt. Nytt uttryckligt migrationsgodkännande från Rick återstår före push.** Godkännandet av etapp 1 omfattar inte denna migration.

## Ändring och avgränsning

Migrationen lägger endast till `User.allowIncompleteWeekApproval BOOLEAN NOT NULL DEFAULT false`. Inga timmar, roller, attester eller ekonomiska värden ändras. Alla befintliga och nya användare behåller fullveckokravet tills en admin uttryckligen ändrar inställningen.

Endast ADMIN inom samma företag kan ändra inställningen genom befintlig användarredigering. Ändring och audit sparas atomärt; gamla formulär skickar inte ett oförändrat policyvärde. Attest läser veckans ägares inställning inne i transaktionen. Tomma veckor, ej inskickade rader, företagsgränser, revisionsskydd och självattestregler gäller fortsatt. Användning av undantaget loggas med faktiska saknade vardagar. Teamvyn visar verkliga timmar och dagar men kräver inte att undantagna personer fyller tomma vardagar. Annan avvikelsekontroll kvarstår.

Efter godkänd migration ska endast det verifierade företagskontot aktiveras: Rick Andersson, rick@anderssonsisolering.se, användar-id `faabb5ea-1312-4e33-996b-4650518264e6`, företag `1121ff65-f908-4670-9028-91d6d87bc396` (Anderssons Isolering i Laholm AB). Identiteten är verifierad genom skrivskyddad produktionsläsning. Kontot Rick i Test AB ska inte ändras. Aktiveringen ska auditloggas och efterkontrolleras. Ingen produktionsaktivering har gjorts.

## Backup och provmigration

Färsk logisk produktionsbackup finns i `C:\Users\rick8\AppData\Local\TidAppBackups\week-exception-20261013-223355\production-before.dump` (826 446 byte).

SHA-256: `c18cba15e8fd739b5c81a539892890b5be0c87a6a699d961d1e7eb2dd912a42a`. Serverns och den lokala filens hash matchar. Hämtad via befintlig Railway SSH utan produktionsskrivning eller utläsning av hemligheter.

Återställd till separat lokal PostgreSQL-databas `tidapp_week_exception_restore_20261013`. `prisma migrate deploy` tillämpade den nya migrationen på kopian. Radantal och innehållsfingeravtryck matchar för samtliga 26 verksamhetstabeller efter att det nya User-fältet undantagits från jämförelsen. Kopian har 756 tidrader och 9 användare; samtliga fick false. Bevis finns i samma katalog: `backup-proof.json`, `before-fingerprints.json`, `after-fingerprints.json`. Förnya backupen om driftsättning dröjer.

## Utrullning och återgång

1. Rick godkänner denna granskade migration och publicering före push till master. Railway kör då befintlig preDeploy: root `npm run db:push`, vilket anropar `prisma migrate deploy` (inte Prisma db push).
2. Kontrollera lyckad migration och appversion på Railway/Cloudflare samt readiness före aktivering.
3. Aktivera endast Ricks verifierade konto och kontrollera inställning/audit utan att ändra verkliga tidrader eller attestera som test.
4. Vid fel: avaktivera inställningen genom samma auditerade användarväg. Kolumnen kan behållas; äldre kompatibel kod ignorerar den. Redan gjorda attester återkallas inte automatiskt. Databasåterställning är ett separat beslut eftersom ny rapportering kan ha tillkommit.

## Verifiering

- Backend `npm test`: 165/165. Frontend `npm test`: 115/115. PostgreSQL `npm run test:time:postgres`: 12/12.
- Båda `npm run build` godkända. Backendbygget kördes om efter att lokal API-server stoppats för att släppa Prismas Windows-DLL-lås.
- Testar bland annat default false, samma ofullständiga vecka med/utan undantag, tom vecka, roller, främmande företag, auditerad ändring, rollback vid auditfel, självattestgräns och oförändrade timmar/kostnader. Stale-dialog-test verifierar att en annan ändring inte återaktiverar en återkallad policy.
- Lokal webbläsare med syntetiska data: redigera/spara/öppna igen; attest av åtta rapporterade timmar med saknade vardagar visas tillåten efter granskning. Mobil 390 px och dator 1280 px kontrollerade. Vid 200 procent textstorlek är checkbox och Spara nåbara. Full browserzoom är inte verifierad; CSS zoom 2 klippte den befintliga dialoghöjden och räknas inte som godkänt zoomprov.
- UI-polish: undantaget visas neutralt separat från röda avvikelser, och teamvyns hjälptext anger undantaget. Inga nya generella gränssnittskomponenter införs.
- Slutlig läsande granskning med tidapp-critical-review och tidapp_fullstack_reviewer är godkänd utan kvarvarande P0/P1. `git diff --check` är godkänd. Kvarvarande P2 är full browserzoom enligt ovan.

Kalkyl, prislistor och offertversioner i återstoden av etapp 2 ingår inte i denna leverans.
