# TidApp — Codex-arbetssätt

## Uppdrag

Bygg en pålitlig TidApp för medarbetare, arbetsledare och ekonomi. Prioritera korrekt tid, tydliga avvikelser, säker attest och tillförlitligt löneunderlag framför generiska funktioner eller snabb kod.

## Börja alltid rätt

- Läs aktuell `git status`, berörda filer och befintliga tester innan du föreslår eller ändrar kod.
- Håll varje uppgift avgränsad. Fråga Rick när krav, målvy, behörighet eller produktbeteende är väsentligt oklart; gissa inte.
- Bevara orelaterade ändringar. Gör små, riktade patchar och följ de etablerade mönstren i den berörda modulen.
- Skriv tydligt och kort på svenska. Skilj mellan verifierat, antagande och återstående risk.

## Produkt och gränssnitt

- Läs `PRODUCT.md` för användar- och produktmål. Läs `DESIGN.md` före en UI-ändring.
- Fältarbete är mobilförst; granskning, attest och export ska fungera väl på dator. Behåll minst 44 × 44 px träffytor, synligt tangentbordsfokus, status som inte bara förmedlas med färg och användbarhet vid 200 % zoom.
- Bygg arbetsytor för den primära uppgiften. Undvik dekorativa dashboard-kort, gradienter, glassmorphism, färgade sidränder och animationer utan funktion.

## Implementera och verifiera

- Spåra den verkliga vägen: route/komponent eller endpoint/service/schema, inklusive behörighet, validering och befintliga tester.
- Lägg till eller justera test när beteendet ändras eller ett fel åtgärdas. Testa regressionsfallet, inte bara den glada vägen.
- Backendändring: kör `npm test` och `npm run build` i `backend`.
- Frontendändring: kör `npm run build` i `frontend`; gör en lokal UI-kontroll för en ändrad användarväg när den går att testa utan att ändra produktionsdata.
- Ändring över gränsen frontend/backend/Prisma: kör båda byggena och backendtesterna. Avsluta med `git diff --check` och granska den slutliga diffen.
- Rapportera exakt vilka kontroller som kördes och vad som inte kunde verifieras.

## Data, produktion och hemligheter

- Ändra aldrig produktionsdata, användare, attester, tidrader eller ekonomiskt underlag utan uttrycklig uppgift från Rick och efterkontroll i rätt system.
- Kör aldrig `prisma migrate reset`, `prisma migrate dev`, `prisma db push` eller seed mot en okänd eller produktionsmiljö. En produktionsmigration får endast använda `prisma migrate deploy`, först efter att Rick uttryckligen godkänt den granskade migrationen.
- Läs eller skriv aldrig ut hemligheter från `.env`, Credential Manager eller driftplattformar. Ändra inte Railway-, Cloudflare- eller produktionskonfiguration utan tydlig instruktion.
- Gör aldrig force-push, hård reset, bred radering eller orelaterad dependency-uppgradering.

## Leverans

- Före commit eller push av appkod, schema, migration, API-kontrakt eller frontend: kör `$tidapp-critical-review` på slutdiffen och använd `tidapp_fullstack_reviewer`. Åtgärda P0/P1-fynd innan leverans, eller redovisa varför Rick uttryckligen väljer att acceptera risken. Rena instruktioner och dokumentation behöver inte denna spärr.
- Efter varje UI-ändring som är funktionellt klar: kör `$tidapp-ui-polish` före leverans. Den får förbättra den berörda upplevelsen men får inte ändra affärsbeteende utan uppdrag.
- När en ändring är färdig och verifierad: gör en avsiktlig commit och pusha `master` enligt TidApps normala flöde, om Rick inte har pausat, sagt att den inte får deployas eller en obligatorisk kontroll har fallerat.
- Håll varje commit fokuserad. Beskriv kort ändring, verifiering, commit/push och eventuella kvarvarande begränsningar.

## Stora uppgifter och granskning

- **Subagenter är obligatoriska i varje TidApp-uppgift.** Starta alltid minst en riktad, läsande subagent innan kod ändras eller ett resultat levereras. Använd `tidapp_fullstack_reviewer` för slutdiffen vid appändringar och välj `tidapp_explorer` eller UI-granskare när uppgiften berör deras område.
- Behåll en skrivande huvudagent. Vid större, oberoende läsarbete kan du använda `tidapp_explorer` för kartläggning. Använd alltid den läsande `tidapp_fullstack_reviewer` i den obligatoriska leveransgranskningen; vänta in resultatet innan kod ändras eller levereras.
- Använd aldrig parallella skrivande agenter i samma arbetskopia.

## Code Review Rules

- Flagga alltid brott mot behörighetsgränser, dataläckage mellan företag, felaktig datum-/veckoberäkning, dubblettregistrering, attest som kan kringgås och migrationer utan säker produktionsväg.
- Prioritera konkreta regressionsrisker och saknade tester framför stilkommentarer.
