import type { PrismaClient, PushSubscription } from '@prisma/client';
import { sendPushNotification, type PushPayload } from '../lib/push.js';

type SendPush = typeof sendPushNotification;

export type PushDeliveryResult = {
  sent: boolean;
  removed: boolean;
  statusCode: number;
};

export async function deliverPushNotification(
  prisma: PrismaClient,
  subscription: PushSubscription,
  payload: PushPayload,
  sendPush: SendPush = sendPushNotification
): Promise<PushDeliveryResult> {
  try {
    await sendPush(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      payload
    );

    await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: { lastSuccessAt: new Date(), failureReason: null },
    });

    return { sent: true, removed: false, statusCode: 0 };
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 0);
    const failureReason = String(error?.message || 'Okänt push-fel').slice(0, 300);

    await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: {
        lastFailureAt: new Date(),
        failureReason,
      },
    });

    const removed = statusCode === 404 || statusCode === 410;
    if (removed) {
      await prisma.pushSubscription.delete({ where: { id: subscription.id } });
    }

    return { sent: false, removed, statusCode };
  }
}
