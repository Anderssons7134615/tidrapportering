import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';
import { pushConfig } from '../lib/push.js';

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  expirationTime: z.number().nullable().optional(),
  options: z.object({
    userVisibleOnly: z.boolean().optional(),
    applicationServerKey: z.string().optional(),
  }).optional(),
  userAgent: z.string().max(500).optional(),
});

const removeSchema = z.object({
  endpoint: z.string().url(),
});

const pushSubscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/vapid-public-key', async (_, reply) => {
    if (!pushConfig.publicKey) {
      return reply.status(503).send({ error: 'Push-notiser är inte konfigurerade ännu' });
    }

    return { publicKey: pushConfig.publicKey };
  });

  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request) => {
    return prisma.pushSubscription.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        endpoint: true,
        contentEncoding: true,
        createdAt: true,
        lastSuccessAt: true,
        lastFailureAt: true,
        failureReason: true,
      },
    });
  });

  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const body = subscriptionSchema.parse(request.body);

      const saved = await prisma.pushSubscription.upsert({
        where: { endpoint: body.endpoint },
        update: {
          userId: request.user.id,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent: body.userAgent || request.headers['user-agent']?.slice(0, 500),
          contentEncoding: body.options?.applicationServerKey ? 'aes128gcm' : undefined,
          failureReason: null,
        },
        create: {
          userId: request.user.id,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent: body.userAgent || request.headers['user-agent']?.slice(0, 500),
          contentEncoding: body.options?.applicationServerKey ? 'aes128gcm' : null,
        },
      });

      return { id: saved.id, endpoint: saved.endpoint, createdAt: saved.createdAt };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltig push-subscription', details: error.errors });
      }

      request.log.error(error, 'Kunde inte spara push-subscription');
      return reply.status(500).send({ error: 'Kunde inte spara push-subscription' });
    }
  });

  fastify.delete('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const body = removeSchema.parse(request.body);

      const result = await prisma.pushSubscription.deleteMany({
        where: {
          userId: request.user.id,
          endpoint: body.endpoint,
        },
      });

      if (result.count === 0) {
        return reply.status(404).send({ error: 'Subscription hittades inte' });
      }

      return { message: 'Subscription borttagen' };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltigt request-format', details: error.errors });
      }

      request.log.error(error, 'Kunde inte ta bort push-subscription');
      return reply.status(500).send({ error: 'Kunde inte ta bort push-subscription' });
    }
  });
};

export default pushSubscriptionRoutes;
