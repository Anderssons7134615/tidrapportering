import type { Prisma, PrismaClient } from '@prisma/client';

type PrismaLike = Prisma.TransactionClient | PrismaClient;

export type ObsidianSyncInput = {
  companyId: string;
  projectId?: string | null;
  entityType: 'Project' | 'TimeEntry' | 'ProjectMaterial' | string;
  entityId?: string | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SYNC' | 'INVOICE' | 'STATUS' | string;
  eventType: 'PROJECT_CHANGED' | 'PROJECT_DELETED' | 'TIME_ENTRY_CHANGED' | 'MATERIAL_CHANGED' | string;
  payload?: Prisma.InputJsonValue;
};

export async function enqueueObsidianSyncEvent(tx: PrismaLike, input: ObsidianSyncInput) {
  return tx.obsidianSyncEvent.create({
    data: {
      companyId: input.companyId,
      projectId: input.projectId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      eventType: input.eventType,
      payload: input.payload ?? undefined,
    },
  });
}

export async function enqueueProjectChanged(
  tx: PrismaLike,
  input: Omit<ObsidianSyncInput, 'eventType' | 'entityType'> & { entityType?: string }
) {
  return enqueueObsidianSyncEvent(tx, {
    ...input,
    entityType: input.entityType ?? 'Project',
    eventType: 'PROJECT_CHANGED',
  });
}

export async function enqueueTimeEntryChanged(
  tx: PrismaLike,
  input: Omit<ObsidianSyncInput, 'eventType' | 'entityType'> & { entityType?: string }
) {
  if (!input.projectId) return null;

  return enqueueObsidianSyncEvent(tx, {
    ...input,
    entityType: input.entityType ?? 'TimeEntry',
    eventType: 'TIME_ENTRY_CHANGED',
  });
}

export async function enqueueMaterialChanged(
  tx: PrismaLike,
  input: Omit<ObsidianSyncInput, 'eventType' | 'entityType'> & { entityType?: string }
) {
  return enqueueObsidianSyncEvent(tx, {
    ...input,
    entityType: input.entityType ?? 'ProjectMaterial',
    eventType: 'MATERIAL_CHANGED',
  });
}
