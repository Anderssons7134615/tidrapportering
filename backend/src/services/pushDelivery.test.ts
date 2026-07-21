import test from 'node:test';
import assert from 'node:assert/strict';
import type { PushSubscription } from '@prisma/client';
import { deliverPushNotification } from './pushDelivery.js';

function createSubscription(): PushSubscription {
  return {
    id: 'subscription-1',
    userId: 'user-1',
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: 'key',
    auth: 'auth',
    userAgent: null,
    contentEncoding: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSuccessAt: null,
    lastFailureAt: null,
    failureReason: null,
  };
}

test('records a successful push delivery', async () => {
  const updates: unknown[] = [];
  const deletes: unknown[] = [];
  const prisma = {
    pushSubscription: {
      update: async (args: unknown) => updates.push(args),
      delete: async (args: unknown) => deletes.push(args),
    },
  };

  const result = await deliverPushNotification(
    prisma as any,
    createSubscription(),
    { title: 'Test', body: 'Test' },
    async () => ({}) as any
  );

  assert.deepEqual(result, { sent: true, removed: false, statusCode: 0 });
  assert.equal(updates.length, 1);
  assert.equal(deletes.length, 0);
});

test('removes a subscription when the push service returns 410', async () => {
  const updates: unknown[] = [];
  const deletes: unknown[] = [];
  const prisma = {
    pushSubscription: {
      update: async (args: unknown) => updates.push(args),
      delete: async (args: unknown) => deletes.push(args),
    },
  };

  const result = await deliverPushNotification(
    prisma as any,
    createSubscription(),
    { title: 'Test', body: 'Test' },
    async () => {
      throw Object.assign(new Error('Gone'), { statusCode: 410 });
    }
  );

  assert.deepEqual(result, { sent: false, removed: true, statusCode: 410 });
  assert.equal(updates.length, 1);
  assert.equal(deletes.length, 1);
});
