import type { Prisma, PrismaClient } from '@prisma/client';

/** Only direct project purchases belong here; warehouse purchases are costed on issue. */
export async function loadProjectPurchaseCosts(db: PrismaClient, companyId: string, projectIds: string[], issueDate?: Prisma.DateTimeFilter) {
  if (!projectIds.length) return new Map<string, number>();
  const rows = await db.supplierInvoiceAllocation.groupBy({
    by: ['projectId'],
    where: {
      companyId, projectId: { in: projectIds }, project: { companyId },
      invoice: { companyId, status: 'CONFIRMED', ...(issueDate ? { issueDate } : {}) },
    },
    _sum: { netOre: true },
  });
  return new Map(rows.map((row) => [row.projectId, row._sum.netOre ?? 0]));
}
