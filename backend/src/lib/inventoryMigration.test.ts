import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('inventory migration starts empty, enforces company keys and immutable history', async () => {
  const db = new PGlite();
  try {
    const root = new URL('../../prisma/migrations/', import.meta.url);
    for (const entry of (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
      await db.exec(await readFile(new URL(`${entry.name}/migration.sql`, root), 'utf8'));
    }
    assert.equal((await db.query('SELECT * FROM "InventoryItem"')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM "InventoryMovement"')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM "MaterialArticle"')).rows.length, 0);
    await db.exec(`INSERT INTO "Company" (id,name,"updatedAt") VALUES ('a','Test A',now()),('b','Test B',now());
      INSERT INTO "User" (id,"companyId",email,password,name,"updatedAt") VALUES ('ua','a','a@test.invalid','TEST','Test',now()),('ub','b','b@test.invalid','TEST','Test',now());
      INSERT INTO "MaterialArticle" (id,"companyId",name,"updatedAt") VALUES ('aa','a','Test A',now()),('ab','b','Test B',now());
      INSERT INTO "InventoryItem" (id,"companyId","articleId",unit) VALUES ('ia','a','aa','st'),('ib','b','ab','st');`);
    await assert.rejects(db.exec(`INSERT INTO "InventoryItem" (id,"companyId","articleId",unit) VALUES ('bad','a','ab','st')`), /foreign key|unique constraint/);
    await db.exec(`INSERT INTO "InventoryMovement" (id,"companyId","itemId",kind,"deltaMilli","balanceAfterMilli","articleName",unit,note,"createdByUserId","requestKey","requestHash") VALUES ('m','a','ia','RECEIPT',1000,1000,'Test','st','','ua','key','hash')`);
    await assert.rejects(db.exec(`UPDATE "InventoryMovement" SET "deltaMilli"=2000 WHERE id='m'`), /append-only/);
    await assert.rejects(db.exec(`DELETE FROM "InventoryMovement" WHERE id='m'`), /append-only/);
    await assert.rejects(db.exec(`INSERT INTO "InventoryMovement" SELECT 'bad',"companyId",'ib',kind,"deltaMilli","balanceAfterMilli","articleName",unit,note,"createdAt","createdByUserId","projectId","sourceIssueId",'key2',"requestHash" FROM "InventoryMovement" WHERE id='m'`), /foreign key/);
    await assert.rejects(db.exec(`INSERT INTO "InventoryMovement" SELECT 'bad',"companyId","itemId",kind,-1,-1,"articleName",unit,note,"createdAt","createdByUserId","projectId","sourceIssueId",'key2',"requestHash" FROM "InventoryMovement" WHERE id='m'`), /check constraint/);
    await assert.rejects(db.exec(`INSERT INTO "InventoryMovement" SELECT 'bad',"companyId","itemId",kind,"deltaMilli","balanceAfterMilli","articleName",unit,note,"createdAt","createdByUserId","projectId","sourceIssueId","requestKey","requestHash" FROM "InventoryMovement" WHERE id='m'`), /unique constraint/);
  } finally { await db.close(); }
});
