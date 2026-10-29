import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function loadEnvironment(inherited = process.env, directory = root) {
  let files = {};
  for (const name of ['.local/cloud/sqlserver.env', '.env', '.env.local']) {
    try { files = { ...files, ...parseEnv(readFileSync(path.join(directory, name), 'utf8')) }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const result = { ...files, ...inherited };
  const publicKey = result.CLERK_PUBLISHABLE_KEY || result.VITE_CLERK_PUBLISHABLE_KEY || result.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (publicKey) {
    result.CLERK_PUBLISHABLE_KEY ||= publicKey;
    result.VITE_CLERK_PUBLISHABLE_KEY ||= publicKey;
  }
  return result;
}
