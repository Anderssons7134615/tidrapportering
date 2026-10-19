import type { PrismaClient } from '@prisma/client';
import { summarizeProjectEconomy } from './projectMetrics.js';
import { loadProjectPurchaseCosts } from './projectPurchaseCosts.js';

type ProjectInput = { id: string; billingModel?: string | null; fixedPrice?: number | null; budgetHours?: number | null };

export async function loadProjectEconomies(db: PrismaClient, companyId: string, projects: ProjectInput[]) {
  if (!projects.length) return new Map<string, ReturnType<typeof summarizeProjectEconomy> & { confirmedPurchaseNetOre: number }>();
  const where = { projectId: { in: projects.map((project) => project.id) }, project: { companyId } };
  const [entries, materials, purchases] = await Promise.all([
    db.timeEntry.findMany({ where, select: {
      projectId: true, hours: true, status: true, billable: true,
      financialSnapshotCapturedAt: true, approvedHourlyCostSnapshot: true, approvedBillingRateSnapshot: true,
      user: { select: { hourlyCost: true } }, activity: { select: { rateOverride: true } },
      project: { select: { defaultRate: true, customer: { select: { defaultRate: true } } } },
    } }),
    db.projectMaterial.findMany({ where, select: { projectId: true, quantity: true, purchasePrice: true, unitPrice: true, inventoryMovementId: true } }),
    loadProjectPurchaseCosts(db, companyId, projects.map((project) => project.id)),
  ]);
  const entriesByProject = new Map<string, typeof entries>();
  const materialsByProject = new Map<string, typeof materials>();
  for (const entry of entries) {
    if (!entry.projectId) continue;
    const bucket = entriesByProject.get(entry.projectId) || [];
    bucket.push(entry);
    entriesByProject.set(entry.projectId, bucket);
  }
  for (const material of materials) {
    const bucket = materialsByProject.get(material.projectId) || [];
    bucket.push(material);
    materialsByProject.set(material.projectId, bucket);
  }
  return new Map(projects.map((project) => [project.id,
    { ...summarizeProjectEconomy(project, entriesByProject.get(project.id) || [], materialsByProject.get(project.id) || [], purchases.get(project.id) ?? 0), confirmedPurchaseNetOre: purchases.get(project.id) ?? 0 },
  ]));
}
