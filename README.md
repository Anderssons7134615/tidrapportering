# TidApp

Tidrapportering för mindre hantverks- och byggföretag.

## Innehåll

- Inloggning med roller: admin, arbetsledare och medarbetare
- Kunder, projekt och aktiviteter
- Direkt tidrapportering: sparad tid syns direkt för admin/arbetsledare
- Offlinekö för tidrader som synkas automatiskt när användaren är online igen
- Teamvecka, attest och rapporter
- Railway-backend med PostgreSQL
- Cloudflare Pages-frontend

Produktivitet, arbetsmoment, materiallogg och Excel-import är borttagna för att hålla appen fokuserad på tidrapportering.

## Lokal utveckling

Krav:

- Node.js 20+
- npm
- PostgreSQL

Backend:

```bash
cd backend
npm ci
copy .env.example .env
npx prisma migrate deploy
npm run db:seed:safe
npm run dev
```

`npm run db:seed:safe` är avsett för lokal utveckling/test. Produktionsstart seedar inte längre automatiskt.

Frontend:

```bash
cd frontend
npm ci
copy .env.example .env
npm run dev
```

Lokala URL:er:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

För lokal frontend kan `VITE_API_URL` antingen vara tomt om Vite-proxyn ska användas, eller satt till `http://localhost:3001/api`.

## Railway Backend

Railway kan deploya från repo-roten via `railway.json`.

Viktiga variabler i Railway:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=långt-slumpat-hemligt-värde
FRONTEND_URL=https://din-cloudflare-pages-domän.pages.dev
EXTRA_CORS_ORIGINS=https://extra-preview-eller-custom-domain.se
UPLOAD_DIR=/app/uploads
```

Startkommandot kör:

```bash
cd backend && npm run start
```

Det kör `prisma migrate deploy`, seedar bara om databasen är tom och startar API:t.

Om din Railway-databas redan har tabeller från tidigare `prisma db push` men ingen Prisma-migrationshistorik, baseline:a första migrationen en gång innan vanlig deploy:

```bash
cd backend
npx prisma migrate resolve --applied 20260410110000_initial_postgresql
npm run start
```

Migrationen efter det droppar gamla `WorkLog`/`WorkItem`-tabeller om de finns.

## Cloudflare Frontend

Cloudflare Pages:

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Output directory: `dist`

Variabel:

```env
VITE_API_URL=https://din-railway-backend.up.railway.app/api
```

`frontend/public/_redirects` gör att SPA-routes fungerar vid refresh.

## Pushnotiser

Appen har webbpush för tidpåminnelser. Backend använder VAPID-nycklar och sparar varje användares webbläsar-/mobilsubscription.

Skapa VAPID-nycklar lokalt:

```bash
cd backend
npx web-push generate-vapid-keys
```

Lägg dessa variabler i Railway:

```env
WEB_PUSH_PUBLIC_KEY=...
WEB_PUSH_PRIVATE_KEY=...
WEB_PUSH_CONTACT=mailto:din-epost@anderssonsisolering.se
REMINDER_JOB_TOKEN=långt-slumpat-jobbtoken
```

Anställda aktiverar notiser i `Inställningar` i TidApp. Därefter kan ett schemalagt jobb anropa:

```bash
curl -X POST "https://din-railway-backend.up.railway.app/api/reminders/daily-time" \
  -H "Authorization: Bearer $REMINDER_JOB_TOKEN"
```

`/api/reminders/daily-time` skickar bara till aktiva medarbetare som saknar tid idag och hoppar över helger. Veckopåminnelsen finns kvar:

```bash
curl -X POST "https://din-railway-backend.up.railway.app/api/reminders/weekly-attestation" \
  -H "Authorization: Bearer $REMINDER_JOB_TOKEN"
```

## Testkonton efter seed

Seed-skripten skapar lokala testkonton för utveckling. Kör inte seed i produktion utan att först byta standarddata och lösenord. I produktion blockeras seed om `NODE_ENV=production`, om inte `ALLOW_PRODUCTION_SEED=true` uttryckligen sätts.

## Kommandon

Backend:

```bash
npm run build
npm start
npm run start:seed # endast lokal/test: migrera, seeda tom DB och starta
npm run db:generate
npm run db:migrate
npm run db:seed:safe
```

Frontend:

```bash
npm run build
```
