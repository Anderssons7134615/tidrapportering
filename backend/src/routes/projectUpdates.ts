import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';
import { requireRoles } from '../lib/authorization.js';
import {
  PROJECT_UPDATE_TYPES,
  createProjectUpdatePayloadHash,
  isProjectUpdatePreviewToken,
  normalizeProjectCode,
  normalizeProjectUpdateContent,
  type ProjectUpdateDraft,
  type ProjectUpdatePreviewToken,
} from '../lib/projectUpdatePreview.js';

const requireAdminOrSupervisor = requireRoles(['ADMIN', 'SUPERVISOR']);
const requireProjectWorkspaceViewer = requireRoles(
  ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'],
  'Lön och ekonomi använder rapporter med attesterad tid'
);

const projectUpdateBodySchema = z.object({
  type: z.enum(PROJECT_UPDATE_TYPES),
  content: z.string().min(1).max(5000),
  occurredAt: z.string().datetime().optional(),
});

const previewBodySchema = projectUpdateBodySchema.extend({
  projectCode: z.string().min(1).max(50),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

const commitBodySchema = z.object({
  previewToken: z.string().min(20),
});

const listQuerySchema = z.object({
  type: z.enum(PROJECT_UPDATE_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

class ProjectUpdateConflict extends Error {
  statusCode = 409;
}

type CommitDraft = ProjectUpdateDraft & {
  payloadHash: string;
};

function toPublicProjectUpdate<T extends {
  companyId: string;
  idempotencyKey: string;
  payloadHash: string;
}>(item: T) {
  const {
    companyId: _companyId,
    idempotencyKey: _idempotencyKey,
    payloadHash: _payloadHash,
    ...publicItem
  } = item;

  return publicItem;
}

function draftFromToken(token: ProjectUpdatePreviewToken): CommitDraft {
  const {
    scope: _scope,
    payloadHash,
    ...draft
  } = token;

  return { ...draft, payloadHash };
}

async function createProjectUpdate(
  draft: CommitDraft,
  options: { requireProjectVersion: boolean }
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.projectUpdate.findUnique({
        where: {
          companyId_source_idempotencyKey: {
            companyId: draft.companyId,
            source: draft.source,
            idempotencyKey: draft.idempotencyKey,
          },
        },
        include: {
          createdByUser: { select: { id: true, name: true } },
        },
      });

      if (existing) {
        if (existing.payloadHash !== draft.payloadHash) {
          throw new ProjectUpdateConflict('Samma idempotensnyckel har redan använts för en annan ändring');
        }
        return { item: toPublicProjectUpdate(existing), created: false };
      }

      const project = await tx.project.findFirst({
        where: {
          id: draft.projectId,
          companyId: draft.companyId,
          code: draft.projectCode,
          active: true,
        },
        select: {
          id: true,
          updatedAt: true,
        },
      });

      if (!project) {
        throw new ProjectUpdateConflict('Projektet finns inte längre, är arkiverat eller har bytt projektnummer');
      }

      if (options.requireProjectVersion && project.updatedAt.toISOString() !== draft.projectUpdatedAt) {
        throw new ProjectUpdateConflict('Projektet har ändrats efter förhandsvisningen. Förhandsvisa ändringen igen.');
      }

      const item = await tx.projectUpdate.create({
        data: {
          companyId: draft.companyId,
          projectId: draft.projectId,
          type: draft.type,
          content: draft.content,
          occurredAt: new Date(draft.occurredAt),
          source: draft.source,
          createdByUserId: draft.userId,
          idempotencyKey: draft.idempotencyKey,
          payloadHash: draft.payloadHash,
        },
        include: {
          createdByUser: { select: { id: true, name: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: draft.userId,
          action: 'CREATE',
          entityType: 'ProjectUpdate',
          entityId: item.id,
          newValue: JSON.stringify({
            projectId: draft.projectId,
            projectCode: draft.projectCode,
            type: draft.type,
            content: draft.content,
            occurredAt: draft.occurredAt,
            source: draft.source,
            idempotencyKey: draft.idempotencyKey,
          }),
        },
      });

      return { item: toPublicProjectUpdate(item), created: true };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.projectUpdate.findUnique({
        where: {
          companyId_source_idempotencyKey: {
            companyId: draft.companyId,
            source: draft.source,
            idempotencyKey: draft.idempotencyKey,
          },
        },
        include: {
          createdByUser: { select: { id: true, name: true } },
        },
      });

      if (existing?.payloadHash === draft.payloadHash) {
        return { item: toPublicProjectUpdate(existing), created: false };
      }
      throw new ProjectUpdateConflict('Samma idempotensnyckel har redan använts för en annan ändring');
    }
    throw error;
  }
}

const projectUpdateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/projects/:id/updates', {
    preHandler: [requireProjectWorkspaceViewer],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = listQuerySchema.parse(request.query);

    const project = await prisma.project.findFirst({
      where: { id, companyId: request.user.companyId },
      select: { id: true },
    });
    if (!project) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const updates = await prisma.projectUpdate.findMany({
      where: {
        projectId: id,
        companyId: request.user.companyId,
        ...(query.type ? { type: query.type } : {}),
      },
      include: {
        createdByUser: { select: { id: true, name: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: query.limit ?? 100,
    });

    return updates.map(toPublicProjectUpdate);
  });

  fastify.post('/projects/:id/updates', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = projectUpdateBodySchema.parse(request.body);
    const content = normalizeProjectUpdateContent(body.content);
    if (!content) {
      return reply.status(400).send({ error: 'Texten får inte vara tom' });
    }

    const project = await prisma.project.findFirst({
      where: {
        id,
        companyId: request.user.companyId,
        active: true,
      },
      select: {
        id: true,
        code: true,
        updatedAt: true,
      },
    });
    if (!project) {
      return reply.status(404).send({ error: 'Projekt hittades inte eller är arkiverat' });
    }

    const draft: ProjectUpdateDraft = {
      companyId: request.user.companyId,
      projectId: project.id,
      projectCode: project.code,
      projectUpdatedAt: project.updatedAt.toISOString(),
      userId: request.user.id,
      type: body.type,
      content,
      occurredAt: body.occurredAt ? new Date(body.occurredAt).toISOString() : new Date().toISOString(),
      source: 'TIDAPP',
      idempotencyKey: randomUUID(),
    };
    const result = await createProjectUpdate(
      { ...draft, payloadHash: createProjectUpdatePayloadHash(draft) },
      { requireProjectVersion: false }
    );

    return reply.status(201).send(result.item);
  });

  fastify.post('/project-updates/preview', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const body = previewBodySchema.parse(request.body);
    const projectCode = normalizeProjectCode(body.projectCode);
    const content = normalizeProjectUpdateContent(body.content);

    if (!content) {
      return reply.status(400).send({ error: 'Texten får inte vara tom' });
    }

    const project = await prisma.project.findFirst({
      where: {
        companyId: request.user.companyId,
        code: projectCode,
        active: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        updatedAt: true,
        customer: { select: { id: true, name: true } },
      },
    });

    if (!project) {
      return reply.status(404).send({
        error: `Inget aktivt projekt med exakt projektnummer ${projectCode} hittades`,
      });
    }

    const draft: ProjectUpdateDraft = {
      companyId: request.user.companyId,
      projectId: project.id,
      projectCode: project.code,
      projectUpdatedAt: project.updatedAt.toISOString(),
      userId: request.user.id,
      type: body.type,
      content,
      occurredAt: body.occurredAt ? new Date(body.occurredAt).toISOString() : new Date().toISOString(),
      source: 'CHATGPT',
      idempotencyKey: body.idempotencyKey || randomUUID(),
    };
    const payloadHash = createProjectUpdatePayloadHash(draft);
    const previewToken = (fastify.jwt.sign as unknown as (payload: ProjectUpdatePreviewToken, options: { expiresIn: string }) => string)({
      ...draft,
      scope: 'project-update-preview',
      payloadHash,
    } satisfies ProjectUpdatePreviewToken, { expiresIn: '10m' });

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        customer: project.customer,
      },
      update: {
        type: draft.type,
        content: draft.content,
        occurredAt: draft.occurredAt,
        source: draft.source,
        idempotencyKey: draft.idempotencyKey,
      },
      previewToken,
      expiresInSeconds: 600,
    };
  });

  fastify.post('/project-updates/commit', {
    preHandler: [requireAdminOrSupervisor],
  }, async (request, reply) => {
    const body = commitBodySchema.parse(request.body);
    let decoded: unknown;

    try {
      decoded = fastify.jwt.verify(body.previewToken);
    } catch {
      return reply.status(400).send({ error: 'Förhandsvisningen är ogiltig eller har gått ut' });
    }

    if (!isProjectUpdatePreviewToken(decoded)) {
      return reply.status(400).send({ error: 'Förhandsvisningen har fel format' });
    }
    if (decoded.companyId !== request.user.companyId || decoded.userId !== request.user.id) {
      return reply.status(403).send({ error: 'Förhandsvisningen tillhör en annan användare eller ett annat företag' });
    }

    const draft = draftFromToken(decoded);
    if (createProjectUpdatePayloadHash(draft) !== draft.payloadHash) {
      return reply.status(400).send({ error: 'Förhandsvisningens innehåll kunde inte verifieras' });
    }

    const result = await createProjectUpdate(draft, { requireProjectVersion: true });
    return reply.status(result.created ? 201 : 200).send({
      item: result.item,
      created: result.created,
    });
  });
};

export default projectUpdateRoutes;
