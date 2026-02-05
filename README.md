# TidApp - Tidrapportering för Hantverks- och Byggföretag

En modern PWA-baserad tidrapporteringsapp designad för svenska hantverks- och byggföretag med 4-10 anställda.

## Funktioner

### Roller & Behörighet
- **Admin** - Full access till allt
- **Arbetsledare** - Kan skapa projekt, attestera tidrader
- **Medarbetare** - Kan rapportera egen tid, se egna rapporter

### Grundregister
- **Kunder** - Med kontaktuppgifter och standard timpris
- **Projekt** - Kopplade till kunder, med budget och status
- **Aktiviteter** - Kategoriserade (Arbete, Resa, Möte, Intern, ÄTA, Frånvaro)

### Tidrapportering (Mobilflöde i 3 klick)
- Välj datum → projekt → aktivitet → timmar
- Markera fakturerbar/ej fakturerbar
- Lägg till notering
- Valfri GPS-position
- **Offline-stöd** - Spara lokalt och synka automatiskt

### Attestflöde
- Veckovy med summering (må-sön)
- Skicka för attest
- Godkänn/neka med kommentar
- Lås upp om behövs

### Rapporter & Export
- **Löneunderlag** - Per person och aktivitetskod
- **Fakturaunderlag** - Per kund/projekt med belopp
- CSV-export (svensk Excel-kompatibel med UTF-8 BOM och semikolon)

### Dashboard
- Översikt timmar (vecka/månad)
- Pågående projekt med budget
- Att attestera
- Mina ej inskickade veckor

## Teknikstack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Node.js + Fastify + TypeScript
- **Databas**: SQLite (Prisma ORM)
- **Auth**: JWT
- **PWA**: Vite PWA Plugin med Service Worker

## Kom igång

### Förutsättningar
- Node.js 18+
- npm

### Installation (Utvecklingsmiljö)

1. **Klona/ladda ner projektet**

2. **Installera och starta backend**
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

3. **Installera och starta frontend** (i nytt terminalfönster)
```bash
cd frontend
npm install
npm run dev
```

4. **Öppna appen**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Installation (Docker)

```bash
docker-compose up --build
```

Appen blir tillgänglig på http://localhost:5173

## Testanvändare

| Roll | E-post | Lösenord |
|------|--------|----------|
| Admin | admin@byggab.se | password123 |
| Arbetsledare | lars@byggab.se | password123 |
| Medarbetare | erik@byggab.se | password123 |
| Medarbetare | maria@byggab.se | password123 |
| Medarbetare | peter@byggab.se | password123 |

## API-endpoints

### Auth
- `POST /api/auth/login` - Logga in
- `GET /api/auth/me` - Hämta inloggad användare
- `POST /api/auth/change-password` - Byt lösenord

### Resurser (CRUD)
- `/api/users` - Användare
- `/api/customers` - Kunder
- `/api/projects` - Projekt
- `/api/activities` - Aktiviteter
- `/api/time-entries` - Tidrader
- `/api/week-locks` - Veckolås (attestflöde)
- `/api/settings` - Inställningar

### Rapporter
- `GET /api/reports/salary?from=X&to=Y&format=csv` - Löneunderlag
- `GET /api/reports/invoice?from=X&to=Y&format=csv` - Fakturaunderlag

### Dashboard
- `GET /api/dashboard` - Översiktsdata

## Datamodell

```
User (id, name, email, role, hourlyCost, active)
Customer (id, name, orgNumber, address, contactPerson, email, phone, defaultRate)
Project (id, customerId, name, code, site, status, budgetHours, billingModel, defaultRate)
Activity (id, name, code, category, billableDefault, rateOverride, sortOrder)
TimeEntry (id, userId, projectId, activityId, date, hours, billable, note, status, gps...)
WeekLock (id, userId, weekStartDate, status, comment)
Attachment (id, timeEntryId, filename, mimeType, path)
AuditLog (id, userId, action, entityType, entityId, oldValue, newValue)
Settings (id, companyName, vatRate, csvDelimiter, reminderTime, reminderEnabled)
```

## Säkerhet

- Lösenord hashas med bcrypt (10 rounds)
- JWT-tokens med 7 dagars giltighet
- Rate limiting (100 req/min)
- RBAC på alla endpoints
- Audit logging för ändringar

## GDPR

- Minimerad persondata
- "Radera användare"-funktion tar bort ALL relaterad data
- Audit log för spårbarhet

## CSV-export format

### Löneunderlag
```
Person;Datum;Kod;Aktivitet;Timmar;Projekt;Kommentar
"Erik Elektriker";"2024-01-15";"MONT";"Montage";"8,0";"P2024-001";"Elinstallation"
```

### Fakturaunderlag
```
Kund;Projekt;Projektkod;Datum;Aktivitet;Person;Timmar;á-pris;Belopp;Kommentar
"Fastighets AB";"Fasadrenovering";"P2024-001";"2024-01-15";"Montage";"Erik";"8,0";"850,00";"6800,00";""
```

## Offline-stöd

Appen fungerar offline genom:
1. Service Worker cachar alla statiska resurser
2. IndexedDB (via Zustand persist) sparar pending tidrader
3. Automatisk synkronisering när nätverket återkommer
4. Visuell indikator för offline-läge

## Vidareutveckling

### Planerade förbättringar
- Magic link för inbjudan av nya användare
- Push-notifikationer för påminnelser
- Filuppladdning till S3
- Integration med bokföringssystem
- Mobil-app (React Native)

## Licens

Proprietär - Alla rättigheter förbehållna

---

Utvecklad med ❤️ för svenska hantverksföretag
