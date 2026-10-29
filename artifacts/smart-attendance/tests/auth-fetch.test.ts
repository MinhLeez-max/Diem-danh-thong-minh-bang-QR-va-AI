import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customFetch, setAuthTokenGetter } from '../../../lib/api-client-react/src/custom-fetch.ts';

test('API client attaches the current Clerk bearer token and clears it at sign-out', async () => {
  const original = globalThis.fetch;
  let session: string | null = 'test-session-one';
  const headers: Headers[] = [];
  globalThis.fetch = async (_url, init) => {
    headers.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ id: 1 }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    setAuthTokenGetter(async () => session);
    await customFetch('/api/auth/me');
    session = 'test-session-refreshed'; await customFetch('/api/auth/me');
    session = null; await customFetch('/api/auth/me');
    setAuthTokenGetter(null); await customFetch('/api/auth/me');
    assert.deepEqual(headers.map(value => value.get('authorization')), ['Bearer test-session-one', 'Bearer test-session-refreshed', null, null]);
  } finally { setAuthTokenGetter(null); globalThis.fetch = original; }
});
