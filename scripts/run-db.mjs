import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { root, loadEnvironment } from './environment.mjs';
const directory = path.join(root, 'lib/db');
const requireDb = createRequire(path.join(directory, 'package.json'));
const child = spawn(process.execPath, [requireDb.resolve('tsx/cli'), path.join(directory, 'src/migrate.ts')], { cwd: directory, env: loadEnvironment(), stdio: 'inherit' });
child.on('error', error => { console.error('Migration could not start:', error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
