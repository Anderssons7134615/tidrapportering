import { createHash } from 'node:crypto';
import { z } from 'zod';
import { enqueueProjectChanged } from './obsidianSync.js';
import { getNextProjectCodeFromCodes } from './projectCode.js';
import type { IntegrationScope } from './integrationAuth.js';

export const projectCreateBodySchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  site: z.string().trim().min(1).max(160).optional().nullable().transform((value) => value || null),
}).strict();

export type ProjectCreateBody = z.infer<typeof projectCreateBodySchema>;

export function createProjectCreatePayloadHash(body: ProjectCreateBody): string {
  return createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
}

export class IntegrationProjectCreateError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

type PrismaLike = any;

const operationInclude = {
  project: {
    select: {
      id: true,
      code: true,
      name: true,
      site: true,
      status: true,
      active: true,
      customer: { select: { id: true, name: true } },
    },
  },
} as const;

async function findOperation(db: PrismaLike, scope: IntegrationScope, idempotencyKey: string) {
  return db.integrationProjectCreateOperation.findUnique({
    where: {
      integrationAccessKeyId_idempotencyKey: {
        integrationAccessKeyId: scope.id,
        idempotencyKey,
      },
    },
    include: operationInclude,
  });
}

function publicOperation(operation: any, created: boolean, replayed: boolean) {
  return {
    operationId: operation.id,
    idempotencyKey: operation.idempotencyKey,
    status: operation.status,
    created,
    replayed,
    project: operation.project,
  };
}

export async function validateProjectCreate(
  db: PrismaLike,
  scope: IntegrationScope,
  body: ProjectCreateBody,
) {
  const customer = await db.customer.findFirst({
    where: { id: body.customerId, companyId: scope.companyId, active: true },
    select: { id: true, name: true },
  });
  if (!customer) {
    throw new IntegrationProjectCreateError('CUSTOMER_NOT_FOUND', 'Kunden hittades inte eller kan inte väljas', 404);
  }
  return { customer, body };
}

export async function createProjectFromIntegration(
  db: PrismaLike,
  scope: IntegrationScope,
  body: ProjectCreateBody,
  idempotencyKey: string,
) {
  const payloadHash = createProjectCreatePayloadHash(body);
  const existing = await findOperation(db, scope, idempotencyKey);
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      throw new IntegrationProjectCreateError('IDEMPOTENCY_CONFLICT', 'Idempotensnyckeln har redan använts för annat innehåll', 409);
    }
    return publicOperation(existing, false, true);
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const operation = await db.$transaction(async (tx: PrismaLike) => {
        const validation = await validateProjectCreate(tx, scope, body);
        const codes = await tx.project.findMany({
          where: { companyId: scope.companyId },
          select: { code: true },
        });
        const project = await tx.project.create({
          data: {
            companyId: scope.companyId,
            customerId: validation.customer.id,
            name: validation.body.name,
            site: validation.body.site,
            code: getNextProjectCodeFromCodes(codes.map((item: { code: string }) => item.code)),
            status: 'PLANNED',
            employeeCanSeeResults: false,
          },
          select: { id: true, code: true, name: true },
        });
        const createdOperation = await tx.integrationProjectCreateOperation.create({
          data: {
            companyId: scope.companyId,
            integrationAccessKeyId: scope.id,
            projectId: project.id,
            idempotencyKey,
            payloadHash,
            status: 'COMPLETED',
          },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            userId: null,
            action: 'CREATE',
            entityType: 'Project',
            entityId: project.id,
            newValue: JSON.stringify({
              source: 'HERMES_INTEGRATION',
              integrationAccessKeyId: scope.id,
              operationId: createdOperation.id,
              code: project.code,
              name: project.name,
              customerId: validation.customer.id,
            }),
          },
        });
        await enqueueProjectChanged(tx, {
          companyId: scope.companyId,
          projectId: project.id,
          entityId: project.id,
          action: 'CREATE',
          payload: {
            source: 'HERMES_INTEGRATION',
            operationId: createdOperation.id,
            code: project.code,
            name: project.name,
            customerId: validation.customer.id,
          },
        });
        return tx.integrationProjectCreateOperation.findUniqueOrThrow({
          where: { id: createdOperation.id },
          include: operationInclude,
        });
      });
      return publicOperation(operation, true, false);
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const raced = await findOperation(db, scope, idempotencyKey);
      if (raced) {
        if (raced.payloadHash !== payloadHash) {
          throw new IntegrationProjectCreateError('IDEMPOTENCY_CONFLICT', 'Idempotensnyckeln har redan använts för annat innehåll', 409);
        }
        return publicOperation(raced, false, true);
      }
    }
  }
  throw new IntegrationProjectCreateError('PROJECT_CODE_RETRY_EXHAUSTED', 'Kunde inte skapa ett unikt projektnummer', 409);
}

export async function getProjectCreateStatus(
  db: PrismaLike,
  scope: IntegrationScope,
  idempotencyKey: string,
) {
  const operation = await findOperation(db, scope, idempotencyKey);
  if (!operation) {
    throw new IntegrationProjectCreateError('OPERATION_NOT_FOUND', 'Projektoperationen hittades inte', 404);
  }
  return publicOperation(operation, false, true);
}
