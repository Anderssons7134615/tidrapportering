import assert from 'node:assert/strict';
import { before, after, afterEach, test } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

let vite, api, auth;
const originalFetch = globalThis.fetch;
before(async () => {
  const entries = new Map();
  globalThis.localStorage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
  globalThis.window = { location: { href: '/planning' } };
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  api = await vite.ssrLoadModule('/src/services/api.ts');
  auth = await vite.ssrLoadModule('/src/stores/authStore.ts');
});
afterEach(() => { globalThis.fetch = originalFetch; window.location.href = '/planning'; });
after(async () => { await vite.close(); });
for (const kind of ['json', 'blob']) {
  for (const switchSession of [false, true]) {
    test(`${kind}: delayed 401 expires only its own session (switched=${switchSession})`, async () => {
      const user = { id: 'first', companyId: 'one' };
      auth.useAuthStore.getState().setAuth('old-token', user);
      let finish;
      globalThis.fetch = (_url, options) => {
        assert.equal(options.headers.Authorization, 'Bearer old-token');
        return new Promise(resolve => { finish = resolve; });
      };
      const request = kind === 'json' ? api.planningApi.get() : api.supplierInvoicesApi.document('test');
      if (switchSession) auth.useAuthStore.getState().setAuth('new-token', { id: 'second', companyId: 'two' });
      finish(Response.json({ error: 'Unauthorized' }, { status: 401 }));
      await assert.rejects(request, /Unauthorized/);
      assert.equal(auth.useAuthStore.getState().token, switchSession ? 'new-token' : null);
      assert.equal(window.location.href, switchSession ? '/planning' : '/login');
      assert.equal(auth.useAuthStore.getState().user?.id ?? null, switchSession ? 'second' : null);
    });
  }
}
