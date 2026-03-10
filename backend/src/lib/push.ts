import webpush from 'web-push';

const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
const contact = process.env.WEB_PUSH_CONTACT || 'mailto:admin@example.com';

let configured = false;

if (publicKey && privateKey) {
  webpush.setVapidDetails(contact, publicKey, privateKey);
  configured = true;
}

export const pushConfig = {
  publicKey,
  configured,
};

export const isPushConfigured = () => configured;

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
) {
  if (!configured) {
    throw new Error('WEB_PUSH_NOT_CONFIGURED');
  }

  const serialized = JSON.stringify(payload);

  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    serialized
  );
}
