# Projektvyn: benchmark och beslutstöd

Datum: 2026-08-20. Fokus: `/projects` som snabb arbetslista på mobil och webb. Källorna är leverantörernas egna hjälpdokument; “rekommendation” nedan är en slutsats för TidApp, inte ett påstående från leverantören.

## TidApps egna ramar

- Medarbetaren arbetar ofta på mobil med begränsad uppmärksamhet, medan arbetsledning och ekonomi gör mer granskning på dator. Samma visuella språk ska användas, men arbetsytan ska formas efter rollen. ([PRODUCT.md](./PRODUCT.md))
- Projekt ska visas som stabila datarader: datorn kan använda kolumner och mobilen en tydlig tvånivåstruktur. Träffytor ska vara minst 44 × 44 px och status får inte förmedlas enbart med färg. ([DESIGN.md](./DESIGN.md))
- Generiska kortraster och dekorativa dashboards är uttryckligen anti-mönster. ([PRODUCT.md](./PRODUCT.md))

## Observerade mönster i andra produkter

### Arbetslistor

- Linear låter användaren välja lista eller tavla, gruppera och sortera samt välja exakt vilka egenskaper som visas. Deras “My Issues” prioriterar automatiskt brådskande arbete, blockeringar och aktivt arbete före backlogg och avslutat. ([Linear: Display options](https://linear.app/docs/display-options), [Linear: My issues](https://linear.app/docs/my-issues))
- Asanas listvy har filter, sortering, gruppering och möjlighet att visa, dölja och ordna fält. En sparad vy kan göras till standard. ([Asana: List view](https://help.asana.com/s/article/list-view))
- ClickUps listvy kan grupperas efter bland annat status, ansvarig, prioritet och deadline; kolumner kan läggas till eller tas bort. På mobil filtreras sökresultatet medan användaren skriver och underuppgifter kan fällas ut i listan. ([ClickUp: Intro to List view](https://help.clickup.com/hc/en-us/articles/6310260883351-Intro-to-List-view), [ClickUp: List view on mobile](https://help.clickup.com/hc/en-us/articles/7246289487511-Use-List-view-on-mobile))

### Sökning, fokus och ägarskap

- Linear kan filtrera listor på bland annat ansvarig, status, prioritet, projekt och datum; filtreringen uppdaterar listan direkt. ([Linear: Filters](https://linear.app/docs/filters))
- Asanas Android-sökning hittar projekt och uppgifter och har filter direkt under sökfältet. ([Asana: Search on Android](https://help.asana.com/s/article/search-on-android))
- Monday erbjuder sökfält, personfilter och snabba filter; snabbfiltren visar hur många poster som matchar varje val. ([Monday: Board filters](https://support.monday.com/hc/en-us/articles/360003624660-The-Board-Filters))
- Fieldwire ger samma uppgiftsfunktioner på mobil som på webb, men anpassar gränssnittet. På mobil finns “Mina”, “Bevakade” och “Alla”, gruppering på bland annat status och ansvarig, tidsfilter samt sökning på uppgiftsnamn, ansvarig, kategori, status och tagg. ([Fieldwire: Tasks on mobile](https://help.fieldwire.com/hc/en-us/articles/360017420132-How-to-use-Tasks-on-the-Fieldwire-Mobile-Apps-iOS-and-Android))
- Procores “My Open Items” samlar åtgärdsbara poster som är tilldelade användaren och visar dem med projekt, typ, detalj och status. Projektets hemsida kompletterar med deadline och en uppdelning mellan försenat, kommande sju dagar och senare. ([Procore: My Open Items](https://v2.support.procore.com/product-manuals/my-open-items/tutorials/view-my-open-items-in-the-portfolio-tool), [Procore: Project Home](https://support.procore.com/products/online/user-guide/project-level/home-project/tutorials/about-the-project-home-page))

### Fältarbete och projektval

- Fieldwire filtrerar fältuppgifter på status, kategori, ansvarig, plan, plats och tid, inklusive ett särskilt val för försenade öppna uppgifter. ([Fieldwire: Sort and filter tasks](https://help.fieldwire.com/hc/en-us/articles/360018171011-How-to-sort-and-filter-tasks))
- Procores projektlista kan sökas på projektnamn eller projektnummer och filtreras på bland annat datum och status. I iOS-appen kan projekt sorteras efter senast visade, namn eller nummer; när platsåtkomst används finns även “närmast mig”. ([Procore: Search, sort and filter projects](https://support.procore.com/products/online/user-guide/company-level/resource-planning/tutorials/search-sort-and-filter-the-project-list), [Procore: Sort projects on iOS](https://support.procore.com/procore-mobile-ios/user-guide/project-overview-screen-ios/tutorials/sort-projects-ios))

## Rekommendation för TidApp

### 1. En enda kompakt grundvy

- Använd samma informationsordning och funktion på telefon och dator: **`projektnummer · projektnamn`**, en kort text för högsta brådska och en disclosure-knapp.
- Behåll en verklig rad, inte ett kort. Sikta på cirka 52 px stängd radhöjd; projektnamnet trunkeras till en rad och full information öppnas först vid behov.
- Sortera standardmässigt **försenat → idag → kommande sju dagar → övriga aktiva**. Det gör prioriteringen stabil utan att användaren först måste förstå filterpanelen.
- Visa brådska med text och antal, till exempel `2 försenade`; tonad bakgrund får bara vara extra signal.

### 2. Progressiv disclosure, inte fler kolumner på mobil

- Projektlänken öppnar projektdetaljen. En separat, namngiven 44 px-knapp fäller ut projektets öppna uppgifter på plats.
- Utfälld uppgift visar i denna ordning: **vad**, **ansvarig**, **deadline**, **status**. Anteckning, prioritet och administrativa projektkommandon hör hemma i redigering eller projektdetalj.
- Visa normalt inte klara uppgifter. De nås genom ett uttryckligt filter; annars konkurrerar historik med det som behöver göras.

### 3. Sökning och filter utan verktygsrad som tar över

- Sök alltid på projektnummer, namn, kund och arbetsplats. Resultatet bör uppdateras under inmatning.
- Ha ett synligt sökfält och en kompakt knapp `Filter`. På mobil öppnas övriga filter i en panel; på dator kan samma filter ligga i en tät rad. Resultat och begrepp ska vara identiska.
- Första snabbvalen bör vara `Kräver åtgärd`, `Idag`, `7 dagar`, `Väntar` och, för arbetsledning, `Utan ansvarig`. Visa aktiva filter som kort text med en tydlig `Rensa`-åtgärd.
- Lägg inte till tavla, tidslinje, diagram eller valbara kolumner nu. De löser inte kärnproblemet att hitta rätt projekt snabbt och skulle öka val- och scrollbördan.

### 4. Rollspecifika standarder

- **Medarbetare:** öppna direkt på relevanta aktiva projekt och egna öppna uppgifter. Visa endast projektidentitet, arbetsplats när den behövs för att skilja projekt åt samt nästa egna deadline/status. Ingen ekonomidata eller allmän projektadministration.
- **Arbetsledare/admin:** visa alla aktiva projekt, brådskesortering och ägarskap. Tillåt filter per ansvarig och status samt snabb åtgärd av en uppgift efter disclosure. Skapande och inaktivering ska ligga sekundärt till själva arbetslistan.
- **Lön/ekonomi:** använder den separata, läsande vyn `/project-economy`. `/projects` förblir arbetskö för admin, arbetsledare och medarbetare; denna fas ändrar inte ekonomins routing eller behörighet.

### 5. Tydliga statusregler

- Varje öppen uppgift ska ha exakt en ansvarig, en status och ett uppföljningsdatum. `Väntar` behöver både orsak/anteckning och nytt uppföljningsdatum för att inte bli en gömd kö.
- Projektets sammanfattning ska härledas från öppna uppgifter och visa endast den mest akuta kategorin i stängd rad. Full fördelning visas efter disclosure eller filter.
- Kopiera inte Procores platsbaserade projektsortering till TidApp i denna fas. Det kräver platsåtkomst och ger liten nytta när projektnummer, sök och senast/relevant arbete räcker.

## Acceptanskriterier för `/projects`

1. Samma projektordning, text och disclosure-beteende vid mobil- och datorbredd.
2. Minst åtta stängda projektrader ryms ungefär i en normal mobilvy efter sidhuvud och sök/filter; inga projektkort används.
3. Ett känt projekt hittas via nummer eller namn med högst ett tryck till sökfältet.
4. Försenad/idag/7 dagar kan filtreras med högst två tryck och aktiva filter kan rensas med ett tryck.
5. En användare kan identifiera projekt, högsta brådska och om fler uppgifter finns utan att öppna raden.
6. Medarbetare ser inte administrativ eller ekonomisk projektdata; arbetsledare kan se ansvarig; ekonomens projektarbete ligger kvar i den separata läsande projektekonomin.
7. Alla interaktiva mål är minst 44 × 44 px, status har text och flödet fungerar vid 200 % zoom.
