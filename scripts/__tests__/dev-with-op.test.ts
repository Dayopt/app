import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryDirectories: string[] = [];

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function createTestEnvironment({ failStart = false }: { failStart?: boolean } = {}) {
  const temporaryDirectory = mkdtempSync(join(rootDir, '.dev-with-op-test-'));
  const binDirectory = join(temporaryDirectory, 'bin');
  const statePath = join(temporaryDirectory, 'supabase-started');
  const callsPath = join(temporaryDirectory, 'calls.log');
  const opEnvPath = join(temporaryDirectory, '.op-env.agent');

  temporaryDirectories.push(temporaryDirectory);
  mkdirSync(binDirectory);
  writeFileSync(opEnvPath, 'TEST_VALUE=op://test/item/field\n');
  writeFileSync(callsPath, '');

  writeExecutable(
    join(binDirectory, 'supabase'),
    `#!/bin/bash
set -euo pipefail
printf 'supabase %s\\n' "$1" >> "$SUPABASE_TEST_CALLS"
case "$1" in
  status)
    [[ -f "$SUPABASE_TEST_STATE" ]] || exit 1
    cat <<'EOF'
API_URL="http://127.0.0.1:54321"
ANON_KEY="test-anon-key"
SERVICE_ROLE_KEY="test-service-role-key"
EOF
    ;;
  start)
    [[ "\${SUPABASE_TEST_FAIL_START:-0}" != "1" ]] || exit 1
    touch "$SUPABASE_TEST_STATE"
    ;;
  *) exit 2 ;;
esac
`,
  );
  writeExecutable(
    join(binDirectory, 'op'),
    `#!/bin/bash
set -euo pipefail
while [[ "$#" -gt 0 && "$1" != "--" ]]; do shift; done
shift
exec "$@"
`,
  );
  writeExecutable(
    join(binDirectory, 'pnpm'),
    `#!/bin/bash
printf 'pnpm %s\\n' "$*" >> "$SUPABASE_TEST_CALLS"
`,
  );

  return {
    callsPath,
    env: {
      ...process.env,
      OP_ENV_FILE: relative(rootDir, opEnvPath),
      PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
      SUPABASE_TEST_CALLS: callsPath,
      SUPABASE_TEST_FAIL_START: failStart ? '1' : '0',
      SUPABASE_TEST_STATE: statePath,
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('dev-with-op.sh', () => {
  it('Supabase local が停止中なら自動起動して product dev を開始する', () => {
    const { callsPath, env } = createTestEnvironment();

    const result = spawnSync('bash', ['scripts/dev-with-op.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Supabase local を起動します...');
    expect(result.stderr).not.toContain('❌ Supabase local が起動していません。');
    expect(readFileSync(callsPath, 'utf8')).toBe(
      'supabase status\nsupabase start\nsupabase status\npnpm --filter @dayopt/product dev:raw\n',
    );
  });

  it('Supabase local を起動できない場合は復旧方法を表示する', () => {
    const { env } = createTestEnvironment({ failStart: true });

    const result = spawnSync('bash', ['scripts/dev-with-op.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '❌ Supabase local を起動できませんでした。Docker の状態を確認してください。',
    );
    expect(result.stderr).toContain('supabase start');
    expect(result.stderr).not.toContain('DAYOPT_SUPABASE_TARGET=op');
  });

  it('DAYOPT_SUPABASE_TARGET=op は廃止されており、起動せずに失敗する', () => {
    const { callsPath, env } = createTestEnvironment();

    const result = spawnSync('bash', ['scripts/dev-with-op.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env: { ...env, DAYOPT_SUPABASE_TARGET: 'op' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('❌ DAYOPT_SUPABASE_TARGET は廃止されました');
    // 1Password 参照だけで product dev が起動する経路が残っていないこと
    expect(readFileSync(callsPath, 'utf8')).toBe('');
  });
});
