---
name: TidApp
description: Från arbetad timme till godkänt löneunderlag utan dubbelarbete.
colors:
  work-teal: "#185c56"
  work-teal-hover: "#174a47"
  work-teal-focus: "#1b7169"
  work-teal-soft: "#effaf7"
  workspace: "#eef2f1"
  surface: "#ffffff"
  surface-subtle: "#f7f7f5"
  ink: "#171b1a"
  ink-strong: "#0b0f0e"
  ink-muted: "#62666d"
  divider: "#d9dfdc"
  success: "#047857"
  warning: "#b45309"
  danger: "#be123c"
typography:
  headline:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0"
rounded:
  control: "8px"
  surface: "8px"
  dialog: "12px"
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

# Design System: TidApp

## Overview

**Creative North Star: "Den välordnade arbetsdagen"**

TidApp ska kännas som ett lugnt, välorganiserat arbetsbord där rätt sak alltid ligger närmast. En medarbetare använder appen i dagsljus i en servicebil eller på en arbetsplats och vill bli klar på några tryck; en arbetsledare granskar avvikelser mellan samtal; lön och ekonomi behöver avsluta perioden utan osäkerhet. Det kräver en ljus, tydlig och återhållsam produktmiljö.

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

**Display Font:** Aptos med Segoe UI och system-ui som fallback.

**Body Font:** Aptos med Segoe UI och system-ui som fallback.

**Character:** En enda humanistisk sans ger igenkänning, god läsbarhet och mindre visuell friktion. Typografin ska kännas exakt men inte steril.

### Hierarchy

- **Headline** (700, 1.5rem, 1.2): Sidans namn och endast sidans namn.
- **Title** (600, 1rem, 1.35): Sektioner, listobjekt och viktiga sammanfattningar.
- **Body** (400, 0.875rem, 1.5): Arbetsinstruktioner, beskrivningar och normal text, högst 70 tecken per rad när det är prosa.
- **Label** (600, 0.75rem, 1.3): Fältetiketter, kolumnrubriker och status. Normal meningsform är standard.
- **Data** (600, 0.875rem, tabular-nums): Timmar, datum, projektnummer och belopp.

**The One Page Title Rule.** Varje sida har en tydlig H1. Upprepade små uppercase-eyebrows ovanför rubriker är förbjudna.

**The Fixed Product Scale Rule.** Produkttext använder fasta storlekar. Viewportstyrd displaytypografi hör inte hemma i arbetsytan.

## Elevation

TidApp är flat som standard. Struktur skapas med avstånd, tonala ytor och enpixelavdelare. Skuggor används endast när ett element faktiskt ligger ovanpå ett annat, exempelvis mobilnavigation, sticky spara, popover eller dialog.

### Shadow Vocabulary

- **Sticky låg:** En kort och diskret skugga under fast navigation eller spara-rad.
- **Dialog:** En tydligare men kompakt skugga för modala lager tillsammans med backdrop.

**The Flat Until Lifted Rule.** En statisk lista, tabell eller sektion får ingen dekorativ skugga. Om elementet inte överlappar innehåll ska det inte se upplyft ut.

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

- **Corner Style:** Sektioner är normalt oramade. Ett verkligt avgränsat verktyg kan använda 8px radie.
- **Background:** Klar yta eller diskret yta beroende på informationsnivå.
- **Shadow Strategy:** Ingen skugga i normalläge.
- **Border:** Horisontella avdelare och fulla enpixelsramar används funktionellt. Färgade sidränder är förbjudna.
- **Internal Padding:** 16px mobil och 20 till 24px på större ytor.

### Inputs / Fields

- **Style:** Vit bakgrund, enpixels avdelare, 8px radie och minst 44px höjd.
- **Focus:** Fokusteal i ram och ring utan att layouten flyttar sig.
- **Error / Disabled:** Felet står intill fältet med orsak och lösning. Disabled ska fortfarande vara läsbart.

### Navigation

Sidnavigation grupperas efter arbete: Min tid, Ledning, Register och System. Aktiv post använder tonad bakgrund och tydlig text utan färgad sidrand. Mobilnavigation visar högst fem relevanta val per roll och placerar rapportering i tumzonen.

### Data Rows

Projekt, veckor och rapportposter är rader med stabila kolumner på dator och en tydlig tvånivåstruktur på mobil. Hela raden kan vara klickbar när det är entydigt; sekundära kommandon har egna namngivna knappar och minst 44px träffyta.

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
