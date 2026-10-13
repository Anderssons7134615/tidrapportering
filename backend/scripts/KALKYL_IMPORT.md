# Första importen från Anderssons Kalkyl

Förutsätter att kalkylbryggan har publicerats efter godkänd migration. Bara ADMIN kan använda fliken.

1. Öppna rätt projekt i TidApp och välj **Kalkyl**.
2. Välj en förberedd JSON-fil från `C:\Users\rick8\AppData\Local\TidAppBackups\kalkyl-bridge-20261013`.
3. Kontrollera kalkylnamn, kund, källversion, rader, tid, belopp och målprojekt. De två förberedda filerna har samma kalkylnamn men olika käll-id/manuella anbud; välj utifrån innehållet, inte bara filnamnet.
4. Markera att innehåll och projekt är kontrollerade. Klicka **Spara låst kalkylversion**.
5. Öppna den sparade versionen och kontrollera uppgifterna. Samma fil kan återförsökas utan en extra version.

Detta samlar en historisk kalkyl på projektet. Fortsatt redigering görs i Anderssons Kalkyl och sparas som en ny revision före nästa export. Budget, fastpris och verkliga kostnader ändras inte vid import.

## Skapa nya exportfiler

Desktopprogrammet har ännu ingen JSON-exportknapp. Hjälparen läser endast sparade revisioner ur databasen, tar en konsekvent SQLite-kopia och skriver till en NY mapp. Den ersätter inga befintliga filer och kontaktar inte TidApp.

Kör från backend-katalogen med Python:

```powershell
python scripts/export-kalkyl.py "$env:LOCALAPPDATA/se.anderssonsisolering.kalkyl/database/andersson-kalkyl.sqlite3" "C:/vald/ny-exportmapp"
```

Ange den verkliga databasvägen om Windows appvirtualisering använder en annan plats. `manifest.json` visar den upplösta källan, käll-id, revision, namn och filhash. Använd inte `source-copy.sqlite3` som importfil; välj `Kalkyl-*.json`. Bevara mappen som lokalt källunderlag. Om exporten avbryts: bevara den partiella mappen och välj en ny mapp vid nästa försök.

Verifiera hjälparen utan riktiga data:

```powershell
python -m unittest discover -s scripts -p test_export_kalkyl.py
```

API:t accepterar formatet `andersson-kalkyl-v1`, högst 2 MB, 1–500 rader och 30 material per rad. Tomma utkast och större kalkyler stöds inte i denna första version. Sparade totalsummor måste stämma med serverns versionerade beräkning. Felaktiga eller förändrade källrevisioner avvisas för granskning.
