import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnvironment } from '../environment.mjs';

test('root env files, inherited settings and Next.js public-key alias load consistently', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'attendance-env-'));
  try {
    mkdirSync(path.join(root, '.local/cloud'), { recursive: true });
    writeFileSync(path.join(root, '.local/cloud/sqlserver.env'), 'DB_HOST=localhost\nDB_NAME=attendance\n');
    writeFileSync(path.join(root, '.env'), 'DB_NAME=school\nNEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=public-test-fixture\n');
    writeFileSync(path.join(root, '.env.local'), 'DB_NAME=local_school\n');
    const env = loadEnvironment({ DB_HOST: 'external-database' }, root);
    assert.equal(env.DB_HOST, 'external-database'); assert.equal(env.DB_NAME, 'local_school');
    assert.equal(env.VITE_CLERK_PUBLISHABLE_KEY, 'public-test-fixture'); assert.equal(env.CLERK_PUBLISHABLE_KEY, env.VITE_CLERK_PUBLISHABLE_KEY);
    assert.equal(env.CLERK_SECRET_KEY, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
