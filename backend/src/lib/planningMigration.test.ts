import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('planning migration preserves history, starts empty and enforces tenant foreign keys and retry uniqueness', async () => {
  const db = new PGlite();
  try {
    const root = new URL('../../prisma/migrations/', import.meta.url);
    for (const entry of (await readdir(root, { withFileTypes: true })).filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) await db.exec(await readFile(new URL(`${entry.name}/migration.sql`, root), 'utf8'));
    assert.equal((await db.query('SELECT * FROM "PlanningBoard"')).rows.length, 0);
    await db.exec(`INSERT INTO "Company" (id,name,"updatedAt") VALUES ('a','Test A',now()),('b','Test B',now());
      INSERT INTO "User" (id,"companyId",email,password,name,"updatedAt") VALUES ('ua','a','a@test.invalid','TEST','Test',now()),('ub','b','b@test.invalid','TEST','Test',now());
      INSERT INTO "PlanningBoard" (id,"companyId",document,"updatedAt") VALUES ('pa','a','{}',now()),('pb','b','{}',now());
      INSERT INTO "PlanningComment" (id,"companyId","boardId","authorId",content,"requestKey") VALUES ('c','a','pa','ua','Tips','key');`);
    await assert.rejects(db.exec(`INSERT INTO "PlanningComment" (id,"companyId","boardId","authorId",content,"requestKey") VALUES ('bad','a','pb','ua','Tips','key2')`), /foreign key/);
    await assert.rejects(db.exec(`INSERT INTO "PlanningComment" (id,"companyId","boardId","authorId",content,"requestKey") VALUES ('bad','a','pa','ub','Tips','key2')`), /foreign key/);
    await assert.rejects(db.exec(`INSERT INTO "PlanningComment" (id,"companyId","boardId","authorId",content,"requestKey") VALUES ('bad','a','pa','ua','Tips','key')`), /unique constraint/);
    assert.ok((await db.query(`SELECT tablename FROM pg_tables WHERE tablename IN ('MaterialArticle','ProjectMaterial','SupplierInvoice','InventoryMovement')`)).rows.length === 4);
  } finally { await db.close(); }
});
