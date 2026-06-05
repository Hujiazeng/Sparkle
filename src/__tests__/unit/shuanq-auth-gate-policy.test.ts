import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldBypassShuanQAuth,
  shouldQuitOnShuanQAppInfoFailure,
  shouldRefreshAfterShuanQAction,
  shuanQAuthEndpoint,
} from '../../lib/shuanq/auth-gate-policy';

describe('ShuanQ auth gate policy', () => {
  it('bypasses the gate for authenticated users', () => {
    assert.equal(shouldBypassShuanQAuth({ authenticated: true, verifyMode: 1 }), true);
  });

  it('bypasses the gate when app info declares free mode', () => {
    assert.equal(shouldBypassShuanQAuth({ authenticated: false, verifyMode: 0 }), true);
  });

  it('keeps the gate for paid verification modes until login succeeds', () => {
    assert.equal(shouldBypassShuanQAuth({ authenticated: false, verifyMode: 1 }), false);
    assert.equal(shouldBypassShuanQAuth({ authenticated: false, verifyMode: 2 }), false);
  });

  it('does not route register success through login', () => {
    assert.equal(shuanQAuthEndpoint('register'), '/api/auth/shuanq/register');
    assert.equal(shouldRefreshAfterShuanQAction('register'), false);
  });

  it('refreshes after card use so account state stays current', () => {
    assert.equal(shouldRefreshAfterShuanQAction('card'), true);
    assert.equal(shouldRefreshAfterShuanQAction('login'), false);
  });

  it('quits instead of showing the login gate when app info is unavailable', () => {
    assert.equal(shouldQuitOnShuanQAppInfoFailure({ appInfoUnavailable: true }), true);
    assert.equal(shouldQuitOnShuanQAppInfoFailure({ appInfoUnavailable: false }), false);
  });
});
