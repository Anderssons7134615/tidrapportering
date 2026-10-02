import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('alla migrationer fungerar på tom PostgreSQL och fakturor behåller företagsgränser och transaktioner', async () => {
  const db = new PGlite();
  try {
    const root = new URL('../../prisma/migrations/', import.meta.url);
    for (const entry of (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await db.exec(await readFile(new URL(`${entry.name}/migration.sql`, root), 'utf8'));
    }
    await db.exec(`INSERT INTO "Company" (id,name,"updatedAt") VALUES ('a','TEST A',now()),('b','TEST B',now());
      INSERT INTO "User" (id,"companyId",email,password,name,"updatedAt") VALUES ('ua','a','a@example.invalid','TEST','Test',now()),('ub','b','b@example.invalid','TEST','Test',now());
      INSERT INTO "Project" (id,"companyId",name,code,"updatedAt") VALUES ('pa','a','TEST A','A',now()),('pb','b','TEST B','B',now());
      INSERT INTO "SupplierInvoice" (id,"companyId","createdByUserId","updatedAt") VALUES ('ia','a','ua',now()),('ib','b','ub',now());`);
    await assert.rejects(db.exec(`INSERT INTO "SupplierInvoice" (id,"companyId","createdByUserId","updatedAt") VALUES ('bad','a','ub',now())`), /foreign key/);
    await assert.rejects(db.exec(`INSERT INTO "SupplierInvoiceAllocation" (id,"companyId","invoiceId","projectId","netOre") VALUES ('bad','a','ib','pa',1)`), /foreign key/);
    await assert.rejects(db.exec(`INSERT INTO "SupplierInvoiceAllocation" (id,"companyId","invoiceId","projectId","netOre") VALUES ('bad','a','ia','pb',1)`), /foreign key/);
    await db.exec(`INSERT INTO "SupplierInvoiceDocument" (id,"companyId","invoiceId","originalName","byteSize",sha256,content) VALUES ('doc','a','ia','test.pdf',5,repeat('a',64),decode('255044462d','hex'))`);
    await assert.rejects(db.exec(`INSERT INTO "SupplierInvoiceDocument" (id,"companyId","invoiceId","originalName","byteSize",sha256,content) VALUES ('bad','b','ia','test.pdf',5,repeat('b',64),decode('255044462d','hex'))`), /foreign key/);
    await assert.rejects(db.exec(`UPDATE "SupplierInvoiceDocument" SET "byteSize" = 6 WHERE id='doc'`), /check constraint/);
    await assert.rejects(db.exec(`UPDATE "SupplierInvoice" SET status='CONFIRMED' WHERE id='ia'`), /check constraint/);
    await assert.rejects(db.exec(`UPDATE "SupplierInvoice" SET currency='EUR' WHERE id='ia'`), /check constraint/);
    await assert.rejects(db.exec(`UPDATE "SupplierInvoice" SET "netOre"=-1 WHERE id='ia'`), /check constraint/);
    await db.exec(`UPDATE "SupplierInvoice" SET "supplierName"='TEST',"supplierKey"='5560000000',"supplierOrgNumber"='5560000000',"invoiceNumber"='1',"numberKey"='1',"issueDate"='2026-10-02',"netOre"=100,"vatOre"=25,"grossOre"=125,"confirmedByUserId"='ua',"confirmedAt"=now(),status='CONFIRMED' WHERE id='ia'`);
    await assert.rejects(db.exec(`UPDATE "SupplierInvoice" SET "grossOre"=126 WHERE id='ia'`), /check constraint/);
    await db.exec(`INSERT INTO "SupplierInvoice" (id,"companyId","createdByUserId","updatedAt") VALUES ('ia2','a','ua',now())`);
    await assert.rejects(db.exec(`UPDATE "SupplierInvoice" SET "supplierKey"='5560000000',"numberKey"='1' WHERE id='ia2'`), /unique constraint/);
    await assert.rejects(db.exec(`INSERT INTO "SupplierInvoiceDocument" (id,"companyId","invoiceId","originalName","byteSize",sha256,content) VALUES ('dup','a','ia2','test.pdf',5,repeat('a',64),decode('255044462d','hex'))`), /unique constraint/);
    await db.exec(`UPDATE "SupplierInvoice" SET "supplierKey"='5560000000',"numberKey"='1' WHERE id='ib'`);
    await assert.rejects(db.transaction(async (tx) => {
      await tx.exec(`UPDATE "SupplierInvoice" SET revision=revision+1 WHERE id='ia'; INSERT INTO "SupplierInvoiceAllocation" (id,"companyId","invoiceId","projectId","netOre") VALUES ('allocation','a','ia','pa',100)`);
      throw new Error('audit failed');
    }), /audit failed/);
    assert.equal((await db.query<{revision:number}>(`SELECT revision FROM "SupplierInvoice" WHERE id='ia'`)).rows[0].revision, 1);
    assert.equal((await db.query(`SELECT id FROM "SupplierInvoiceAllocation"`)).rows.length, 0);
    assert.equal((await db.query(`UPDATE "SupplierInvoice" SET revision=revision+1 WHERE id='ia' AND revision=1 RETURNING id`)).rows.length, 1);
    assert.equal((await db.query(`UPDATE "SupplierInvoice" SET revision=revision+1 WHERE id='ia' AND revision=1 RETURNING id`)).rows.length, 0);
    await assert.rejects(db.exec(`UPDATE "SupplierInvoice" SET status='VOID' WHERE id='ia'`), /check constraint/);
    await db.exec(`UPDATE "SupplierInvoice" SET status='VOID', "supplierKey"=NULL, "numberKey"=NULL WHERE id='ia'; UPDATE "SupplierInvoice" SET "supplierKey"='5560000000',"numberKey"='1' WHERE id='ia2'`);
    assert.equal((await db.query(`SELECT id FROM "SupplierInvoiceDocument" WHERE "invoiceId"='ia'`)).rows.length, 1);
  } finally { await db.close(); }
});
