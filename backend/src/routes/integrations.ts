import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';
import {
  authenticateIntegrationKey,
  extractIntegrationKey,
  type IntegrationScope,
} from '../lib/integrationAuth.js';

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

async function requireIntegrationRead(request: FastifyRequest) {
  const scope = await authenticateIntegrationKey(
    {
      findByHash: (keyHash) => prisma.integrationAccessKey.findFirst({
        where: { keyHash },
        select: { id: true, companyId: true, active: true },
      }),
    },
    extractIntegrationKey(request.headers),
  );
  if (!scope) return null;
  request.integrationScope = scope;
  return scope;
}

function scopedProject(projectId: string, companyId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, companyId, active: true },
    select: { id: true },
  });
}

const integrationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!await requireIntegrationRead(request)) {
      return reply.status(401).send({ error: 'Ogiltig eller saknad integrationsnyckel' });
    }
  });

  fastify.get('/projects', async (request, reply) => {
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

  fastify.get('/projects/:id/materials', async (request, reply) => {
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

  fastify.get('/projects/:id/time-entries', async (request, reply) => {
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

  fastify.get('/projects/:id/updates', async (request, reply) => {
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
};

export default integrationRoutes;
