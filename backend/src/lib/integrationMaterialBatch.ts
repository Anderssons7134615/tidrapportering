import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseDateOnly } from './dateOnly.js';
import { enqueueMaterialChanged } from './obsidianSync.js';
import type { IntegrationScope } from './integrationAuth.js';

const dateOnlyStringSchema = z.string().refine((value) => parseDateOnly(value) !== null, {
  message: 'Datum måste anges som ett giltigt YYYY-MM-DD',
});

const materialBatchRowSchema = z.object({
  articleId: z.string().uuid(),
  quantity: z.number().finite().positive().max(1_000_000),
  date: dateOnlyStringSchema,
  note: z.string().trim().max(500).optional().nullable()
    .transform((value) => value || null),
}).strict();

export const materialBatchBodySchema = z.object({
  projectCode: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9._-]+$/),
  rows: z.array(materialBatchRowSchema).min(1).max(50),
}).strict();

export type MaterialBatchBody = z.infer<typeof materialBatchBodySchema>;

export function createMaterialBatchPayloadHash(body: MaterialBatchBody): string {
  return createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
}

export function parseIdempotencyKey(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(value)) {
    throw new Error('IDEMPOTENCY_KEY_INVALID');
  }
  return value;
}

export class IntegrationMaterialError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

type PrismaLike = any;

export async function validateMaterialBatch(
  db: PrismaLike,
  scope: IntegrationScope,
  body: MaterialBatchBody,
) {
  const project = await db.project.findFirst({
    where: { companyId: scope.companyId, code: body.projectCode, active: true },
    select: { id: true, code: true, name: true, status: true },
  });
  if (!project) {
    throw new IntegrationMaterialError('PROJECT_NOT_FOUND', 'Projekt hittades inte', 404);
  }
  if (project.status !== 'ONGOING') {
    throw new IntegrationMaterialError('PROJECT_NOT_ONGOING', 'Projektet är inte pågående', 409);
  }

  const projectAccess = await db.integrationProjectAccess.findUnique({
    where: {
      integrationAccessKeyId_projectId: {
        integrationAccessKeyId: scope.id,
        projectId: project.id,
      },
    },
    select: { projectId: true },
  });
  if (!projectAccess) {
    throw new IntegrationMaterialError('PROJECT_NOT_ALLOWED', 'Integrationsnyckeln saknar åtkomst till projektet', 403);
  }

  const articleIds = [...new Set(body.rows.map((row) => row.articleId))];
  const articles = await db.materialArticle.findMany({
    where: {
      id: { in: articleIds },
      companyId: scope.companyId,
      active: true,
      employeeVisible: true,
    },
    select: {
      id: true,
      name: true,
      articleNumber: true,
      unit: true,
      purchasePrice: true,
      defaultUnitPrice: true,
    },
  });
  const articlesById = new Map<string, any>(articles.map((article: any) => [article.id, article]));
  const missingArticleId = articleIds.find((articleId) => !articlesById.has(articleId));
  if (missingArticleId) {
    throw new IntegrationMaterialError('ARTICLE_NOT_FOUND', 'Materialartikeln hittades inte eller kan inte väljas', 404);
  }

  return {
    valid: true as const,
    project,
    rows: body.rows.map((row, index) => {
      const article = articlesById.get(row.articleId)!;
      return {
        index,
        article,
        quantity: row.quantity,
        date: row.date,
        note: row.note ?? null,
      };
    }),
  };
}

function publicOperation(operation: any, created: boolean, replayed: boolean) {
  const materials = [...operation.materials]
    .sort((a, b) => (a.integrationRowIndex ?? 0) - (b.integrationRowIndex ?? 0));
  return {
    operationId: operation.id,
    idempotencyKey: operation.idempotencyKey,
    status: operation.status,
    created,
    replayed,
    project: operation.project,
    materialIds: materials.map((material) => material.id),
    materials: materials.map((material) => ({
      id: material.id,
      articleId: material.articleId,
      articleName: material.articleName,
      articleNumber: material.articleNumber,
      unit: material.unit,
      quantity: material.quantity,
      date: material.date,
      note: material.note,
      createdAt: material.createdAt,
    })),
  };
}

const operationInclude = {
  project: { select: { id: true, code: true, name: true } },
  materials: {
    select: {
      id: true,
      articleId: true,
      articleName: true,
      articleNumber: true,
      unit: true,
      quantity: true,
      date: true,
      note: true,
      createdAt: true,
      integrationRowIndex: true,
    },
  },
} as const;

async function findOperation(db: PrismaLike, scope: IntegrationScope, idempotencyKey: string) {
  return db.integrationMaterialOperation.findUnique({
    where: {
      integrationAccessKeyId_idempotencyKey: {
        integrationAccessKeyId: scope.id,
        idempotencyKey,
      },
    },
    include: operationInclude,
  });
}

export async function createMaterialBatch(
  db: PrismaLike,
  scope: IntegrationScope,
  body: MaterialBatchBody,
  idempotencyKey: string,
) {
  const payloadHash = createMaterialBatchPayloadHash(body);
  const existing = await findOperation(db, scope, idempotencyKey);
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      throw new IntegrationMaterialError('IDEMPOTENCY_CONFLICT', 'Idempotensnyckeln har redan använts för annat innehåll', 409);
    }
    return publicOperation(existing, false, true);
  }

  try {
    const operation = await db.$transaction(async (tx: PrismaLike) => {
      const validation = await validateMaterialBatch(tx, scope, body);
      const createdOperation = await tx.integrationMaterialOperation.create({
        data: {
          companyId: scope.companyId,
          integrationAccessKeyId: scope.id,
          projectId: validation.project.id,
          idempotencyKey,
          payloadHash,
          rowCount: validation.rows.length,
          status: 'COMPLETED',
        },
        select: { id: true },
      });

      for (const row of validation.rows) {
        const material = await tx.projectMaterial.create({
          data: {
            projectId: validation.project.id,
            articleId: row.article.id,
            createdByUserId: null,
            articleName: row.article.name,
            articleNumber: row.article.articleNumber,
            unit: row.article.unit,
            purchasePrice: row.article.purchasePrice,
            unitPrice: row.article.defaultUnitPrice,
            quantity: row.quantity,
            date: parseDateOnly(row.date)!,
            note: row.note,
            integrationOperationId: createdOperation.id,
            integrationRowIndex: row.index,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: null,
            action: 'CREATE',
            entityType: 'ProjectMaterial',
            entityId: material.id,
            newValue: JSON.stringify({
              source: 'HERMES_INTEGRATION',
              integrationAccessKeyId: scope.id,
              operationId: createdOperation.id,
              projectId: validation.project.id,
              projectCode: validation.project.code,
              articleId: row.article.id,
              articleName: row.article.name,
              quantity: row.quantity,
              unit: row.article.unit,
              date: row.date,
            }),
          },
        });
        await enqueueMaterialChanged(tx, {
          companyId: scope.companyId,
          projectId: validation.project.id,
          entityId: material.id,
          action: 'CREATE',
          payload: {
            source: 'HERMES_INTEGRATION',
            operationId: createdOperation.id,
            articleName: row.article.name,
            quantity: row.quantity,
            unit: row.article.unit,
          },
        });
      }

      return tx.integrationMaterialOperation.findUniqueOrThrow({
        where: { id: createdOperation.id },
        include: operationInclude,
      });
    });
    return publicOperation(operation, true, false);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      const raced = await findOperation(db, scope, idempotencyKey);
      if (raced?.payloadHash === payloadHash) return publicOperation(raced, false, true);
      throw new IntegrationMaterialError('IDEMPOTENCY_CONFLICT', 'Idempotensnyckeln har redan använts för annat innehåll', 409);
    }
    throw error;
  }
}

export async function getMaterialBatchStatus(
  db: PrismaLike,
  scope: IntegrationScope,
  idempotencyKey: string,
) {
  const operation = await findOperation(db, scope, idempotencyKey);
  if (!operation) {
    throw new IntegrationMaterialError('OPERATION_NOT_FOUND', 'Materialoperationen hittades inte', 404);
  }
  return publicOperation(operation, false, true);
}
