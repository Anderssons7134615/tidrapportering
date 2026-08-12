---
name: tidapp-verified-delivery
description: "Implementera, felsök, refaktorera, testa eller leverera en ändring i TidApp. Använd för kod som berör React-frontend, Fastify-backend, Prisma, autentisering, tidrapportering, attest, rapporter eller deployment. Använd inte för rena UI-skisser utan kod eller för ändringar av produktionsdata."
---

# TidApp: verifierad leverans

## Arbetsflöde

1. Börja med `git status` och läs den relevanta vägen i koden. Följ en faktisk användaråtgärd till komponent/route, endpoint, service, validering, Prisma och test där det är relevant.
2. Definiera ett minimalt, observerbart resultat innan du ändrar kod. Om en viktig produktregel saknas, fråga Rick i stället för att skapa en ny.
3. Gör den minsta sammanhängande ändringen. Behåll företags- och rollgränser, svenska datum-/veckoregler och befintliga UI-mönster.
4. Testa i proportion till ändringen. Lägg till ett regressionstest när ett fel eller ett nytt beteende kan uttryckas där.
5. Granska diffen före leverans. Redovisa ändring, tester, UI-kontroll och kvarvarande begränsning.

## Verifieringsmatris

| Ändring | Minimikontroll |
| --- | --- |
| `backend/` | `npm test` och `npm run build` i `backend` |
| `frontend/` | `npm run build` i `frontend`; lokal kontroll av berörd vy när det är säkert |
| Delad API-/datagräns | Backendtest, backendbygge och frontendbygge |
| Prisma-schema eller migration | Läs migration och anrop; kontrollera kompatibilitet utan att köra mot produktion |

## Skarpa spärrar

- Kör inte reset, `migrate dev`, `db push` eller seed mot produktion eller okänd databas.
- Använd enbart `prisma migrate deploy` för en uttryckligen godkänd produktionsmigration.
- Ändra inte live-tidrader, attest, användare, produktionshemligheter eller driftkonfiguration utan tydlig instruktion.
- Gör inte parallella kodändringar genom flera agenter. Använd läsande granskning före skrivning vid komplexa uppgifter.

## Färdigdefinition

- Berörda tester och byggen är klara, eller ett exakt blockerande fel är redovisat.
- `git diff --check` är körd och slutdiffen är granskad.
- Vid UI-ändring har tillgänglighet och mobilanvändning kontrollerats mot `PRODUCT.md` och `DESIGN.md`.
- Commit och push sker enligt projektets `AGENTS.md`, om Rick inte har pausat eller förbjudit deploy.
