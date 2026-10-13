import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('time write migration preserves legacy identity, hours and approvals and enforces immutable scoped receipts', async () => {
  const db = new PGlite();
  try {
    const root = new URL('../../prisma/migrations/', import.meta.url);
    const migration = '20261013190000_time_write_receipts';
    for (const entry of (await readdir(root)).filter(name => name < migration).sort()) {
      if (entry === 'migration_lock.toml') continue;
      await db.exec(await readFile(new URL(`${entry}/migration.sql`, root), 'utf8'));
    }
    await db.exec(`INSERT INTO "Company" (id,name,"updatedAt") VALUES ('a','TEST',now()),('b','TEST',now());
      INSERT INTO "User" (id,"companyId",email,password,name,"updatedAt") VALUES ('ua','a','a@test.invalid','TEST','TEST',now()),('ub','b','b@test.invalid','TEST','TEST',now());
      INSERT INTO "Activity" (id,"companyId",name,code,"updatedAt") VALUES ('act','a','TEST','SEM',now());
      INSERT INTO "TimeEntry" (id,"userId","activityId",date,hours,status,"updatedAt","offlineActorUserId","offlineLocalId","offlinePayloadHash") VALUES ('entry','ua','act','2026-10-05',7.25,'APPROVED',now(),'ua','original-key','original-hash');`);
    await db.exec(await readFile(new URL(`${migration}/migration.sql`, root), 'utf8'));
    const row: any = (await db.query('SELECT * FROM "TimeEntryWriteRequest"')).rows[0];
    assert.equal(row.requestKey, 'original-key'); assert.equal(row.payloadHash, 'original-hash'); assert.deepEqual(row.resultIds, ['entry']);
    assert.deepEqual((await db.query('SELECT hours,status,revision FROM "TimeEntry"')).rows, [{ hours: 7.25, status: 'APPROVED', revision: 1 }]);
    await assert.rejects(db.exec(`UPDATE "TimeEntryWriteRequest" SET "payloadHash"='changed'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "TimeEntryWriteRequest"`), /immutable/);
    await assert.rejects(db.exec(`INSERT INTO "TimeEntryWriteRequest" (id,"companyId","actorUserId","requestKey",operation,"payloadHash","resultIds") VALUES ('bad','a','ub','key','CREATE','hash',ARRAY['entry'])`), /foreign key/);
    await db.exec(`DELETE FROM "TimeEntry" WHERE id='entry'`);
    assert.equal((await db.query('SELECT * FROM "TimeEntryWriteRequest"')).rows.length, 1);
  } finally { await db.close(); }
});

test('incomplete-week migration keeps existing and new users opted out by default', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "User" (id TEXT PRIMARY KEY, role TEXT); INSERT INTO "User" VALUES ('old','ADMIN');`);
    await db.exec(await readFile(new URL('../../prisma/migrations/20261013200000_incomplete_week_approval/migration.sql', import.meta.url), 'utf8'));
    await db.exec(`INSERT INTO "User" (id,role) VALUES ('new','EMPLOYEE')`);
    assert.deepEqual((await db.query('SELECT * FROM "User" ORDER BY id')).rows, [
      { id: 'new', role: 'EMPLOYEE', allowIncompleteWeekApproval: false },
      { id: 'old', role: 'ADMIN', allowIncompleteWeekApproval: false },
    ]);
    await assert.rejects(db.exec(`UPDATE "User" SET "allowIncompleteWeekApproval"=NULL WHERE id='old'`), /not-null/);
  } finally { await db.close(); }
});
