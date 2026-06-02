import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/env/check-env.ts'], {
  stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
