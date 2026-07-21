import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../index.js';
import { isPushConfigured, pushConfig } from '../lib/push.js';
import { isAllowedPushEndpoint } from '../lib/pushEndpoint.js';
import { deliverPushNotification } from '../services/pushDelivery.js';

const pushEndpointSchema = z.string()
  .url()
  .max(2048)
  .refine(isAllowedPushEndpoint, 'Push-adressen kommer inte från en godkänd leverantör');

const subscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
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
  endpoint: pushEndpointSchema,
});

const testSchema = z.object({
  endpoint: pushEndpointSchema,
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

  fastify.post('/test', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const body = testSchema.parse(request.body);

      if (!isPushConfigured()) {
        return reply.status(503).send({ error: 'Push-notiser är inte konfigurerade ännu' });
      }

      const subscription = await prisma.pushSubscription.findFirst({
        where: {
          userId: request.user.id,
          endpoint: body.endpoint,
        },
      });

      if (!subscription) {
        return reply.status(404).send({ error: 'Den här enheten är inte registrerad för notiser' });
      }

      const result = await deliverPushNotification(prisma, subscription, {
        title: 'TidApp fungerar',
        body: 'Provnotisen kom fram. Påminnelser är aktiverade på den här enheten.',
        url: '/week',
        tag: `push-test-${request.user.id}`,
      });

      if (!result.sent) {
        const message = result.removed
          ? 'Enhetens registrering hade gått ut. Aktivera notiser igen.'
          : 'Provnotisen kunde inte skickas. Försök igen om en stund.';
        return reply.status(result.removed ? 410 : 502).send({ error: message });
      }

      return { sent: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Ogiltigt request-format', details: error.errors });
      }

      request.log.error(error, 'Kunde inte skicka provnotis');
      return reply.status(500).send({ error: 'Kunde inte skicka provnotis' });
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
