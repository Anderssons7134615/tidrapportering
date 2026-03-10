# DESIGN_NOTES – Tidrapportering (snabb UI-audit)

## Varför det känns "vibe coded" idag
Kort sagt: mycket är **nästan bra**, men saknar en tydlig, konsekvent visuell standard.

- Komponenter har blandad stilnivå (vissa `btn/input/card`, andra custom-klasser inline).
- Spacing, iconstorlek och rubriknivåer varierar mellan sidor.
- Tabeller/listor har olika densitet, radhöjd och kontrast.
- Statusfärger används men utan en samlad semantik (info/success/warn/error/neutral).
- Interaktion/fokus är inte helt enhetlig på alla klickbara element.

---

## 1) Snabb stil-audit per vy

### Layout
- **Bra:** modern struktur, tydlig nav, mobil + desktop.
- **Problem:** lite för många visuella nivåer samtidigt (blur, overlays, borders, flera bakgrundstoner).
- **Effekt:** UI känns "byggt efter hand" snarare än systematiskt.

### Dashboard
- **Bra:** informativa kort och snabbgenvägar.
- **Problem:** olika korttyper har olika visuella regler (spacing/ikonvikt/progress/etiketter).
- **Effekt:** svårt att snabbt läsa hierarki (vad är KPI vs detalj).

### TeamWeekOverview
- **Bra:** funktionellt, sök + expandering fungerar.
- **Problem:** tabell/accordion-stil är enklare än övriga appen; saknar gemensam tabellstandard.
- **Effekt:** mer "admin-proto" känsla än produktionsdesign.

### Projects
- **Bra:** mycket info tillgänglig, bra filters.
- **Problem:** många actions med olika knappstilar och visuell tyngd i samma rad.
- **Effekt:** användarens blick hoppar; oklart vad primär handling är.

### TimeEntry
- **Bra:** snabbflöde är starkt.
- **Problem:** blandning av egna knappar + standardknappar + details-panel ger ojämn rytm.
- **Effekt:** upplevs halvvägs mellan "form" och "snabbapp".

---

## 2) Förslag: konkreta design tokens (startnivå)

## Färger (semantiska)
- `bg`: `#F8FAFC`
- `surface`: `#FFFFFF`
- `text`: `#0F172A`
- `text-muted`: `#475569`
- `border`: `#CBD5E1`
- `primary`: `#2563EB` (hover `#1D4ED8`)
- `success`: `#059669`
- `warning`: `#D97706`
- `danger`: `#DC2626`
- `info`: `#0284C7`

## Typografi
- Brödtext: 14/20 (mobile), 15/22 (desktop)
- Rubrik sida: 30/36 semibold
- Rubrik sektion: 20/28 semibold
- Label/metadata: 12/16 medium
- KPI-värde: 28/32 semibold

## Spacing (4-bas)
- `4, 8, 12, 16, 24, 32`
- Kort-padding: `16` (mobile), `20` (desktop)
- Sektion-gap: `24`

## Radius
- Input/knapp: `10-12px`
- Kort: `16px`
- Modal: `20px`

## Skuggor
- `sm`: `0 1px 2px rgba(15,23,42,.06)`
- `md`: `0 8px 24px rgba(15,23,42,.08)`

## Tabellstandard
- Header: neutral bg (`slate-50`), 12px uppercase, tydlig kontrast
- Rad: min-h ca `44px`, hover `slate-50`
- Zebra valfritt i täta admin-listor
- Actions i sista kolumn med konsekvent ikonknapp

## Status badges
- Neutral, Info, Success, Warning, Danger
- Samma padding/radius/textstorlek överallt
- Undvik fler än 1 accentfärg per rad utöver status

---

## 3) Prioriterad ändringslista (snabb effekt först)

### P0 (1 dag, hög effekt)
1. Standardisera rubriker + metadata (samma storlek i alla sidor).
2. Enhetlig knapphierarki: primär, sekundär, destruktiv.
3. En gemensam tabell/row-stil (TeamWeekOverview + listor).
4. Tydliga fokusstilar på alla interaktiva element.

### P1 (1–2 dagar)
5. Definiera status-system (badge + progress-färg + text) och använd överallt.
6. Rensa visuellt brus i Layout (färre lager/kontraster i nav + overlays).
7. Sätt konsekvent spacing-rytm i cards/forms.

### P2 (senare)
8. Component library-light: `StatCard`, `PageHeader`, `DataTable`, `StatusBadge`.
9. Dark mode/tema först när ljus design är helt konsekvent.

---

## 4) Tillgänglighet – snabb checklista

- **Kontrast:** mål minst 4.5:1 för normal text, 3:1 för stor text/UI-komponenter.
- **Klickyta:** minst 44x44 px för knappar/ikoner i mobil.
- **Fokus:** synlig `focus-visible` på länkar, knappar, formulär, summary.
- **Hierarki:** en tydlig H1 per sida + konsekventa H2/H3.
- **Formulär:** labels ska alltid vara synliga, inte bara placeholder.
- **Status enbart med färg:** komplettera färg med text/ikon (redan delvis bra).

---

## Små starter-tweaks som redan lagts in

- `frontend/src/index.css`
  - Grundläggande CSS-variabler för färg/radius/skugga (start för design tokens).
  - Global `focus-visible`-förstärkning för bättre keyboard/a11y.

Det här är medvetet små steg för snabb vinst utan stor refaktor.
