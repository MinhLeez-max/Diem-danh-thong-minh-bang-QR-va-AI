import { loadEnvironment } from './environment.mjs';
const env = loadEnvironment();
let failed = false;
function check(label, valid, instruction) {
  console.log(`${valid ? 'OK' : 'MISSING/INVALID'}: ${label}${valid ? '' : ' — ' + instruction}`);
  if (!valid) failed = true;
}
check('Clerk secret key', !!env.CLERK_SECRET_KEY && env.CLERK_SECRET_KEY.startsWith('sk_') && !/…|\.\.\./.test(env.CLERK_SECRET_KEY), 'Enter the full secret in your local .env or secure environment settings.');
check('Frontend publishable key', !!env.VITE_CLERK_PUBLISHABLE_KEY, 'Set VITE_CLERK_PUBLISHABLE_KEY (or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).');
check('Matching frontend/backend publishable keys', !!env.CLERK_PUBLISHABLE_KEY && env.CLERK_PUBLISHABLE_KEY === env.VITE_CLERK_PUBLISHABLE_KEY, 'Use the same Clerk instance for frontend and API.');
for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) check(key, !!env[key], 'Configure SQL Server or run pnpm db:up.');
console.log('Only configuration presence was checked. Key validity and live login still require a real Clerk session.');
process.exitCode = failed ? 1 : 0;
