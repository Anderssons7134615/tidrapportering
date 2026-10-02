import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeProjectEconomy, getProjectMetrics } from './projectMetrics.js';
import { loadProjectEconomies } from './projectEconomy.js';

const project = { id: 'project-a', billingModel: 'HOURLY', budgetHours: 10, fixedPrice: null };
const approved = { hours: 4, billable: true, status: 'APPROVED', financialSnapshotCapturedAt: new Date(), approvedBillingRateSnapshot: 800, approvedHourlyCostSnapshot: 400 };
const material = { quantity: 2, purchasePrice: 100, unitPrice: 150 };

test('project economy separates work in progress from approved financial snapshots', () => {
  const value = summarizeProjectEconomy(project, [approved, { ...approved, hours: 6, status: 'DRAFT' }, { ...approved, hours: 2, status: 'REJECTED' }], [material]);
  assert.equal(value.reportedHours, 12);
  assert.equal(value.approvedHours, 4);
  assert.equal(value.unapprovedHours, 8);
  assert.equal(value.budgetUsagePercent, 120);
  assert.equal(value.revenue, 3500);
  assert.equal(value.laborCost, 1600);
  assert.equal(value.materialCost, 200);
  assert.equal(value.result, 1700);
});

test('missing snapshot costs never fall back to a changed employee price or become zero', () => {
  const value = summarizeProjectEconomy(project, [{ ...approved, approvedHourlyCostSnapshot: null, user: { hourlyCost: 100 } }], [material]);
  assert.equal(value.laborCost, null);
  assert.equal(value.result, null);
  assert.equal(value.marginPercent, null);
  assert.ok(value.warnings.includes('Timkostnad saknas'));
});

test('missing purchase and sales prices preserve independent unknown totals', () => {
  const missingPurchase = summarizeProjectEconomy(project, [approved], [{ ...material, purchasePrice: null }]);
  assert.equal(missingPurchase.materialCost, null);
  assert.equal(missingPurchase.revenue, 3500);
  assert.equal(missingPurchase.result, null);
  const missingSales = summarizeProjectEconomy(project, [approved], [{ ...material, unitPrice: null }]);
  assert.equal(missingSales.revenue, null);
  assert.equal(missingSales.result, null);
  assert.equal(missingSales.materialCost, 200);
});

test('missing hourly or fixed price is unknown, explicit zero is retained', () => {
  assert.equal(summarizeProjectEconomy(project, [{ ...approved, approvedBillingRateSnapshot: null }], []).revenue, null);
  assert.equal(summarizeProjectEconomy({ ...project, billingModel: 'FIXED' }, [approved], []).revenue, null);
  const zero = summarizeProjectEconomy({ ...project, billingModel: 'FIXED', fixedPrice: 0 }, [approved], []);
  assert.equal(zero.revenue, 0);
  assert.equal(zero.result, -1600);
  assert.equal(zero.marginPercent, null);
});

test('fixed price ignores material sales price but still requires cost basis', () => {
  const value = summarizeProjectEconomy({ ...project, billingModel: 'FIXED', fixedPrice: 5000 }, [approved], [{ ...material, unitPrice: null }]);
  assert.equal(value.revenue, 5000);
  assert.equal(value.result, 3200);
  assert.equal(value.warnings.length, 0);
});

test('bulk economy queries scope both source tables to company and approved project IDs', async () => {
  const scopes: unknown[] = [];
  const db = {
    timeEntry: { findMany: async ({ where }: any) => { scopes.push(where); return [{ ...approved, projectId: project.id }, { ...approved, projectId: 'other-project' }]; } },
    projectMaterial: { findMany: async ({ where }: any) => { scopes.push(where); return [{ ...material, projectId: project.id }, { ...material, projectId: 'other-project' }]; } },
  };
  const values = await loadProjectEconomies(db as any, 'company-a', [project]);
  assert.deepEqual(scopes, Array(2).fill({ projectId: { in: ['project-a'] }, project: { companyId: 'company-a' } }));
  assert.equal(values.size, 1);
  assert.equal(values.get(project.id)?.result, 1700);
});

test('detail metrics and portfolio use the same approved financial basis', async () => {
  const dated = { ...approved, date: new Date('2026-10-01'), createdAt: new Date('2026-10-01') };
  const entries = [dated, { ...dated, status: 'DRAFT', hours: 20 }];
  const db = { timeEntry: { findMany: async () => entries }, projectMaterial: { findMany: async () => [material] } };
  const metrics = await getProjectMetrics(db as any, { ...project, active: true, status: 'ONGOING' });
  const economy = summarizeProjectEconomy(project, entries, [material]);
  assert.equal(metrics.totalHours, 24);
  assert.equal(metrics.projectResult, economy.result);
  assert.equal(metrics.laborCost, economy.laborCost);
});
