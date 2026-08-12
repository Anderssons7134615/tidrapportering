---
name: tidapp-ui-polish
description: "Gör en slutlig UI-polish av en funktionellt klar TidApp-vy eller komponent. Använd efter React-, CSS-, formulär-, navigations- eller arbetsflödesändringar för att förbättra hierarki, tillgänglighet, responsivitet, tillstånd och svensk mikrokopia i linje med PRODUCT.md och DESIGN.md. Ändra inte affärsbeteende eller produktionsdata."
---

# TidApp: UI-polish före leverans

## Förutsättning

Använd bara efter att det avsedda beteendet fungerar. Läs `PRODUCT.md`, `DESIGN.md`, befintliga tokens i `frontend/src/index.css` och en närliggande vy innan du ändrar något. Identifiera driftens rotorsak: saknad token, onödig engångslösning eller fel informationsarkitektur.

## Polera arbetsuppgiften, inte dekorationen

- Säkerställ att användarens primära nästa handling syns inom fem sekunder och att den fungerar med en hand på mobil.
- Använd TidApps grafit/teal och befintliga rad-, sektion- och formulärmönster. Ny färg, stor radie, skugga eller spacing behöver motiveras av designsystemet.
- Prioritera rader, tabeller och tydliga sektioner före kort. Undvik gradienter, glassmorphism, färgade sidränder, generiska KPI-kort och animationer utan informationsvärde.
- Håll mikrokopia på enkel svenska: samma sak ska heta samma sak i hela flödet.

## Kontrollera varje relevant tillstånd

- Default, hover, fokus, active, disabled och loading för interaktiva kontroller.
- Valideringsfel med begriplig väg framåt, lyckad återkoppling, tomläge och långa namn/värden.
- Tangentbordsordning, synlig fokusring, status med text/ikon utöver färg, kontrast enligt WCAG AA och minst 44 × 44 px touchytor.
- Mobil, tablet och dator; 200 % zoom; `prefers-reduced-motion`; ingen horisontell scroll eller dold primär handling.

## Verifiera visuellt

Starta den lokala relevanta vyn när det går utan att skriva till produktion och testa den verkliga användarvägen. Använd browser- eller Playwright-kontroll vid behov. Kör sedan `npm run build` i `frontend` och granska slutdiffen.

## Rapportera

Säg vad som polerades, vilka tillstånd och viewportar som kontrollerades och vad som inte kunde testas. Lämna inte nya dekorativa mönster, hårdkodade engångsvärden eller otestade UI-fixar efter dig.
