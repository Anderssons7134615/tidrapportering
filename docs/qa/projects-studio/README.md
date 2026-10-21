# Projektvyn · Studio

Granskningsunderlag från 21 oktober 2026. Utgår från `master` vid `03f12d3`, inte PR #14. Alla bilder visar syntetiska testuppgifter i den riktiga React-appen. Inga produktionsanrop eller produktionsändringar har gjorts.

## Utformning

- Kundnamn och projektnamn är radens tyngdpunkt. Antal, projektnummer och status linjeras till höger på dator och under namnet på mobil.
- Studio behåller lokal Geist, blå huvudhandling, grafit och den ljusa arbetsytan. Inga nya typsnitt, bibliotek, kortraster eller dekorativa effekter.
- Synlig söketikett, märkta filter, tydligt aktivt hanteringsläge och namngiven uppgiftsknapp. Projektstatus har både symbol och text.
- Projektets innehåll kommer före radåtgärderna även på mobil. Ekonomikolumnen finns bara när tillåten ekonomi faktiskt visas.
- Filter och öppnade uppgifter tonas in under 160 ms. Arbetslistan animeras inte. Reducerad rörelse följer den befintliga globala regeln.
- Laddningsvyn och långa kundnamn får plats vid 320 px. Formulärkanter har stärkts för tydligare kontrast.
- Den delade dialogen återställer nu fokus även när projekt-/uppgiftsdialogen avmonteras vid stängning. Redigeringsknappen behåller dessutom fokus under asynkron hämtning med `aria-disabled` och en synkron anropsspärr. Övriga komponentbiblioteket bevaras.

## Verifiering

| Kontroll | Resultat |
| --- | --- |
| `cd frontend && npm test` | 134/134 passerar, inklusive 26 projekttester |
| `cd frontend && npm run build` | TypeScript, Vite och PWA-bygge passerar |
| `git diff --check` | Passerar |
| Chromium 153, Playwright med lokala API-fixtures | Kund → projekt → detalj, kund-/arkivkontext, sökning, filter/rensa, tomläge, arkivbekräftelse/avbryt, läsfel/nytt försök och fördröjd laddning |
| Roller | Administratör, arbetsledare och medarbetare; cachad ekonomi visas inte för otillåtna roller |
| Tangentbord | Enter öppnar uppgifter/filter; Tab når filter i läsordning; synlig fokusmarkering; projektdialog utesluter bakgrundskontroller; Escape stänger och fokus återgår till öppningsknappen; fördröjd redigering med upprepad Enter testad för admin på dator/mobil och arbetsledare |
| Responsivitet | 1440 × 1000, 768 × 900, 390 × 900 och 320 × 900 CSS-pixlar; ingen sidscroll och minst 44 × 44 px mål i kontrollerade tillstånd |
| Förstoring | 720 × 500 CSS-viewport, motsvarande arbetsytan i ett 1440 × 1000-fönster vid 200 % browserzoom; reflow och träffytor passerar |
| Reducerad rörelse | Emulerad `prefers-reduced-motion: reduce`; filteranimationen blir högst 0,01 ms |
| axe-core, WCAG 2 A/AA + 2.1 AA | Noll automatiska avvikelser eller poster för manuell kontroll i fem granskade lägen: kundlista, hantering på dator/mobil, medarbetare och arbetsledare |

De fyra nya regressionstesterna täcker arbetsledarens ekonomibegränsning, filter-/uppgiftskontrollernas etiketter och tillstånd, fokus efter stängning av projektdialog samt fördröjd redigering med dubblettspärr och nytt försök efter läsfel. Befintliga tester omfattar bland annat partiella arkivfel, sena svar efter kundbyte, redigering, skapande och cacheuppdatering.

Browserkontrollen blockerar externa anrop och oväntade API-anrop. Samtliga browser-anrop är läsningar mot fixtures. Skrivflöden verifieras av befintliga komponenttester, inte mot en riktig backend. Resultaten finns i [results.json](results.json).

## Bilder

| Vy | Dator | Mobil |
| --- | --- | --- |
| Kundlista | [Öppna](desktop-customers.png) | [Öppna](mobile-customers.png) |
| Kundens projekt | [Öppna](desktop-projects.png) | [Öppna](mobile-projects.png) |
| Hantering med öppna uppgifter | [Öppna](desktop-management.png) | [Öppna, rullad till projektet](mobile-management.png) |

[Långt namn vid 320 px](mobile-long-names.png) · [Reflow motsvarande 200 % zoom](zoom-200-reflow.png)

## Köra om browserkontrollen

`frontend/qa/projects-studio.mjs` startar en egen lokal Vite-server och använder inga riktiga inloggningsuppgifter. Installera `playwright` och `axe-core` i en separat testmiljö eller gör dem tillgängliga genom `NODE_PATH`, installera Playwrights Chromium och kör från `frontend`:

```sh
NODE_PATH=/sokvag/till/qa/node_modules node qa/projects-studio.mjs
```

`QA_BROWSER_PATH` och `QA_BROWSER_ARGS` (JSON-array) kan användas för en separat Chromium-installation. Appens beroenden och låsfil ändras inte. Den här körningen använde Chromium 153.0.8010.0, Playwright 1.51.1 och axe-core 4.14.0.

## Begränsningar

Mobil är viewport-emulering i Chromium, inte fysisk iPhone/Safari eller Android. 200 % är motsvarande CSS-viewport, inte en manuellt ändrad zoomkontroll. Ingen skärmläsarsession har utförts; axe är inte ett intyg om full WCAG-överensstämmelse. Backend, Prisma och driftsmiljö är oförändrade och har inte integrationstestats här.

Befintliga varningar om Browserslists ålder och React Routers framtida flaggor finns kvar. Ingen dependency-uppgradering ingår.

Den oberoende slutgranskningen hittade tappat fokus vid asynkron redigering (P1) samt avvikelse mellan synlig filteretikett och tillgängligt namn (P2). Båda har rättats och den asynkrona vägen har lagts till i komponent- och browserkontrollerna.
