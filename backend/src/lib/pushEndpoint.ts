const PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'updates.push.services.mozilla.com',
]);

export function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (url.port && url.port !== '443') return false;

    return PUSH_HOSTS.has(hostname) || hostname.endsWith('.push.apple.com');
  } catch {
    return false;
  }
}
