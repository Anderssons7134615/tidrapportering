# TidApp Redesign Plan

## Confirmed Brief

TidApp ska byggas om till ett sammanhängande, produktionsklart arbetsverktyg för medarbetare, arbetsledare, administratörer och lön eller ekonomi. Målet är inte en kosmetisk ommålning utan en gemensam informationsarkitektur där varje sida formas efter sitt faktiska arbete.

Den primära produktresan är: rapportera arbetad tid, kontrollera veckan, lösa avvikelser, attestera och skapa ett tryggt löneunderlag utan dubbelarbete.

### Design Direction

- **Color strategy:** Restrained. Teal används för handling, aktiv position och fokus; grafit och ljusa neutrala ytor bär informationen.
- **Scene:** Medarbetaren använder mobilen i dagsljus i fält och behöver bli klar med en hand. Arbetsledaren granskar mellan andra uppgifter. Lön och ekonomi avslutar perioden fokuserat på dator.
- **Anchors:** Linear för tydlig produkthierarki, GOV.UK för läsbarhet och trygg transaktion, samt moderna svenska bankflöden för bekräftelse före högriskhandlingar.
- **Fidelity:** Produktionsklar och fullt interaktiv.
- **Breadth:** Hela den autentiserade appen plus login, genomförd i kontrollerade faser.

### Layout Strategy

Varje sida har en H1, en tydlig primär handling och därefter information i läsordning. Dashboarden blir en prioriterad arbetskö. Projekt blir en skanningsbar lista. Tidrapportering blir ett kort stegflöde. Attest och export får ett sammanhållet granskningssteg. Sektioner är oramade tills en verklig verktygsgräns behöver visas.

### Required States

Varje berörd vy ska ha default, loading, empty, error, success, offline och realistiska edge cases. Formulär ska bevara inmatning efter fel. Högriskhandlingar ska ha bekräftelse och återhämtning. Listor ska provas med 0, 5, 100 och långa svenska värden.

## Codex Execution Rules

1. Arbeta endast på `codex/redesign` tills en fas är verifierad.
2. Läs `PRODUCT.md` och `DESIGN.md` före varje ny fas.
3. Ändra inte backendkontrakt om inte den aktuella fasen bevisligen kräver det.
4. Behåll all befintlig funktionalitet, rollstyrning, offlinekö och projektlogik.
5. Gör en fokuserad commit per fas. Pusha eller deploya endast efter uttryckligt klartecken.
6. Varje fas avslutas med build, relevanta tester, Impeccable-detektor och browserkontroll.
7. Kontrollera minst 1440 x 900, 1024 x 768, 390 x 844 och 360 x 667 samt 200 procent zoom.
8. Stoppa efter varje fas och visa skärmbilder eller tydliga browserresultat innan nästa fas startar.

## Phase 0 - System Foundation

### Scope

- `frontend/src/index.css`
- `frontend/tailwind.config.js`
- `frontend/src/components/ui/design.tsx`
- `frontend/src/components/Layout.tsx`
- Gemensamma skeleton-, error- och dialogkomponenter

### Work

- Ersätt card-, hero-card-, stat-card- och premium-panel-grammatiken med semantiska primitiver: `PageHeader`, `TaskSection`, `DataList`, `DataRow`, `Toolbar`, `ReviewSummary` och tillgänglig `Dialog`.
- Standardisera default, hover, focus, active, disabled, loading och error för alla kontroller.
- Gruppera desktopnavigation i Min tid, Ledning, Register och System.
- Behåll högst fem rollrelevanta mobilflikar och primär handling i tumzonen.
- Ta bort färgade sidränder, upprepade eyebrow-rubriker och dekorativ page-load-motion.
- Byt `ACCOUNTANT`-etikett från Revisor till Lön och ekonomi i UI.

### Acceptance

- Inga generiska kortraster eller nested cards i de gemensamma primitiverna.
- Alla interaktiva träffytor är minst 44 x 44px.
- Full tangentbordsnavigation, tydligt fokus och korrekt dialogbeteende.
- Ingen funktions- eller rollregression i routingen.

## Phase 1 - Employee Core Flow

### Scope

- `Login.tsx`
- `TimeEntry.tsx`
- `WeekView.tsx`
- Relevanta skeletons och felsteg

### Work

- Flytta loginformuläret över produktbudskap på mobil och håll submit inom 360 x 667.
- Förenkla tidrapportering till datum, projekt, aktivitet, timmar och spara; lägg presets och senaste val i en sammanhängande snabbvalsrad.
- Behåll avancerade start/sluttider bakom progressiv visning.
- Gör dagens vecka lätt att skanna och visa veckostatus och nästa steg tydligt.
- Ändra swipe-radering till reveal-then-confirm och lägg till Ångra.
- Behåll offlinekö och synlig synkstatus genom hela flödet.

### Acceptance

- En van användare kan rapportera normal tid på högst fem primära interaktioner efter login.
- Ingen tid kan raderas av ett enda oavsiktligt swipe.
- Alla formulärdata finns kvar efter validerings- eller nätverksfel.
- Mobilflödet fungerar med en hand och utan horisontell scroll.

## Phase 2 - Dashboard And Projects

### Scope

- `Dashboard.tsx`
- `DashboardDetail.tsx`
- `Projects.tsx`
- `ProjectDetail.tsx`

### Work

- Gör startsidan till en prioriterad arbetskö med Vad behöver göras nu, Veckoläge och Projekt att följa.
- Undvik KPI-strip som huvudkomposition; länka samman värden med åtgärder och ansvar.
- Gör projekt till stabila klickbara rader på dator och tvånivårader på mobil.
- Behåll automatiskt nästa projektnummer och visa det som ett lugnt förifyllt fält i skapaflödet.
- Förenkla projektfilter till sök, status och ett sekundärt filter; flytta resten till Fler filter.
- Ordna projektdetalj efter Översikt, Tid, Team, Material och Ekonomi med rollstyrd synlighet.

### Acceptance

- Projektkod, namn, kund, status, timmar och risk kan jämföras utan att öppna varje projekt.
- Nästa projektnummer visas och sparas korrekt, inklusive 0069 efter 0068.
- Dashboardens primära nästa handling är tydlig inom fem sekunder.
- Långa projektnamn och 100 projekt bryter inte layouten.

## Phase 3 - Approval And Payroll

### Scope

- `TeamWeekOverview.tsx`
- `Approval.tsx`
- `Reports.tsx`

### Work

- Bygg teamveckan som en granskningslista med tydliga avvikelser och nästa handling.
- Ersätt mobil attesttabell med sekventiell person/vecka-granskning; behåll tät tabell på dator.
- Lägg till batchval först när samma beslutsunderlag kan visas för alla valda veckor.
- Skapa ett granskningssteg före attest med person, period, timmar, saknade dagar och avvikelser.
- Gör rapporten dokumentlik: periodhuvud, sammanfattning, avvikelser, personer och exporter.
- Flytta export efter kontrollen och visa ett beständigt kvitto med period, antal personer och filtyp.
- Använd Lön och ekonomi i navigation, rubriker och hjälptexter.

### Acceptance

- Det går inte att attestera eller exportera utan att period och avvikelser är synliga i samma steg.
- Rapporten är begriplig både på skärm och vid utskrift/PDF-lik läsning.
- Ekonomianvändaren kan identifiera saknade personer och granskningsbehov före export.
- Dator- och mobilgranskning använder olika strukturer men samma data och terminologi.

## Phase 4 - Registers And Settings

### Scope

- `Customers.tsx`
- `Activities.tsx`
- `Materials.tsx`
- `Users.tsx`
- `Settings.tsx`
- Skapa- och redigeringsdialoger

### Work

- Använd samma rad-, toolbar- och dialogprimitiver som projekt och attest.
- Gör tomlägen handlingsbara och felmeddelanden specifika.
- Ta bort tekniska push-endpoints och råa browservärden från normal användarvy.
- Lägg avancerad diagnostik bakom en separat administrativ detaljvy.
- Säkerställ cancel, Escape, focus trap, initialt fokus och fokusåtergång i alla dialoger.

### Acceptance

- Samma handling ser ut och fungerar likadant i alla register.
- Inga tekniska backend- eller browservärden visas utan tydligt användarbehov.
- Alla skapaflöden kan slutföras med tangentbord och avbrytas utan dataförlust.

## Phase 5 - Hardening And Release Gate

### Work

- Kör frontend build och samtliga relevanta backendtester.
- Kör Impeccable detector och åtgärda verkliga träffar; dokumentera falska positiva.
- Browsertesta alla roller och kritiska flöden med realistiska API-data.
- Kontrollera loading, empty, error, success, offline, lång text och stora datamängder.
- Kontrollera WCAG AA-kontrast, tangentbord, skärmläsarnamn, 200 procent zoom och reduced motion.
- Jämför visuellt alla sidor för samma typografi, kontroller, radstruktur och spacing.
- Kör en ny `$impeccable critique` och jämför mot baslinjen 24/40.

### Release Gate

- Inga P0- eller P1-brister kvar i critique eller browsertest.
- Frontend build, backendtester och produktionskritiska flöden är gröna.
- Användaren godkänner desktop- och mobilskärmbilder innan merge.
- Först därefter commit av slutlig release, push till GitHub och automatisk Cloudflare/Railway-deploy.

## Recommended Impeccable Sequence

1. `$impeccable extract frontend/src/components/ui`
2. `$impeccable craft employee core flow`
3. `$impeccable craft dashboard and projects`
4. `$impeccable craft approval and payroll`
5. `$impeccable craft registers and settings`
6. `$impeccable audit frontend`
7. `$impeccable polish frontend`
8. `$impeccable critique frontend`

## Confirmation Gate

No UI implementation starts until Rick confirms this brief and execution order. The default start after confirmation is Phase 0 followed by Phase 1; later phases remain untouched until the previous phase has been visually accepted.
