---
name: Anderssons Isolering
description: En tydlig arbetsyta för projekt, inköp, tid och ekonomi.
colors:
  work-teal: "#185c56"
  work-teal-hover: "#174a47"
  work-teal-focus: "#1b7169"
  work-teal-soft: "#effaf7"
  workspace: "#f4f6f8"
  surface: "#ffffff"
  surface-subtle: "#f7f9fb"
  ink: "#192536"
  ink-strong: "#101d2d"
  ink-muted: "#596779"
  divider: "#dce3eb"
  success: "#047857"
  warning: "#b45309"
  danger: "#be123c"
typography:
  headline:
    fontFamily: "Manrope Variable, Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope Variable, Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "Manrope Variable, Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Manrope Variable, Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0"
rounded:
  control: "8px"
  surface: "12px"
  dialog: "18px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.work-teal}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.work-teal-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  status-pill:
    rounded: "{rounded.pill}"
    padding: "4px 10px"
---

# Design System: Anderssons Isolering

## Overview

**Creative North Star: "Den välordnade arbetsdagen"**

Anderssons Isolering bygger vidare på TidApp med en ljus affärsapp: vit navigation, sval arbetsyta, tydlig typografi och projekt i centrum. En medarbetare ska kunna rapportera i fält på några tryck, medan arbetsledaren får överblick över projekt, inköp och avvikelser. Den befintliga teal-identiteten knyter ihop arbetsytorna.

Systemet använder befintlig teal och grafit som identitet, men värmen kommer från språk, återkoppling och mänsklig prioritering. Generiska kortraster, AI-genererade dashboardmönster, marknadsföringslayout inne i arbetsflöden och dekorativa effekter är förbjudna.

**Key Characteristics:**

- Uppgiftsstyrd och rollmedveten.
- Ljus, tät och lätt att skanna.
- Flat som standard, med djup endast när lager faktiskt överlappar.
- Tydlig svensk mikrokopia och synlig återkoppling.
- Mobil först för rapportering, datorstark för granskning och export.

## Colors

Paletten är återhållen: grafit bär informationen, rena ytor skapar lugn och teal används sparsamt för primära handlingar, aktiv position och fokus.

### Primary

- **Arbetsteal:** Primär handling och aktivt val. Den ska vara ovanlig nog att alltid betyda något.
- **Djup arbetsteal:** Hover och nedtryckt tillstånd på primära kontroller.
- **Fokusteal:** Synligt fokus, länkar och diskreta informationsmarkeringar.
- **Ljus teal:** Vald rad, mild informationsstatus och hover på neutrala ytor.

### Neutral

- **Arbetsyta:** Appens lugna bakgrund bakom innehåll.
- **Klar yta:** Formulär, tabeller och verkligt avgränsade arbetsområden.
- **Diskret yta:** Verktygsrader, tomlägen och sekundär gruppering.
- **Grafit:** Primär text och data.
- **Djup grafit:** Rubriker och navigation med högsta kontrast.
- **Mellantext:** Hjälptext och sekundära värden, aldrig för kritisk information.
- **Avdelare:** Tunna linjer som grupperar rader och sektioner.

### Semantic

- **Klar:** Success används för godkänt och komplett, aldrig som dekoration.
- **Behöver uppmärksamhet:** Warning används för sådant som kräver kontroll men inte blockerar.
- **Åtgärd krävs:** Danger används för fel, nekad status och destruktiva handlingar.

**The Ten Percent Rule.** Teal får bära högst cirka tio procent av en normal arbetsvy. Om flera stora ytor är teal samtidigt har hierarkin gått förlorad.

**The No Color Alone Rule.** Status ska alltid ha text eller ikon utöver färg.

## Typography

**Display Font:** Manrope Variable med Aptos, Segoe UI och system-ui som fallback.

**Body Font:** Samma familj i hela appen. Typsnittet levereras lokalt och ingår i appens offlinecache.

**Character:** En tydlig sans med öppna former och lugn viktning. Rubriker, data och instruktioner ska gå att skilja åt utan extra dekoration.

### Hierarchy

- **Headline** (700): Sidans namn. Grundstorleken i frontmatter används på mobil; från sm är storleken 1.75rem.
- **Title** (600, 1rem, 1.35): Sektioner, listobjekt och viktiga sammanfattningar.
- **Body** (400, 0.875rem, 1.5): Arbetsinstruktioner, beskrivningar och normal text, högst 70 tecken per rad när det är prosa.
- **Label** (600): Fältetiketter i normal meningsform. Kolumnrubriker och status får använda 0.75rem.
- **Data** (600, 0.875rem, tabular-nums): Timmar, datum, projektnummer och belopp.

**The One Page Title Rule.** Varje sida har en tydlig H1. Upprepade små uppercase-eyebrows ovanför rubriker är förbjudna.

**The Fixed Product Scale Rule.** Produkttext använder fasta storlekar. Viewportstyrd displaytypografi hör inte hemma i arbetsytan.

## Layout

På dator från 1024px finns en vit sidomeny på 16rem och en fast sammanhangsrad med aktuell arbetsyta. Innehållet har en gemensam maxbredd på 88rem och konsekvent luft mellan rubrik, filter och data. Vit yta och tunna avdelare håller ihop formulär och listor.

På mindre skärmar används menyknapp och rollanpassad bottennavigation. Projektlistan visar kundnamn överst och projektnamn under i kompakta länkrader. Detaljer öppnas genom att välja projektet. Sidrubrik och huvudhandling ska kunna bryta till separata rader vid 200 procent textstorlek.

**The Reflow Rule.** När utrymmet minskar ska innehåll staplas och text brytas; viktiga länkar får aldrig döljas för att få plats.

## Elevation & Depth

Appen är flat som standard. Struktur skapas med avstånd, tonala ytor och enpixelavdelare. Skuggor används endast när ett element faktiskt ligger ovanpå ett annat, exempelvis mobilnavigation, sticky spara, popover eller dialog.

### Shadow Vocabulary

- **Sticky låg:** En kort och diskret skugga under fast navigation eller spara-rad.
- **Dialog:** En tydligare men kompakt skugga för modala lager tillsammans med backdrop.

**The Flat Until Lifted Rule.** En statisk lista, tabell eller sektion får ingen dekorativ skugga. Om elementet inte överlappar innehåll ska det inte se upplyft ut.

## Shapes

Kontroller har måttligt rundade hörn. Listor och avgränsade formulär använder ytradien i frontmatter. Dialoger är något mjukare; pillform används för kort status och filtervärden. Vanliga sektioner har ingen skugga.

## Components

Komponenterna ska vara bekanta, precisa och tillräckligt taktila för användning i fält.

### Buttons

- **Shape:** Måttligt rundade kontroller (8px).
- **Primary:** Arbetsteal med vit text, 10 x 16px padding och minst 44px träffhöjd.
- **Hover / Focus:** Djupare teal vid hover och en tydlig tvåpixels fokusring vid tangentbord.
- **Secondary:** Vit yta, grafittext och en tunn avdelare. Ingen bred skugga.
- **Danger:** Rosenröd används endast när handlingen är destruktiv och ska följas av bekräftelse eller Ångra.

### Chips

- **Style:** Pillform är reserverad för kort status eller filtervärde, inte för vanliga kommandon.
- **State:** Vald status använder mild tonad yta, mörk text och textetikett. Färg ensam räcker aldrig.

### Cards / Containers

- **Corner Style:** Avgränsade formulär och listor använder ytradien. Undvik extra paneler runt enstaka värden.
- **Background:** Klar yta eller diskret yta beroende på informationsnivå.
- **Shadow Strategy:** Ingen skugga i normalläge.
- **Border:** Horisontella avdelare och fulla enpixelsramar används funktionellt. Färgade sidränder är förbjudna.
- **Internal Padding:** 16px mobil och 20 till 24px på större ytor.

### Inputs / Fields

- **Style:** Vit bakgrund, enpixels avdelare, 8px radie och minst 44px höjd.
- **Focus:** Fokusteal i ram och ring utan att layouten flyttar sig.
- **Error / Disabled:** Felet står intill fältet med orsak och lösning. Disabled ska fortfarande vara läsbart.

### Navigation

Sidnavigation grupperas efter arbete: Projekt och inköp, Min tid, Tid och personal, Register och Inställningar. Bara aktuell destination markeras; detaljvyer ärver markeringen från sin arbetsyta. Aktiv post använder tonad bakgrund och tydlig text utan färgad sidrand.

Arbetsledarens mobilnavigation visar Projekt, Inköp, Rapportera, Attest och Ekonomi. Medarbetaren har Översikt, Min vecka, Rapportera, Projekt och Inställningar. Revisorn har Rapporter, Ekonomi och Inställningar. Övriga tillåtna destinationer finns i huvudmenyn; navigationen ersätter aldrig serverns behörighetskontroll.

Mobilmenyn isolerar bakgrunden, håller tangentbordsfokus inom menyn och stängs med Escape, vid navigering eller vid övergång till datorlayout. Fokus och sidans rullning återställs. Fokus på vit yta använder mörk fokusteal med minst 3:1 kontrast.

### Data Rows

Projektlistans standardvy visar kundnamn och därefter projektnamn med projektnummer som sekundär identifiering. Hela raden är en länk till projektets detaljvy. Statistik, ekonomi och uppgiftsutdrag ska inte göra standardraden högre.

Arbetsledaren öppnar Hantera för befintlig uppgiftshantering, bulkval och arkivering. Medarbetaren öppnar Uppgifter för sina tillåtna uppgiftsåtgärder. Avancerade projektrader visar projektidentitet, nästa uppgift samt timmar och underlag i kolumner på bred skärm och staplat på mobil. Sekundära kommandon har namngivna knappar och minst 44px träffyta. Listor i Inköp och Projektekonomi delar samma yta och avdelare.

### Review Step

Attest och export avslutas i ett samlat granskningssteg med period, omfattning, saknade uppgifter, avvikelser och den slutliga handlingen i samma läsordning.

## Do's and Don'ts

### Do:

- **Do** forma varje sida efter en primär arbetsuppgift och en tydlig huvudhandling.
- **Do** använda rader, tabeller, sektioner och sammanhang före generiska kort.
- **Do** behålla Anderssons logotyp, arbetsteal och grafit som igenkännbara ankare.
- **Do** använda minst 44 x 44px träffytor och verifiera 200 procent zoom.
- **Do** visa konsekvens och avvikelser innan attest, radering eller export slutförs.
- **Do** använda 150 till 250ms rörelse endast för tillstånd och återkoppling.

### Don't:

- **Don't** bygga generiska kortraster där varje informationsbit ligger i en likadan ruta.
- **Don't** använda AI-genererade dashboardmönster med dekorativa KPI-block, upprepade eyebrow-rubriker eller tillgjord premiumkänsla.
- **Don't** lägga marknadsföringslayout inne i arbetsflöden eller låta budskap tränga undan den primära uppgiften.
- **Don't** använda dekorativa gradienter, glassmorphism, färgade sidränder eller animationer utan funktion.
- **Don't** använda kompakta kontroller, otydliga ikonknappar eller tabeller som endast fungerar på stor datorskärm.
- **Don't** kapsla kort i kort eller kombinera dekorativ bred skugga med tunn ram.
