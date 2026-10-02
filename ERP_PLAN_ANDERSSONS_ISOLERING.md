# Plan för Anderssons Isolering

Datum: 2026-10-02. Status: projektöversikt och ekonomi driftsatta i `7e96493`; fakturadelen implementerad och verifierad lokalt till och med `dcedbb3`. Rick har godkänt migration/driftsättning och en aktuell kod- och databasbackup har återställningsprovats. Produktionsutfall och Bevego-pilot ska efterkontrolleras. Kartläggningens historiska utgångsläge var lokal `master`, commit `923c4af`. Aktuell leveransstatus finns även längre ned.

## Rekommendation

Bygg vidare i befintliga TidApp till Anderssons Isolering, en gemensam arbetsyta för projekt, tid och inköp. Behåll befintlig React-, Fastify- och PostgreSQL-grund. Rick har uttryckligen ändrat prioriteringen: projekt, ekonomi och fakturaflöde först. Lönedelen nedan är en senare möjlighet och ingår inte i det pågående genomförandet. Ingen ny fristående app ska byggas.

Första etappen ska göra tre saker tydliga: vilka projekt behöver Rick agera på, hur timmar och beräknad ekonomi ser ut och vilket material har köpts till respektive projekt. Revisorns löneingång kommer senare. Bokföring och löneberäkning ligger kvar i respektive ekonomisystem. Offertmotor, lagerstyrning, inköpsorder och avancerad resursplanering väntar.

Dokumentet innehåller genomförandegrund och öppna beslut. Faktisk leverans och verifiering dokumenteras separat per ändring. Befintliga orelaterade filer i arbetskopian ska lämnas orörda.

## Genomförandestatus: projekt och ekonomi

Första kodetappen är implementerad i befintliga appen:

- Chefer landar på Projekt efter inloggning. Befintlig tidrapportering, attest och revisorsrapporter finns kvar.
- Projektlistan visar nästa uppgift, rapporterade/ej attesterade timmar, timbudget och saknade ekonomiska underlag. Aktiva, Behöver åtgärd och Arkiverade har tydliga urval.
- Projektkontroll, portfölj och projektdetalj använder gemensamma regler för beräknad ekonomi: attesterad tid och materialens sparade priser. Saknad prisgrund ger okänt resultat, inte nollkostnad. Timbudget följer rapporterad tid.
- Projektdetaljen gör två initiala dataanrop. Tid, materialregister, materialrader och dagbok hämtas när fliken öppnas. Projektsökningen har 250 ms fördröjning.
- Projektvyerna uppdateras efter ändrad tid, attest, material, projekt och berörda äldre prisuppgifter.
- Namn, inloggning och meny är förenklade till Anderssons Isolering; befintliga identifierare för offlinekö och inloggning bevaras.

Verifierat lokalt: backend 110 tester och bygge, frontend 37 tester och bygge, `git diff --check`. Browserkontroll med helt lokala testdata: projektlista, ekonomi, projektdetalj, laddning vid flikbyte, tangentbordsbyte av flikar och inloggning/startsida för alla fyra befintliga roller. Vyer kontrollerade på 1440 px dator, 390 px mobil och 720 px reflow; projektdetaljen även med 200 % textstorlek. Sidhuvudets knappar radbryts efter ett upptäckt reflowfel. Ofullständig kostnadsgrund och tomma urval har regressionstester. Produktionsdata har inte ändrats av testerna.

Kvar i senare prestandaarbete: ekonomiläsningen använder två smala bulkfrågor men hämtar fortfarande historikrader till Node. Databassummering och mätning med stor representativ historik återstår. Ingen uppmätt förbättring av produktionssvarstiden påstås. Ingen schemaändring eller datamigration ingår i denna etapp.

Den pågående fakturafasen är implementerad och verifierad lokalt: PDF-original, projektfördelning, dubblettskydd, krediter och granskning. Migrationsgodkännande och verifierad backup är nu klara; produktionsutfall och pilot med riktiga Bevego-original ska kontrolleras vid leverans. Lönedelen prioriteras inte i detta genomförande.

## Utgångsläge vid kartläggningen

Tabellen beskriver commit `923c4af` före genomförandet. Projektöversikt och gemensamma ekonomiregler har därefter driftsatts; fakturadelen är klar lokalt enligt statusen ovan.

| Område | Verifierat i koden | Vad som behöver utvecklas |
| --- | --- | --- |
| Projekt | Kundkoppling, projektnummer, status, budget, fastpris/löpande, uppgifter, dagbok, tid och material. | En gemensam arbetsöversikt med nästa åtgärd och tydlig ekonomisk grund. |
| Projektekonomi | Rapportering och attest visas separat; portföljens arbetskostnad bygger på attesterad tid. | Samma definitioner i alla vyer; underlagsbrister ska synas. |
| Bevego | Import av artikel- och prislista finns. | Egen leverantörsfaktura, originalunderlag, dubblettskydd och projektfördelning saknas. |
| Lön | Attesterad tid, periodsnabbval 21–20, Excel/CSV och revisorsunderlag finns. | Egen löneingång, smalare revisorsbehörighet och återhämtningsbara exportversioner. |
| Behörighet | ADMIN, SUPERVISOR, EMPLOYEE och ACCOUNTANT med företagsavgränsning. | ACCOUNTANT får även projektekonomi och är därför bredare än en ren lönehämtarroll. |
| Snabbhet | Sidkod laddas redan vid behov och React Query används. | Projektdetaljens datahämtning och portföljens historikläsning bör mätas och begränsas. |

Nuvarande materialimport från Excel skapar nya materialrader utan importidentitet. Den ska inte användas som genväg för leverantörsfakturor. `ProjectMaterial.invoiceStatus` avser kundfakturering och låsning av materialunderlag, inte status för Bevegos faktura.

## Arbetsytan och designen

Använd namnet **Anderssons Isolering** i apphuvud, inloggning, sidtitel och installerad webbapp. Behåll tekniska identifierare för lagring och offlinekö så att ett namnbyte inte tappar sparad tid.

Designriktningen är en ljus, saklig ekonomiarbetsyta inspirerad av användarens Visma eEkonomi-referens: vänstermeny på dator, sökbara listor, tydliga kolumner och en huvudsaklig handling per vy. Behåll Anderssons gröna accent. Status ska gå att förstå i text. Stora dekorativa kort och onödiga effekter tillför inget här.

Impeccable är valt som befintligt designstöd, särskilt dess planeringsflöde. Projektets PRODUCT.md och DESIGN.md är fortsatt grund. Inget nytt designplugin behöver installeras för första etappen. Detaljskiss och UI-kontroll ingår i respektive kodleverans.

| Roll | Först efter inloggning | Viktigaste ingångar |
| --- | --- | --- |
| Rick/administration | Projektöversikt | Projekt, Ekonomi, Tid och attest, Rapporter, Kunder, Inställningar; Inköp tillkommer när fakturaflödet finns. |
| Arbetsledare | Projekt och väntande arbete | Projekt, teamets tid och attest inom befintlig behörighet. |
| Medarbetare | Rapportera tid/min vecka | Rapportera, Min vecka, Projekt. Ekonomin lämnas utanför. |
| Revisor för enbart lön | Löneunderlag | Period, personer, underlag och tidigare exportversioner. |

Projektets sida samlar **Översikt, Tid, Material och inköp, Dokument**. Uppgifter och senaste anteckningar ligger nära översikten. Ekonomiska detaljer visas bara för behöriga och laddas när de behövs. Befintlig dagbok bevaras; Dokument och fakturaoriginal tillkommer med fakturaflödet. På mobil visas projektets namn, avvikelse och nästa åtgärd först, med fler uppgifter på nästa nivå.

## Projektöversikten som minskar vardagskaoset

Rick ska inom ungefär 30 sekunder kunna se vilka projekt som behöver ett beslut. Detta är ett föreslaget användbarhetsmål som ska provas med Rick, inte ett uppmätt resultat.

En projektrad visar projektnummer/namn, kund, status, ansvarig eller ”saknas”, nästa åtgärd/datum, timmar mot budget och en tydlig underlagsvarning. Ekonomiska detaljer ska inte göra grundlistan bred och svårläst; öppna dem på projektet eller i en ekonomivy som delar samma urval.

Snabburval: **Behöver åtgärd, Pågående, Planerade, Avslutade**. Arkivering förblir ett separat registerval. ”Behöver åtgärd” bygger på konkreta signaler: försenad uppgift, passerat uppföljningsdatum, ej attesterad tid, saknad budget/prisgrund och senare ofördelad faktura. Visa orsaken, inte en ogenomskinlig risksiffra.

Varje aktivt projekt bör ha en ansvarig och en konkret nästa åtgärd. Befintliga uppgifter kan bära nästa åtgärd och datum. Uppgiftsansvarig är inte automatiskt projektansvarig; ett separat val läggs till om sådan relation saknas. Historiska projekt kompletteras genom en granskningslista, inte genom gissad massuppdatering.

Föreslagen ekonomisk presentation:

- Rapporterade timmar och attesterade timmar visas var för sig.
- Budgetavvikelse utgår från tydligt angiven timgrund.
- Materialåtgång med kalkylpris och inköp enligt fakturor visas som olika mått.
- Beräknad intäkt är inte samma sak som fakturerad eller betald intäkt.
- ”Beräknat projektresultat” kräver angiven beräkningsgrund. Saknade kostnader/priser visas som ofullständigt underlag, inte som noll.
- Fastprisprojekt får inte presenteras som färdig vinst enbart för att hela kontraktssumman finns medan bara en del av kostnaderna har kommit in.

Innan förändrade ekonomiska nyckeltal släpps ska `projectMetrics`, projektets summering och portföljen få samma dokumenterade regler. Kodläsningen visar olika urval av tid i dessa vägar. Redan i projektleveransen ska API och UI skilja beräknad intäkt/resultat från fakturerade och betalda belopp. De senare visas som ”uppgift saknas” tills en verklig fakturakälla finns; de får inte fyllas från fastpriset.

## Senare möjlighet med Löneunderlag

Bygg en egen `/payroll`-yta ovanpå befintlig attest och rapportlogik. Visa vald period, personer, attesterade timmar, avvikelser samt **Hämta Excel** och **Hämta CSV**. Behåll 21–20 som befintligt standardintervall tills Rick bekräftar annat. Ett passerat datumintervall betyder inte att perioden är komplett eller låst.

Föreslaget antagande: revisorn ska läsa och hämta, inte ändra tid eller attestera. För detta behövs en smal rättighet, exempelvis `PAYROLL_REVIEWER`, som bara ger tillgång till löneunderlag för rätt företag. Befintliga ACCOUNTANT-användare ändras inte automatiskt. Inloggning, utloggning och egna säkerhetsinställningar ska fungera även med den nya rollen.

API:t ska vitlista lönefälten: person/anställningsreferens, datum, aktivitet/kod, timmar samt de projekt- och kommentarsfält som revisorn faktiskt behöver. Ingen intern timkostnad, projektmarginal, GPS eller inköpsinformation följer med. Företagsgränsen och rollgränsen kontrolleras i API:t för både aktuell data och äldre exporter.

Vyn måste skilja mellan ”saknar attesterad tid”, ”har ej attesterade rader” och ”har inte rapporterat”. Det sista kan inte säkert avgöras enbart ur dagens rapport. Utan verifierad förväntad arbetstid ska den inte lova att löneunderlaget är komplett. Rick hanterar attestavvikelser i befintligt flöde.

Spara varje skapad export som en oföränderlig version med exakt underlag, period, personurval, skapare, tidpunkt, radantal, formatversion och kontrollsumma. Spara både normaliserat källunderlag per tidrad och den genererade filen per format så att samma version kan hämtas byte för byte. En hash ensam räcker inte. Jämför aktuell behörig data för exakt samma urval med snapshoten och identifiera tillagda, ändrade eller bortfallna rader. En senare ändring, ny attest eller upplåsning ska ge varningen ”Underlaget har ändrats sedan version X” och möjlighet för behörig användare att skapa en ny version. Skriv ”exportversion skapad”, inte ”mottagen av revisorn”, eftersom en nedladdning inte bevisar mottagande.

Fullständig periodstängning och spärr mot rättelser väntar tills rättelseflödet är bestämt. Löneperioden 21–20 korsar veckogränser, medan dagens attest låser hela veckor. Direktimport till löneprogram väntar också på bekräftat program, importformat och explicit mappning av lönekoder. Dagens namn-/kodtolkning för exempelvis övertid ska inte bli ett automatiskt lönekontrakt.

Klart när en testrevisor kan logga in, välja period och hämta en identifierbar export; nekas projektekonomi och skrivande endpoints; och får rätt företags underlag. Den smala rollen använder en separat payroll-router. Testa att direktanrop till gamla `/reports/*`, `/project-portfolio`, `/week-locks` och skrivande endpoints nekas; lägg inte bara rollen i den breda befintliga rapportbehörigheten. Testa även ändrad attest efter export, samma versions återhämtning, periodgränser och Excel/CSV-innehåll. Åtkomst till äldre versioner och bevarandetid beslutas före skarp lagring av snapshots.

## Bevego från faktura till projekt

Önskat flöde: **Lägg in faktura → kontrollera tolkning → välj/fördela projekt → spara inköpsunderlag → se kostnaden och originalet på projektet.**

Bevegos egen sida bekräftar att kundportalen visar fakturahistorik och erbjuder fakturakopior. Deras webbplats har även ett separat flöde för PDF-faktura. Det bevisar inte tillgång till ett öppet Bevego-API. [Bevego E-handelskonto](https://www.bevego.se/kund-hos-bevego/bli-kund/ansok-e-handelskonto)

| Importväg | Rekommendation och villkor |
| --- | --- |
| Läs från befintligt ekonomiflöde | Förstahandsval om fakturorna redan finns där och nödvändiga fält går att läsa. Undviker dubbel registrering. Verifiera en riktig Bevego-faktura hela vägen innan implementation. |
| Ladda upp PDF | Avgränsad pilot om systemkopplingen dröjer. Tolka till utkast, visa original och osäkra fält, kräv kontroll före projektfördelning. |
| Strukturerad EDI/e-faktura | Föredras framför OCR när ett faktiskt dokumentformat och en tillgänglig leveransväg har verifierats. Bygg inte flera importvägar samtidigt. |

Spiris-verktyg finns tillgängliga i denna miljö, men det aktuella läsförsöket stoppades med krav på ny autentisering. Inga fakturor eller företagsinställningar lästes. En separat pluginsökning gav inga nya träffar för Bevego/Rillion/Spiris; det är inte bevis för att sådana integrationer saknas.

Spiris dokumenterar leverantörsfakturaimport och projektfördelning i sin egen Tid & Projektplanering. Det är ett relevant arbetsflöde att lära av, inte en färdig integration med TidApp. En egen produktionskoppling kräver dessutom verifierad API-åtkomst och tillstånd; Codex-kopplingen är inte en driftintegration i appen. [Spiris projektkostnader](https://support.spiris.se/tid-projektplanering/en-se/content/online-help/administrera-integrationer-eekonomi-fora-over-levfaktura.htm), [Spiris API](https://developer.vismaonline.com/docs/spiris-eaccounting-api-documentation)

Tidigare arbetskontext beskriver revisorns granskning → Ricks attest → Spiris via Rillion. Det är ett äldre, ännu inte återbekräftat flöde. Planen utgår tills vidare från att det bevaras: appen läser och projektfördelar underlag, utan automatisk bokföring, betalning eller attest i ekonomisystemet.

Fakturor får en egen modell med originalreferens, leverantör, extern identitet/fakturanummer, dokumenttyp, datum, valuta, netto/moms/brutto, radposter, eventuell kreditreferens och projekttilldelningar. OCR-förslag och importerade fält hålls åtskilda från bekräftade värden. Fakturamärkning matchas i första hand mot exakt projektnummer inom företaget; osäkra träffar hamnar i ”Behöver fördelas”. Inga nya projekt skapas från en oklar fakturatext.

En faktura kan delas mellan flera projekt. En ofördelad rest är tillåten och synlig, men totalen måste alltid stämma. Rabatter, frakt, avrundning, moms och krediter måste hanteras uttryckligt. Pilotens kostnadsgrund föreslås vara netto i SEK; andra valutor och oklar momsbehandling stoppas för granskning tills en regel finns. Testbar regel: projektfördelat netto + ofördelat netto = fördelningsbart netto. Det sistnämnda härleds ur fakturans rader, rabatter, frakt och uttryckligt klassade justeringar; moms redovisas separat. Kreditbelopp behåller sitt negativa tecken. Belopp hanteras med exakta decimaler/öresbelopp och dokumenterad avrundning.

Dublettskyddet måste fungera både vid omförsök och om samma faktura kommer via PDF och API. Använd bolag + stabil leverantörsidentitet + fakturaidentitet/dokumenttyp, externa käll-ID:n och filhash som kompletterande bevis. Samma identitet med ändrat innehåll blir en konflikt att granska. Filhash eller fakturadatum ensamt är otillräckligt. Dokumentidentiteten skyddas av en unik databasregel. Importoperationen sparar payloadhash och tidigare resultat; ett identiskt omförsök returnerar samma resultat. Rad- och fördelningsoperationer får egna stabila identiteter så att även samtidiga omförsök inte kan skapa dubbla kostnader. Flera avsiktliga projektdelar på samma fakturarad måste fortsatt tillåtas.

Import ska vara atomär, företagsavgränsad och spårbar. Original lagras privat med behörighetskontrollerad hämtning och backup. Filtyp, storlek och dokumentinnehåll valideras. Osäker eller felaktig tolkning får inte skapa projektkostnader.

**Ingen dubbel materialkostnad:** ProjectMaterial fortsätter beskriva åtgång/försäljningsunderlag. Leverantörsfakturan beskriver inköp. Först visas dessa bredvid varandra. När faktisk inköpskostnad ska ingå i samma resultat krävs en spårbar ersättnings-/avstämningsregel mot tidigare kalkylerad materialkostnad. Summan av båda får aldrig bli standard.

Klart för pilot när normalfaktura, delad faktura, kredit, omuppladdning, samma faktura via två källor, fel projekt, ofullständig tolkning och totalskillnad har testats. Börja därefter med ett fåtal utvalda projekt och stäm av mot källunderlaget innan fler fakturor tas in.

## Snabbhet med mätning före ändring

Ingen prestandavinst är ännu uppmätt. Följande kandidater kommer från kodläsningen:

1. Projektdetaljen kan starta upp till sju dataanrop och hämtar bland annat hela aktiva artikelregistret direkt. Ladda materialväljare och flikdata vid behov; behåll en liten startsummering.
2. Projektportföljen hämtar alla tid- och materialrader för aktiva projekt och summerar i Node. Mät och ersätt onödiga fulla rader med smala databassummeringar där samma ekonomiska regler kan bevaras.
3. Projektsökningen använder varje tecken som en ny fråga. Pröva cirka 250–300 ms fördröjning, avbryt inaktuella anrop och behåll användbar laddningsindikering.
4. Sidindelning och materialsökning på servern införs först när mätningen motiverar det. Summeringar ska alltid tydligt ange om de avser hela urvalet eller den visade sidan.

Mät på samma lokala representativa data före och efter: tid till användbar projektlista, antal anrop, svarsstorlek, endpointtid och materialväljarens respons. Prova både liten och större historik samt mobil uppkoppling. Föreslagna mål för piloten är användbar projektlista inom två sekunder på definierad testuppkoppling och omedelbar visuell respons på inmatning. Dessa är mål, inte produktionslöften.

Låt pris-, roll-, attest- och offlineuppdateringar fortsätta slå igenom. Förläng inte all cachetid för att dölja ett långsamt flöde. Paket- och ramverksuppgraderingar ingår endast om ett konkret behov kan beläggas.

## Ordning för genomförandet

| Steg | Avgränsad leverans | Krav för att gå vidare |
| --- | --- | --- |
| 0 | Kartläggning och plan. Klar. | Efterföljande uppdrag: implementera projekt och ekonomi först. |
| 1 | Anderssons Isolering som namn och samlad projektöversikt. Mät och åtgärda relevant datahämtning. | Rick kan hitta nästa åtgärd, tid och avvikelse utan att hoppa runt; ekonomi och mobilflöde fungerar. |
| 2 | En Bevego-importväg med original, förhandsgranskning, dubblettskydd och projektfördelning. | Pilot stämmer mot källfakturor, även krediter och upprepade importer. |
| 3 | Automatisk läsning från ekonomisystem samt ekonomisk avstämning. | Verifierad åtkomst, källidentitet, synkfel/återförsök och tydlig kostnadsgrund. |
| Senare | Egen Löneunderlag-yta med smal åtkomst och exportversioner. | Ny prioritering från Rick; format och rättigheter behöver bestämmas. |
| Senare | Offert, ÄTA, faktureringsunderlag och enkel planering efter verklig användning. | De första arbetsflödena används stabilt och ett konkret nytt behov är prioriterat. |

Arbeta ett steg i taget. Varje steg ska kunna demonstreras och användas före nästa. Ingen omskrivning av hela appen och ingen bred import av historik i första etappen.

## Teknisk genomförandegrund och verifiering

Behåll en skrivande huvudagent och riktade läsande subagenter. Återanvänd befintligt autentiserings-, attest- och integrationsmönster. Separera leverantörsfakturaimport, projektkostnadsberäkning och löneexport bakom små tydliga moduler. Undvik ett generellt integrationsramverk innan en faktisk importväg fungerar.

Schemaändringar ska vara tillägg som fungerar med befintliga data. För varje migration krävs granskad SQL, backup-/återställningsplan och uttryckligt godkännande före `prisma migrate deploy` i produktion. Återgång ska kunna ske genom att avaktivera den nya funktionen utan att radera underlag. Tidigare exportversioner och källdokument bevaras.

Varje kodleverans följer AGENTS.md: relevanta regressionstester, backendens tester/bygge, frontendbygge och lokal UI-kontroll för berörda flöden, UI-polish och läsande fullstackgranskning av slutdiffen. Lägg särskild vikt vid företagsisolering, negativa rolltester, återförsök, svenska periodgränser och ekonomisk avstämning. Därefter fokuserad commit/push enligt projektets normala leveransregler.

Historisk baslinje före implementationen: backend `npm test` godkänd, 102 tester; frontend `npm test` godkänd, 31 tester. Frontend gav befintliga varningar om kommande React Router-beteende. `git diff --check` kördes utan anmärkning. Byggen och UI-provning ingick inte då. Aktuellt efter implementationen: 127 backendtester, 43 frontendtester, båda byggena samt sju separata PostgreSQL-integrationstester är godkända; lokalt browserprov är genomfört enligt leveransstatusen nedan. Verklig löneimport och produktionsprestanda har inte verifierats. Lokala tester bevisar inte att fakturadelen fungerar i produktion.

## Öppna beslut inför respektive steg

- Vilket löneprogram och importformat använder revisorn? Räcker Excel/CSV som första underlag?
- Ska revisorn enbart hämta, eller också granska/rätta något? Planens minimala roll utgår från enbart hämtning.
- Hur länge ska exportversioner sparas, och vilka uppgifter behöver revisorn i dem?
- Kommer Bevego-fakturorna via Rillion/Spiris, PDF-mejl eller kundportal? Spiris behöver återanslutas för en verklig provläsning.
- Vilken källa ger projektmärkning, artiklar, original och krediter? Det avgör pilotens importväg.

De öppna integrationsfrågorna hindrar inte en projektöversikt eller lokal UI-utveckling. De ska däremot besvaras innan vi lovar automatisk fakturakoppling eller direktimport till lönesystemet.

## Källor i aktuell kod

### Genomförandestatus 2026-10-02

Steg 1 är levererat i `7e96493` på master. Railway rapporterar lyckad driftsättning; den publika appen visar **Anderssons Isolering** och API:s readiness-kontroll svarar. Projektöversikt, enhetlig ekonomi, rollstyrd startsida, sökfördröjning och behovsstyrd flikladdning är införda. Ingen uppmätt produktionsprestandavinst påstås.

Steg 2 byggs i samma app på `codex/project-invoices`. Första leveransen är en avgränsad PDF-väg via **Inköp** och projektets **Inköp**-flik. Originalet lagras privat i databasen. Tolkningen ger endast förslag; användaren fyller i leverantörens organisationsnummer, kontrollerar datum/belopp och fördelar netto per projekt. Exakta heltalsören, krediter, avrundning, restbelopp, dubbletter, revisionskonflikter och rättelser hanteras. Endast bekräftade fördelningar visas som inköp, separat från materialåtgång och det befintliga projektresultatet.

Denna version fördelar fakturans kontrollerade netto på projektnivå. Artikelrader, OCR, automatisk projektmatchning, matchning mot en ursprunglig kreditfaktura och Spiris-synk ingår inte ännu. Det är en insnävning av den långsiktiga modellen ovan. Ingen riktig Bevego-faktura finns som verifierad testkälla; den riktiga pilotavstämningen återstår. Därför är målet om färdig Bevego-import inte markerat klart.

Appkoden för steg 2 är committad som `1510be6`. Rick godkände migration och fortsatt driftsättning 2026-10-02, efter säkerhetskopia. Railway nekade volymsnapshot med `Not Authorized`, men en logisk `pg_dump` kunde tas genom befintlig SSH. Databasdump, Git-bundle och zip av produktionskoden finns i `OneDrive/Tidsapp-backups/2026-10-02-before-invoices-165943`. Databasen har återställts lokalt med matchande tabellräkningar och den godkända migrationen har provats på kopian utan ändrade verksamhetsrader. Bilageinventeringen visade noll lagrade bilagor. Kodkopian har återlästs och integritetskontrollerats. Ingen produktionsmigration kördes före dessa kontroller.

Lokala tester har passerat för företagsskydd, roller, pengar, statusövergångar, atomär audit, dubbletter och PDF-parserns timeout/felfall: 127 backendtester och 43 frontendtester, båda byggena och diffkontroll godkända. Alla migrationer har provats i en ny PGlite-databas. UI har provats med syntetisk data på dator/mobil och med 200 procent textstorlek. Oberoende fullstackgranskning är klar utan kvarvarande P0/P1; upptäckta fel i rättelse och skydd av osparade uppgifter är rättade och regressionstestade. Produktionsstart inväntar uttryckligt godkännande av den granskade migrationen enligt AGENTS.md; se `backend/prisma/migrations/20261002153000_supplier_invoices/REVIEW.md`.

Utökad verifiering 2026-10-02: alla 15 migrationer passerar även i en ny lokal PostgreSQL 17.11-databas. Sju integrationstester med riktig Prisma provar samtidiga fakturauppladdningar/ändringar, atomär rollback vid loggfel samt originalhämtning, datum, behörigheter och inköpssummering. Produktionsstart och riktig Bevego-pilot återstår. Testinstruktion: `backend/scripts/INVOICE_POSTGRES_TESTS.md`.

Referenserna nedan gäller commit `923c4af` och är utgångspunkter för implementation, inte en fullständig granskningsrapport.

- Projektmodell och materialmodell: `backend/prisma/schema.prisma:179` respektive `:291`.
- Projektkontroll och ekonomisk portfölj: `backend/src/routes/projectTasks.ts:99` respektive `:296`.
- Projektgränssnitt: `frontend/src/pages/Projects.tsx:49`, `frontend/src/pages/ProjectEconomy.tsx:12`, `frontend/src/pages/ProjectDetail.tsx:66`.
- Bevego-prisimport: `backend/src/lib/materialCatalogImport.ts:204`. Befintlig materialimport: `backend/src/routes/projects.ts:956`.
- Materialmått och projektberäkning: `backend/src/lib/projectMetrics.ts:114` samt projektets summering i `backend/src/routes/projects.ts:851`.
- Idempotensmönster: `backend/src/lib/integrationMaterialBatch.ts:49` och `:172`.
- Löne-/revisorsunderlag och exportaudit: `backend/src/routes/reports.ts:10`, `:161`, `:255`, `:340`.
- Attest och upplåsning: `backend/src/routes/weekLocks.ts:234` och `:431`.
- Löneperiod och navigation: `frontend/src/utils/payrollPeriod.ts:7`, `frontend/src/components/Layout.tsx:31`, `frontend/src/App.tsx:57`.
- Befintlig testgrund: `backend/src/routes/projectTasks.route.test.ts`, `backend/src/routes/weekLocks.approval.route.test.ts`, `frontend/tests/payrollPeriod.test.mjs`, `frontend/tests/projects.test.mjs`.
