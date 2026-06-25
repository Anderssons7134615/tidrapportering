# TidApp Stabilisering Runda 1 Implementation Plan

> **For Hermes:** Implement directly on branch `ai/stabilisering-runda-1` with small safe commits. Do not run destructive DB commands. Do not run `prisma migrate reset`, `prisma db push`, seed scripts against production, or any command that can wipe data.

**Goal:** Improve TidApp safety and production readiness without changing or deleting the live database data.

**Architecture:** Make low-risk code/config changes only: auth hardening, scoped reminders, safer uploads, frontend dependency security update, documentation checklist, and build verification. Avoid schema migrations in this round except package lock changes. Keep all database-preserving behavior intact.

**Tech Stack:** Fastify, Prisma, PostgreSQL, TypeScript, React/Vite, npm, GitHub.

---

## Non-negotiable data safety rules

1. Do **not** run any destructive Prisma/database command:
   - `prisma migrate reset`
   - `prisma db push`
   - `prisma db seed`
   - `npm run db:seed`
   - `npm run db:seed:safe` against production
   - manual SQL delete/drop/truncate
2. Allowed DB-related commands:
   - `prisma generate`
   - `tsc`
   - app build commands
   - read-only code inspection
3. This round should not require a DB migration.
4. If a later change needs schema migration, stop and make a separate migration plan first.

---

## Task 1: Create safety branch

**Objective:** Work separately from `master`.

**Files:** none.

**Steps:**

```bash
cd C:/Users/Rick/OneDrive/Appbygge/tidrapportering
git status --short
git fetch origin
git checkout master
git pull --ff-only origin master
git checkout -b ai/stabilisering-runda-1
```

**Verification:**

```bash
git branch --show-current
```

Expected: `ai/stabilisering-runda-1`.

---

## Task 2: Harden auth role freshness

**Objective:** Ensure role changes in DB take effect immediately instead of trusting stale JWT roles for up to 7 days.

**Files:**
- Modify: `backend/src/index.ts`

**Implementation:**

In `fastify.decorate('authenticate', ...)`, change the DB select from:

```ts
select: { id: true, active: true, companyId: true },
```

to include current auth fields:

```ts
select: { id: true, email: true, role: true, active: true, companyId: true },
```

After validating the user, overwrite the JWT-derived request user with the database-backed role/email/company:

```ts
request.user = {
  ...request.user,
  id: user.id,
  email: user.email,
  role: user.role,
  companyId: user.companyId,
};
```

**Validation:**

```bash
npm --prefix backend run build
```

Expected: TypeScript build passes.

---

## Task 3: Add public registration switch

**Objective:** Allow production to disable open `/api/auth/register` without removing the feature from local/dev.

**Files:**
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/.env.example`
- Modify: `frontend/src/App.tsx` or `frontend/src/pages/Login.tsx` only if needed to hide link via env; otherwise backend-only is acceptable.

**Backend implementation:**

At the start of the register route before parsing/creating anything:

```ts
const publicRegistrationEnabled = process.env.ALLOW_PUBLIC_REGISTRATION === 'true' || process.env.NODE_ENV !== 'production';
if (!publicRegistrationEnabled) {
  return reply.status(403).send({ error: 'Registrering är avstängd. Kontakta administratör.' });
}
```

**Env example:**

Add:

```env
# Sätt till true om publika företag/admin-registreringar ska tillåtas i produktion.
ALLOW_PUBLIC_REGISTRATION=false
```

**Validation:**

```bash
npm --prefix backend run build
```

---

## Task 4: Scope reminders by company for JWT-triggered runs

**Objective:** Prevent an admin/supervisor from triggering reminders for other companies.

**Files:**
- Modify: `backend/src/routes/reminders.ts`

**Implementation:**

Build the employee `where` condition depending on auth mode:

```ts
const employeeWhere = {
  active: true,
  role: 'EMPLOYEE',
  ...(isJobTokenAuth ? {} : { companyId: request.user.companyId }),
};
```

Use it in `prisma.user.findMany({ where: employeeWhere, ... })`.

Add response field if useful:

```ts
scope: isJobTokenAuth ? 'all-companies' : request.user.companyId,
```

**Validation:**

```bash
npm --prefix backend run build
```

---

## Task 5: Make uploads safer, authenticated and record real file size

**Objective:** Stop accepting unknown file types as `.bin`, record actual file size, and avoid public unauthenticated `/uploads` access by default.

**Files:**
- Modify: `backend/src/routes/timeEntries.ts`

**Implementation details:**

1. Change `getSafeExtension` to return `string | null`.
2. Return `null` if neither the extension nor mimetype is allowed.
3. In upload route, if `safeExt` is null, return `400` before writing file.
4. Count bytes while streaming, e.g. with a `Transform` stream.
5. Save `size: bytesWritten` instead of `0`.
6. In `backend/src/index.ts`, keep public `/uploads` disabled unless `PUBLIC_UPLOADS_ENABLED=true`.
7. Add authenticated download route `GET /api/time-entries/:id/attachments/:attachmentId/download` with company/role/owner checks.

**Avoid:** Do not change database schema.

**Validation:**

```bash
npm --prefix backend run build
```

---

## Task 6: Put week approval/reject/unlock writes in transactions

**Objective:** Prevent partial state if one DB operation succeeds and another fails.

**Files:**
- Modify: `backend/src/routes/weekLocks.ts`

**Implementation:**

Wrap these multi-write handlers in `prisma.$transaction`:

- `POST /:id/approve`
- `POST /:id/reject`
- `POST /:id/unlock`

Keep validation checks outside transaction where practical, but all updates + audit log should be inside one transaction.

**Validation:**

```bash
npm --prefix backend run build
```

---

## Task 7: Fix frontend audit vulnerability

**Objective:** Update React Router dependency safely.

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Implementation:**

Run:

```bash
npm --prefix frontend audit fix
```

If audit fix changes too much, instead update only `react-router-dom` to a patched v6 version and run `npm --prefix frontend install`.

**Validation:**

```bash
npm --prefix frontend audit --omit=dev
npm --prefix frontend run build
```

Expected: no production vulnerabilities or reduced known audit issue; build passes.

---

## Task 8: Add production checklist

**Objective:** Document safe production setup and database protection rules.

**Files:**
- Create: `PRODUCTION_CHECKLIST.md`

**Content should include:**

- Required env vars:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `FRONTEND_URL`
  - `EXTRA_CORS_ORIGINS`
  - `UPLOAD_DIR`
  - `ALLOW_PUBLIC_REGISTRATION=false`
  - `REMINDER_JOB_TOKEN`
  - VAPID vars if push is used
- Explicit warning: never run reset/seed commands against live DB.
- Backup checklist before migrations.
- Deploy checklist for Railway/Cloudflare.
- Smoke test checklist:
  - login
  - create time entry
  - week view
  - approval
  - reports
  - upload attachment

---

## Task 9: Full verification

**Objective:** Prove the app still builds and no obvious audit/security regressions exist.

**Commands:**

```bash
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend audit --omit=dev
npm --prefix frontend audit --omit=dev || true
git status --short
git diff --stat
```

**Expected:**

- backend build passes
- frontend build passes
- backend audit clean
- frontend audit clean or documented if upstream limitation remains
- no unwanted files such as `dist/` committed

---

## Task 10: Commit and push

**Objective:** Save changes in GitHub without touching master directly.

**Commands:**

```bash
git add backend/src/index.ts backend/src/routes/auth.ts backend/.env.example backend/src/routes/reminders.ts backend/src/routes/timeEntries.ts backend/src/routes/weekLocks.ts frontend/package.json frontend/package-lock.json PRODUCTION_CHECKLIST.md .hermes/plans/2026-06-25_135322-stabilisering-runda-1.md
git commit -m "fix: harden production safety checks"
git push -u origin ai/stabilisering-runda-1
```

**Optional PR:** create PR into `master` after Rick confirms.

---

## Rollback plan

If anything breaks before merge:

```bash
git checkout master
git branch -D ai/stabilisering-runda-1
```

If pushed but not merged, close/delete branch. Since no DB migrations are included, rollback is code-only.
