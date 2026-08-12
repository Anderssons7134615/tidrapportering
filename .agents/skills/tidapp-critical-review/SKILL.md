---
name: tidapp-critical-review
description: "Kör en kritisk läsande granskning av en TidApp-diff före commit eller push. Använd efter ändringar i UI, React-frontend, Fastify-backend, Prisma, API-kontrakt, autentisering, tidrapportering, attest eller export. Kontrollera korrekthet, säkerhet, dataintegritet och testluckor; ändra aldrig kod."
---

# TidApp: kritisk leveransgranskning

## Omfattning

Granska slutdiffen, sedan de direkta körvägar som ändringen påverkar. Var kritisk men konkret: rapportera inte stilpreferenser som fel. Detta är alltid en läsande granskning.

## Granska i tre lager

### UI och frontend

- Kontrollera rollstyrd routing, laddning, tomläge, fel, återhämtning och aktuell state efter lyckat/misslyckat API-anrop.
- Kontrollera semantisk HTML, labels, tangentbord, synligt fokus, kontrast, 44 × 44 px touchytor och mobil reflow utan horisontell scroll.
- Kontrollera att visad status inte bara bygger på färg och att handlingar med hög risk visar konsekvens innan de slutförs.

### Backend och API

- Kontrollera autentisering, rollkontroll och företagsscope i route, service och dataläsning. Klienten är aldrig en säkerhetsgräns.
- Kontrollera Zod- eller motsvarande validering, datum/tidszon/veckonummer, idempotens eller dubblettrisk, felhantering och att fel inte läcker data.
- Kontrollera att ändrade API-svar är kompatibla med frontend och att live-tidrader eller attest inte kan ändras oavsiktligt.

### Prisma och test

- Kontrollera schema, migration och bakåtkompatibilitet. Föreslå aldrig reset, `migrate dev`, `db push` eller seed mot produktion.
- Kontrollera att tests täcker den konkreta regressionen, negativa behörighetsfall och gränsfall som ändringen introducerar.
- Jämför gjorda kontroller med `AGENTS.md` och flagga en saknad obligatorisk kontroll.

## Prioritering och leveransregel

| Nivå | Betydelse | Åtgärd |
| --- | --- | --- |
| P0 | Dataintrång, dataförlust, kringgång av attest/behörighet eller produktionsfara | Blockera leverans |
| P1 | Trolig felräkning, fel flöde, regression eller otillräcklig testning i ändrad funktion | Åtgärda före leverans |
| P2 | Avgränsad förbättring eller kvarvarande testlucka utan känd direkt skada | Redovisa tydligt |

Skriv fynd först. Varje fynd ska innehålla prioritet, fil/rad, faktisk påverkan och ett verifierbart reproduktionssteg. Om inga P0/P1 finns, säg det uttryckligen och nämn kvarvarande begränsningar. Ändra aldrig filer.
