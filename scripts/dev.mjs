import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { root, loadEnvironment } from './environment.mjs';
const frontend = path.join(root, 'artifacts/smart-attendance');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const vite = path.join(path.dirname(requireFrontend.resolve('vite/package.json')), 'bin/vite.js');
const environment = loadEnvironment();
const api = path.join(root, 'artifacts/api-server');
const build = spawnSync(process.execPath, ['build.mjs'], { cwd: api, env: environment, stdio: 'inherit' });
if (build.error) { console.error('API build failed:', build.error.message); process.exit(1); }
if (build.status !== 0) process.exit(build.status ?? 1);
const children = [
  spawn(process.execPath, ['--enable-source-maps', 'dist/index.mjs'], { cwd: api, env: { NODE_ENV: 'development', ...environment, PORT: environment.API_PORT || '5000' }, stdio: 'inherit' }),
  spawn(process.execPath, [vite, '--host', '0.0.0.0'], { cwd: frontend, env: { ...environment, PORT: environment.FRONTEND_PORT || '5173', BASE_PATH: environment.BASE_PATH || '/' }, stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; process.exitCode = code; for (const child of children) child.kill(); }
for (const child of children) {
  child.on('error', error => { console.error('Development service failed:', error.message); stop(1); });
  child.on('exit', code => stop(code ?? 0));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
