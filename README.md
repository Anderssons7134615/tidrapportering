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

- Node.js 22+
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
ALLOW_PUBLIC_REGISTRATION=false
PUBLIC_UPLOADS_ENABLED=false
```

Startkommandot kör:

```bash
cd backend && npm run start
```

Det kör `prisma migrate deploy` och startar API:t. Produktionsstarten seedar aldrig databasen.

`ALLOW_PUBLIC_REGISTRATION` är opt-in och ska normalt vara `false`. Nya användare skapas då av en administratör. `PUBLIC_UPLOADS_ENABLED` ska normalt också vara `false`, eftersom bilagor annars kan nås utan inloggning.

Bilagor lagras på disk. Koppla därför `UPLOAD_DIR` till en beständig Railway Volume, eller flytta lagringen till en extern objektlagring, innan bilagor används i produktion. Utan beständig lagring kan filer försvinna vid omdeploy trots att databasraden finns kvar.

Om din Railway-databas redan har tabeller från tidigare `prisma db push` men ingen Prisma-migrationshistorik, baseline:a första migrationen en gång innan vanlig deploy:

```bash
cd backend
npx prisma migrate resolve --applied 20260410110000_initial_postgresql
npm run start
```

Migrationen efter det droppar gamla `WorkLog`/`WorkItem`-tabeller om de finns. Ta en verifierad databasbackup innan den körs i en äldre miljö och kontrollera först om tabellerna innehåller data som ska bevaras.

## Produktionskontroll

- Railway ska kontrollera `/api/ready`, som även verifierar databasen.
- Begränsa `FRONTEND_URL` och `EXTRA_CORS_ORIGINS` till de exakta domäner som används.
- Aktivera schemalagda PostgreSQL-backuper och provåterställ en backup regelbundet.
- Koppla `UPLOAD_DIR` till beständig lagring och kontrollera att en bilaga överlever en omdeploy.
- Följ fel, svarstider och misslyckade hälsokontroller med Railway eller extern övervakning.

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
