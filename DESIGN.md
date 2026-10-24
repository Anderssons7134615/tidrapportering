---
name: TidApp Studio
description: En ljus och precis arbetsyta för projekt, planering och timmar.
colors:
  action: "#3159b8"
  action-hover: "#254690"
  action-soft: "#f0f5fd"
  workspace: "#f5f6f8"
  surface: "#ffffff"
  ink: "#26303e"
  ink-muted: "#657080"
  divider: "#dfe4eb"
typography:
  family: "Geist, Segoe UI, system-ui, sans-serif"
  page-title: "21px mobile / 23px desktop, 600"
  body: "14px"
  control: "13px desktop / 14px mobile"
  metadata: "11–12px"
---

# TidApp Studio

Denna riktning ersätter den tidigare Manrope/teal-designen efter Ricks val av en ljus, precis och exklusiv arbetsyta. Utgångspunkten är den accepterade Studio-prototypen. Funktionen, företagsidentiteten och registrerade uppgifter är desamma; gränssnittet får en sammanhängande ny form.

## Karaktär

En sval bakgrund omger en vit arbetsyta. Små, väl avvägda detaljer ger personlighet: TidApps eget T-märke, diskreta identitetsmarkörer, precisa knappar och tydliga statussymboler. Stor text, mörka huvudytor, marknadsföringssektioner och dekorativa kortraster hör inte till riktningen.

Företagsnamnet syns separat från produktnamnet. Navigation och synkstatus uttrycker verklig roll och anslutning. Ingen dekorativ markering får påstå att tid är sparad, komplett eller attesterad.

## Färg och typografi

- Blått används för huvudhandling, fokus och aktivt val. Normal information använder grafit.
- Geists variabla font levereras lokalt med OFL-licens och ingår i offlinecachen. Inga externa fontanrop.
- Rubriker är 21–23 px. Brödtext är 14 px och kontroller 13–14 px. Metadata får vara 11–12 px med läsbar kontrast.
- Formulärfält är minst 16 px på mobil för att undvika automatisk iOS-zoom. Detta ökar inte sidrubrikerna.
- Timmar linjeras med tabulära siffror. Kvartstimmar visas utan avrundning till tiondelar. Material, pris, kostnader, moms och ekonomisk budget hör inte till appens användarytor; historiska värden och skyddade export-/attestkontrakt bevaras.
- Kund- och personmarkörer använder fem dämpade toner. Dessa är identitet, aldrig status. Namnet står alltid intill.

## Arbetsyta och navigation

Datorlayout från 1024 px har en 218 px sidomeny. En vit arbetsyta med tunn ram, 16 px hörn och mycket diskret djup håller ihop sidhuvud och innehåll. Innehållet har samma maxbredd som tidigare; sidrubrik, filter och data får tydlig gemensam linjering.

Aktiv navigation får ljus blå yta, en tunn kontur och en liten punkt. Alla tillåtna destinationer finns kvar. Långa menyer rullar inom sidomenyn. Mobile använder huvudmeny och befintlig rollstyrd bottennavigation.

Mobilmenyn isolerar bakgrunden, håller fokus i menyn och stängs med Escape, navigering eller övergång till datorlayout. Fokus och rullning återställs. Företags- och personnamn får brytas när utrymmet kräver det.

## Kontroller och återkoppling

- Knappar har minst 44 × 44 px träffyta, normalt 48 px höjd på mobil. Liten text får aldrig betyda liten träffyta.
- Huvudknappen har en diskret ljus överkant och kort skugga. Sekundärknappar är vita med precis grå ram.
- Status har symbol och text. Godkända normallägen får vara lugnare än saknad tid eller avvikelse.
- Vald dag kopplas visuellt till sin detaljyta med samma milda blå ton. Detaljer ersätter inte veckans sammanhang.
- Sparat visas först efter serverbekräftelse eller uttrycklig lokal offlinehantering. Fel och väntande synk förblir synliga.
- Dialoger får 180 ms öppning och detaljer 160 ms toning. Ingen automatisk rörelse i arbetslistor. Reducerad rörelse respekteras.

## Listor och arbetsflöden

Projektarbetsytan använder befintliga projekt-ID:n, inte ett separat register. Dator visar projektlista och detaljpanel; mobil visar valt projekt direkt med tillbaka-knapp, utan att projektlistans verktyg tränger undan innehållet. Projekt, Att göra och Anteckningar kan sökas tillsammans. Alla aktiva och arkiverade projekt finns för arbetsledare och administratörer, med tydligt urval. Medarbetarnas befintliga arkiv-, uppgifts- och timbehörigheter bevaras. Kundscope och gamla projektlänkar fungerar fortfarande. Hantering/arkivering ligger separat och behåller sina bekräftelser. Material och projektekonomi visas inte.

Teamveckan visar en person per rad och vardagar som standard. Visa helg gör samtliga dagar tillgängliga. Veckosumman inkluderar alltid helgen och dold helgtid anges uttryckligen. En dag öppnar dess tidrader; projektfördelningen är märkt som hela veckan. Saknad tid och avvikelser har text, inte bara färg. På smal skärm rullar sju dagar vid behov inom raden för att behålla 44 px träffyta.

Tidregistrering behåller datum, personval, sökbar projektväljare, aktiviteter, timmar, kopiering och extrafält. Attest och löneexport behåller granskning, bekräftelser och felspärrar. Lager, inköp och kalkyler är inte användarvägar i tidsappen; historiska underlag raderas inte. Ny design får aldrig kringgå skyddade tid-/atteststeg.

## Tillgänglighet och kontroll

Synligt tangentbordsfokus, 200 procent zoom, responsiv läsordning, läsbara fel och namn, minst 44 px mål samt status utan färgberoende är leveranskrav. Lokal UI-kontroll ska använda isolerade testuppgifter. Företagsdata, offlineköer, roller och serverkontroller är inte designmaterial.

## Referenser för detaljarbetet

- Attios ljusa tabellvyer: https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views
- Attios postförhandsvisning: https://attio.com/help/reference/managing-your-data/records/create-and-view-records
- Linears sammanhängande statussymboler: https://linear.app/docs/project-status
- Recent, tidigare Godly, för återkommande små varumärkesdetaljer: https://recent.design/
- Emil Kowalski, återkoppling knuten till användarens handling: https://emilkowal.ski/ui/good-vs-great-animations

Referenserna används för principer och detaljskala. TidApps egna uppgifter och den accepterade Studio-riktningen avgör den faktiska utformningen.
