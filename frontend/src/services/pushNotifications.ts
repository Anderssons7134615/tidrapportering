import { pushSubscriptionsApi } from './api';

const PUSH_SW_PATH = '/sw.js';

function isPushRegistration(registration: ServiceWorkerRegistration) {
  const scriptUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL;
  return scriptUrl ? new URL(scriptUrl).pathname === PUSH_SW_PATH : false;
}

async function getOrRegisterPushWorker() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const existing = registrations.find(isPushRegistration);
  if (existing) return existing;

  await navigator.serviceWorker.register(PUSH_SW_PATH, { scope: '/' });
  return navigator.serviceWorker.ready;
}

function base64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const safe = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(safe);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function getPushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, permission: Notification.permission, hasLocalSubscription: false };
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  const registration = registrations.find(isPushRegistration);
  if (!registration) {
    return { supported: true, permission: Notification.permission, hasLocalSubscription: false };
  }

  const subscription = await registration.pushManager.getSubscription();

  return {
    supported: true,
    permission: Notification.permission,
    hasLocalSubscription: Boolean(subscription),
    endpoint: subscription?.endpoint,
  };
}

export async function enablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Din enhet stödjer inte push-notiser i webbläsaren');
  }

  if (Notification.permission === 'denied') {
    throw new Error('Notiser är blockerade i webbläsaren. Aktivera i webbläsarens inställningar.');
  }

  const keyResponse = await pushSubscriptionsApi.getPublicKey();
  const registration = await getOrRegisterPushWorker();

  let permission: NotificationPermission = Notification.permission;
  if (permission !== 'granted') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    throw new Error('Du behöver godkänna notiser för att aktivera påminnelser');
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const applicationServerKey = base64ToUint8Array(keyResponse.publicKey) as unknown as BufferSource;
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  await pushSubscriptionsApi.register({
    ...subscription.toJSON(),
    userAgent: navigator.userAgent,
  });

  return { endpoint: subscription.endpoint };
}

export async function disablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Din enhet stödjer inte push-notiser i webbläsaren');
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  const registration = registrations.find(isPushRegistration);
  if (!registration) return { removed: false };
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return { removed: false };
  }

  await pushSubscriptionsApi.unregister(subscription.endpoint);
  await subscription.unsubscribe();

  return { removed: true };
}
