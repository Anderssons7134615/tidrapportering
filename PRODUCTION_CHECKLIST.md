# TidApp – Produktionschecklista

Den här checklistan är till för att skydda driftmiljö och live-databas. Appen används redan, så behandla databasen som skarp data.

## Databas – absolut viktigast

Kör aldrig följande mot live/prod-databasen:

```bash
npx prisma migrate reset
npx prisma db push
npm run db:seed
npm run db:seed:safe
```

Undvik också manuell SQL som `DROP`, `TRUNCATE` eller breda `DELETE` utan backup och separat plan.

Innan framtida schemaändringar:

- [ ] Ta backup/snapshot av PostgreSQL-databasen.
- [ ] Läs migrationsfilen innan deploy.
- [ ] Testa migrationen mot kopia/staging om möjligt.
- [ ] Ha rollback-plan.
- [ ] Kör endast `prisma migrate deploy` i produktion.

## Obligatoriska miljövariabler backend

```env
DATABASE_URL=postgresql://...
JWT_SECRET=långt-slumpat-hemligt-värde
FRONTEND_URL=https://din-cloudflare-pages-domän.pages.dev
EXTRA_CORS_ORIGINS=
UPLOAD_DIR=/app/uploads
ALLOW_PUBLIC_REGISTRATION=false
PUBLIC_UPLOADS_ENABLED=false
```

Rekommendationer:

- `JWT_SECRET` ska vara långt, slumpat och unikt för produktion.
- `ALLOW_PUBLIC_REGISTRATION=false` om appen inte ska ta emot nya företag öppet.
- `FRONTEND_URL` ska matcha Cloudflare Pages/custom domain exakt.
- `EXTRA_CORS_ORIGINS` används bara för extra preview/custom domains.
- `PUBLIC_UPLOADS_ENABLED=false` gör att bilagor inte ligger öppet via `/uploads/`; använd autentiserad download-route.

## Pushnotiser / reminders

Om pushnotiser används krävs ett beständigt VAPID-nyckelpar. Byt inte nyckelparet efter att användare har aktiverat notiser, eftersom befintliga registreringar då slutar fungera.

Sätt i Railway:

```env
WEB_PUSH_PUBLIC_KEY=publik-vapid-nyckel
WEB_PUSH_PRIVATE_KEY=privat-vapid-nyckel
WEB_PUSH_CONTACT=https://din-appdomän.se
REMINDER_JOB_TOKEN=långt-slumpat-job-token
```

Spara samma `REMINDER_JOB_TOKEN` som en GitHub Actions-secret. Workflowen `Weekly push reminders` kör var femtonde minut på fredagar; backend skickar först när företagets påminnelsetid har passerat och loggar utskicket så att veckan inte skickas dubbelt. Vanlig admin/supervisor-trigger scannar bara det egna företaget.

## Railway backend

- [ ] `DATABASE_URL` pekar på rätt PostgreSQL-instans.
- [ ] `JWT_SECRET` är satt.
- [ ] `FRONTEND_URL` är satt.
- [ ] `ALLOW_PUBLIC_REGISTRATION=false` om appen är intern.
- [ ] Startkommando använder migration deploy, inte reset/seed.
- [ ] Kontrollera deploy logs efter start.
- [ ] Testa `/api/health` efter deploy.

## Cloudflare Pages frontend

- [ ] Root directory: `frontend`
- [ ] Build command: `npm ci && npm run build`
- [ ] Output directory: `dist`
- [ ] `VITE_API_URL` pekar på Railway-backendens `/api`.

Exempel:

```env
VITE_API_URL=https://din-railway-backend.up.railway.app/api
```

## Smoke test efter deploy

Testa med ett konto som inte är kritiskt:

- [ ] Logga in.
- [ ] Öppna dashboard.
- [ ] Skapa en tidrad.
- [ ] Kontrollera att tidraden syns i veckan.
- [ ] Testa attestflödet med admin/supervisor.
- [ ] Exportera en rapport.
- [ ] Ladda upp en tillåten bilaga, t.ex. PDF/JPG.
- [ ] Försök ladda upp otillåten filtyp och kontrollera att den blockeras.
- [ ] Kontrollera att publika registreringen är stängd om `ALLOW_PUBLIC_REGISTRATION=false`.

## Kodändringar som är säkra i live-läge

Normalt säkra:

- frontend/designändringar
- backendvalidering
- auth-/rollkontroller
- dokumentation
- dependency security patchar

Kräver extra plan:

- Prisma schemaändringar
- ändrade statusvärden/enums
- datamigreringar
- radering/permanent anonymisering
- byte av upload/storage-lösning

## Backup-rutin

Miniminivå:

- [ ] Aktivera Railway/Postgres backup/snapshot om tillgängligt.
- [ ] Ta manuell backup före större release.
- [ ] Spara datum, commit och vem som deployade.

## Snabb rollback

Om en koddeploy går fel men databasen inte migrerats:

1. Rulla tillbaka till tidigare deploy i Railway/Cloudflare.
2. Verifiera login och tidrapportering.
3. Skapa issue/anteckning om vad som gick fel.

Om en migration gått fel: stoppa och återställ från backup/stagingplan — improvisera inte mot live-databasen.
