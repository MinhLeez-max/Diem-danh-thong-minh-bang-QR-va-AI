import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, loadEnvironment } from './environment.mjs';
const directory = path.join(root, 'artifacts/api-server');
const environment = { NODE_ENV: 'development', PORT: '5000', ...loadEnvironment() };
if (process.argv[2] === 'dev') {
  const build = spawnSync(process.execPath, ['build.mjs'], { cwd: directory, env: environment, stdio: 'inherit' });
  if (build.error) { console.error('Unable to build API:', build.error.message); process.exit(1); }
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const child = spawn(process.execPath, ['--enable-source-maps', 'dist/index.mjs'], { cwd: directory, env: environment, stdio: 'inherit' });
child.on('error', error => { console.error('Unable to start API:', error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
