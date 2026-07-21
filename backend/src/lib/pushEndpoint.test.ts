import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedPushEndpoint } from './pushEndpoint.js';

test('accepts browser push services used by Chrome, Firefox and Safari', () => {
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
  assert.equal(isAllowedPushEndpoint('https://web.push.apple.com/QP-abc'), true);
});

test('rejects local, insecure and credential-bearing endpoints', () => {
  assert.equal(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc'), false);
  assert.equal(isAllowedPushEndpoint('https://localhost:3001/private'), false);
  assert.equal(isAllowedPushEndpoint('https://127.0.0.1/private'), false);
  assert.equal(isAllowedPushEndpoint('https://user:password@fcm.googleapis.com/fcm/send/abc'), false);
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/fcm/send/abc'), false);
});
