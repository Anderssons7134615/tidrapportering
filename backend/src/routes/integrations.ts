import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';
import {
  authenticateIntegrationKey,
  extractIntegrationKey,
  type IntegrationPermission,
  type IntegrationScope,
} from '../lib/integrationAuth.js';
import {
  createMaterialBatch,
  getMaterialBatchStatus,
  IntegrationMaterialError,
  materialBatchBodySchema,
  parseIdempotencyKey,
  validateMaterialBatch,
} from '../lib/integrationMaterialBatch.js';
import {
  createProjectFromIntegration,
  getProjectCreateStatus,
  IntegrationProjectCreateError,
  projectCreateBodySchema,
  validateProjectCreate,
} from '../lib/integrationProjectCreate.js';

declare module 'fastify' {
  interface FastifyRequest {
    integrationScope?: IntegrationScope;
  }
}

const projectCodeQuerySchema = z.object({
  code: z.string().trim().min(1).max(50),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
}).refine(({ from, to }) => !from || !to || from <= to, {
  message: 'from får inte vara efter to',
});

async function authenticateIntegration(request: FastifyRequest) {
  const scope = await authenticateIntegrationKey(
    {
      findByHash: (keyHash) => prisma.integrationAccessKey.findFirst({
        where: { keyHash },
        select: {
          id: true,
          companyId: true,
          active: true,
          permission: true,
          keyHash: true,
          revokedAt: true,
        },
      }),
    },
    extractIntegrationKey(request.headers),
  );
  if (!scope) return null;
  request.integrationScope = scope;
  return scope;
}

function requireIntegrationPermission(permission: IntegrationPermission) {
  return async (request: FastifyRequest, reply: any) => {
    if (request.integrationScope?.permission !== permission) {
      return reply.status(403).send({
        error: 'Integrationsnyckeln saknar behörighet för åtgärden',
        code: 'INTEGRATION_PERMISSION_DENIED',
      });
    }
  };
}

function sendIntegrationError(error: unknown, reply: any) {
  if (error instanceof IntegrationMaterialError) {
    return reply.status(error.statusCode).send({ error: error.message, code: error.code });
  }
  if (error instanceof z.ZodError) {
    return reply.status(400).send({ error: 'Ogiltig data', code: 'VALIDATION_ERROR', details: error.errors });
  }
  if (error instanceof IntegrationProjectCreateError) {
    return reply.status(error.statusCode).send({ error: error.message, code: error.code });
  }
  if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_INVALID') {
    return reply.status(400).send({ error: 'Idempotency-Key saknas eller har ogiltigt format', code: 'IDEMPOTENCY_KEY_INVALID' });
  }
  throw error;
}

function scopedProject(projectId: string, companyId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, companyId, active: true },
    select: { id: true },
  });
}

const integrationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!await authenticateIntegration(request)) {
      return reply.status(401).send({
        error: 'Ogiltig eller saknad integrationsnyckel',
        code: 'INTEGRATION_AUTH_REQUIRED',
      });
    }
  });

  fastify.get('/projects', {
    preHandler: [requireIntegrationPermission('READ_ONLY')],
  }, async (request, reply) => {
    const { code } = projectCodeQuerySchema.parse(request.query);
    const project = await prisma.project.findFirst({
      where: { code, companyId: request.integrationScope!.companyId, active: true },
      select: {
        id: true,
        code: true,
        name: true,
        site: true,
        status: true,
        active: true,
        customer: { select: { id: true, name: true } },
      },
    });

    if (!project) return reply.status(404).send({ error: 'Projekt hittades inte' });
    return project;
  });

  fastify.get('/projects/:id/materials', {
    preHandler: [requireIntegrationPermission('READ_ONLY')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit } = listQuerySchema.parse(request.query);
    if (!await scopedProject(id, request.integrationScope!.companyId)) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const items = await prisma.projectMaterial.findMany({
      where: { projectId: id },
      select: {
        id: true,
        articleName: true,
        articleNumber: true,
        unit: true,
        quantity: true,
        date: true,
        note: true,
        createdAt: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit ?? 100,
    });
    return { items };
  });

  fastify.get('/projects/:id/time-entries', {
    preHandler: [requireIntegrationPermission('READ_ONLY')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit, from, to } = listQuerySchema.parse(request.query);
    if (!await scopedProject(id, request.integrationScope!.companyId)) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        projectId: id,
        ...(from || to ? {
          date: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        } : {}),
      },
      select: {
        id: true,
        date: true,
        hours: true,
        billable: true,
        note: true,
        status: true,
        user: { select: { id: true, name: true } },
        activity: { select: { id: true, name: true, code: true, category: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit ?? 100,
    });
    return { items: entries };
  });

  fastify.get('/projects/:id/updates', {
    preHandler: [requireIntegrationPermission('READ_ONLY')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit } = listQuerySchema.parse(request.query);
    if (!await scopedProject(id, request.integrationScope!.companyId)) {
      return reply.status(404).send({ error: 'Projekt hittades inte' });
    }

    const items = await prisma.projectUpdate.findMany({
      where: { projectId: id, companyId: request.integrationScope!.companyId },
      select: {
        id: true,
        type: true,
        content: true,
        occurredAt: true,
        source: true,
        createdAt: true,
        createdByUser: { select: { id: true, name: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: limit ?? 100,
    });
    return { items };
  });

  fastify.post('/material-writes/validate', {
    preHandler: [requireIntegrationPermission('MATERIAL_CREATE')],
    bodyLimit: 64 * 1024,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = materialBatchBodySchema.parse(request.body);
      const validation = await validateMaterialBatch(prisma, request.integrationScope!, body);
      return {
        valid: true,
        project: validation.project,
        rows: validation.rows.map((row) => ({
          index: row.index,
          article: {
            id: row.article.id,
            name: row.article.name,
            articleNumber: row.article.articleNumber,
            unit: row.article.unit,
          },
          quantity: row.quantity,
          date: row.date,
          note: row.note,
        })),
      };
    } catch (error) {
      return sendIntegrationError(error, reply);
    }
  });

  fastify.post('/material-writes', {
    preHandler: [requireIntegrationPermission('MATERIAL_CREATE')],
    bodyLimit: 64 * 1024,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = materialBatchBodySchema.parse(request.body);
      const idempotencyKey = parseIdempotencyKey(request.headers['idempotency-key']);
      const result = await createMaterialBatch(prisma, request.integrationScope!, body, idempotencyKey);
      return reply.status(result.created ? 201 : 200).send(result);
    } catch (error) {
      return sendIntegrationError(error, reply);
    }
  });

  fastify.get('/material-writes/:idempotencyKey', {
    preHandler: [requireIntegrationPermission('MATERIAL_CREATE')],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const params = z.object({ idempotencyKey: z.string() }).strict().parse(request.params);
      const idempotencyKey = parseIdempotencyKey(params.idempotencyKey);
      return await getMaterialBatchStatus(prisma, request.integrationScope!, idempotencyKey);
    } catch (error) {
      return sendIntegrationError(error, reply);
    }
  });

  fastify.post('/project-writes/validate', {
    preHandler: [requireIntegrationPermission('PROJECT_CREATE')],
    bodyLimit: 16 * 1024,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = projectCreateBodySchema.parse(request.body);
      const validation = await validateProjectCreate(prisma, request.integrationScope!, body);
      return {
        valid: true,
        project: {
          name: validation.body.name,
          site: validation.body.site,
          status: 'PLANNED',
          customer: validation.customer,
        },
      };
    } catch (error) {
      return sendIntegrationError(error, reply);
    }
  });

  fastify.post('/project-writes', {
    preHandler: [requireIntegrationPermission('PROJECT_CREATE')],
    bodyLimit: 16 * 1024,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = projectCreateBodySchema.parse(request.body);
      const idempotencyKey = parseIdempotencyKey(request.headers['idempotency-key']);
      const result = await createProjectFromIntegration(prisma, request.integrationScope!, body, idempotencyKey);
      return reply.status(result.created ? 201 : 200).send(result);
    } catch (error) {
      return sendIntegrationError(error, reply);
    }
  });

  fastify.get('/project-writes/:idempotencyKey', {
    preHandler: [requireIntegrationPermission('PROJECT_CREATE')],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const params = z.object({ idempotencyKey: z.string() }).strict().parse(request.params);
      const idempotencyKey = parseIdempotencyKey(params.idempotencyKey);
      return await getProjectCreateStatus(prisma, request.integrationScope!, idempotencyKey);
    } catch (error) {
      return sendIntegrationError(error, reply);
    }
  });

  fastify.get('/project-writes/customers', {
    preHandler: [requireIntegrationPermission('PROJECT_CREATE')],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const query = z.object({ name: z.string().trim().min(2).max(160) }).strict().parse(request.query);
    const customers = await prisma.customer.findMany({
      where: { companyId: request.integrationScope!.companyId, active: true, name: query.name },
      select: { id: true, name: true },
      take: 2,
    });
    if (customers.length === 0) {
      return reply.status(404).send({ error: 'Kunden hittades inte', code: 'CUSTOMER_NOT_FOUND' });
    }
    if (customers.length > 1) {
      return reply.status(409).send({ error: 'Kundnamnet är inte entydigt', code: 'CUSTOMER_AMBIGUOUS' });
    }
    return { customer: customers[0] };
  });
};

export default integrationRoutes;
