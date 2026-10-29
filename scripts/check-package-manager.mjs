if (!process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  console.error('Use pnpm install --frozen-lockfile for this workspace.');
  process.exitCode = 1;
}
