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

## Testkonton efter seed

```text
rick@anderssonsisolering.se / Rick1234
admin@testforetaget.se / Test1234
```

Byt lösenord och seed-data innan riktig produktion.

## Kommandon

Backend:

```bash
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed:safe
```

Frontend:

```bash
npm run build
```
