# Projektarbetsyta och timmar

## Avgränsning

Arbetsytan använder TidApps befintliga Project.id. Ingen kopiering, import eller omnumrering av projekt sker. Administratör/arbetsledare får alla företagets aktiva och arkiverade projekt; medarbetare behåller sin befintliga åtkomst till aktiva projekt, egna uppgifter och särskilt tillåtna projekttimmar.

`GET /api/project-workspace` är ett tillagt, autentiserat läskontrakt. Projekt hämtas utan take/skip. Uppgifter och projekthändelser knyts till samma projekt-ID:n. Äldre Project.notes visas separat. Arbetsytans globala anteckningsvy och sökning använder alla hämtade projekthändelser, inte den äldre dagboksroutens gräns på 100/200 poster.

Arbetsytan läser inga priser, material-, faktura- eller kostnadstabeller. Administratören ser alla rapporterade timmar och attesterade timmar separat. Arbetsledare och behöriga medarbetare får attesterad summa enligt befintliga projektsummeringars behörighet. Tidfliken använder oförändrad, behörighetskontrollerad tidradsroute. Summeringar behåller rå precision; avrundning sker endast i formatHours.

## Bevarande av underlag

- Inga ändringar i Prisma-schema eller migrationer.
- Inga ändringar i tidradsoperationer, offlinekö, revisionskontroll, attest, finansiella snapshots eller löne-/fakturaunderlag.
- Löneexport, CSV-separator, periodval och backup av attesterad tid är oförändrade.
- Material, kostnader, pris, budget, debitering och moms tas bort från användarvägarna. Historiska värden, dokument och bakåtkompatibla ekonomiska API:er ligger kvar; att dölja dem är inte en radering eller säkerhetsmässig avveckling av dessa API:er.
- Projekt-, användar- och företagsformulär skickar inte de borttagna ekonomifälten, inte ens som null eller 0.
- Arkivering/återställning behåller befintliga bekräftelser i Hantera och arkivera.

Anteckningar och uppgifter sparas genom befintliga projektendpoints. Endast ansvarig och deadline som användaren faktiskt väljer skickas för en ny uppgift. Den fristående prototypens localStorage/demodata importeras inte och ändras inte. Fria checklistpunkter utan ansvarig/datum kräver ett separat modellbeslut, inte påhittade värden.

## Verifiering

Kör `npm test` och `npm run build` i både frontend och backend. Nya routetester ingår i backendens standardkommando. Testerna omfattar 251 projekt med bevarade ID:n, arkiv, uppgiftslösa projekt, företag/roller, dolda timmar, autentisering, ekonomioberoende läsning, kvartstimmar/precision, gamla länkar, formulärpayloads, fel/retry, bekräftad återläsning, dubbelinskickning och tangentbordsfokus efter avbockning.

Lokal browserkontroll ska använda en separat session med uttryckliga QA-fixturer och fetch-spärr. Den får inte använda en produktionssession för syntetiska skrivprov. Kontrollera projektlista/detalj, sökning/filter, anteckning/uppgift, omladdning, mobil/tablet/dator och 200 % reflow. Verifiera separat eventuell driftsatt frontend, backend och inloggad projektåtkomst; lokala tester bevisar inte driftsättning eller produktionsdatabasens innehåll.

## Drift

Leverera först efter oberoende fullstackgranskning och UI-polish enligt AGENTS.md. Det vanliga master-flödet kan starta Cloudflare/Railway. Driftkonfigurationen ändras inte. Denna ändring tillför ingen migration och ska inte åtföljas av reset, db push, seed eller manuell databasändring. Återgång av appkoden till föregående granskade revision kräver ingen återställning av projektdata.
