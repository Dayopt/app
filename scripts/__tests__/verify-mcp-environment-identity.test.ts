import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryDirectories: string[] = [];

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function createTestEnvironment({
  failSeedlessResets = 0,
  failSeedRestores = 0,
}: {
  failSeedlessResets?: number;
  failSeedRestores?: number;
} = {}) {
  const temporaryDirectory = mkdtempSync(join(rootDir, '.mcp-environment-identity-test-'));
  const binDirectory = join(temporaryDirectory, 'bin');
  const callsPath = join(temporaryDirectory, 'calls.log');
  const seedlessAttemptsPath = join(temporaryDirectory, 'seedless-attempts');
  const seedRestoreAttemptsPath = join(temporaryDirectory, 'seed-restore-attempts');

  temporaryDirectories.push(temporaryDirectory);
  mkdirSync(binDirectory);
  writeFileSync(callsPath, '');
  writeFileSync(seedlessAttemptsPath, '0');
  writeFileSync(seedRestoreAttemptsPath, '0');

  writeExecutable(
    join(binDirectory, 'supabase'),
    `#!/bin/bash
set -euo pipefail
printf 'supabase %s\\n' "$*" >> "$MCP_IDENTITY_TEST_CALLS"

if [[ "$*" == *"--no-seed"* ]]; then
  attempts=$(<"$MCP_IDENTITY_TEST_SEEDLESS_ATTEMPTS")
  attempts=$((attempts + 1))
  printf '%s' "$attempts" > "$MCP_IDENTITY_TEST_SEEDLESS_ATTEMPTS"
  ((attempts > MCP_IDENTITY_TEST_FAIL_SEEDLESS_RESETS))
  exit
fi

attempts=$(<"$MCP_IDENTITY_TEST_SEED_RESTORE_ATTEMPTS")
attempts=$((attempts + 1))
printf '%s' "$attempts" > "$MCP_IDENTITY_TEST_SEED_RESTORE_ATTEMPTS"
((attempts > MCP_IDENTITY_TEST_FAIL_SEED_RESTORES))
`,
  );
  writeExecutable(
    join(binDirectory, 'psql'),
    `#!/bin/bash
set -euo pipefail
printf 'psql\\n' >> "$MCP_IDENTITY_TEST_CALLS"
cat >/dev/null
`,
  );

  return {
    callsPath,
    env: {
      ...process.env,
      MCP_IDENTITY_TEST_CALLS: callsPath,
      MCP_IDENTITY_TEST_FAIL_SEEDLESS_RESETS: String(failSeedlessResets),
      MCP_IDENTITY_TEST_FAIL_SEED_RESTORES: String(failSeedRestores),
      MCP_IDENTITY_TEST_SEEDLESS_ATTEMPTS: seedlessAttemptsPath,
      MCP_IDENTITY_TEST_SEED_RESTORE_ATTEMPTS: seedRestoreAttemptsPath,
      PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
      USE_LOCAL_DB: 'true',
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('verify-mcp-environment-identity.sh', () => {
  it('通常はseedなしresetと通常seed復元を一度ずつ実行する', () => {
    const { callsPath, env } = createTestEnvironment();

    const result = spawnSync('bash', ['scripts/verify-mcp-environment-identity.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('MCP environment identity rehearsal passed.');
    expect(readFileSync(callsPath, 'utf8')).toBe(
      [
        'supabase db reset --local --yes --no-seed',
        'psql',
        'supabase db reset --local --yes',
        '',
      ].join('\n'),
    );
  });

  it('一時的なseed復元失敗を一度だけ再試行する', () => {
    const { callsPath, env } = createTestEnvironment({ failSeedRestores: 1 });

    const result = spawnSync('bash', ['scripts/verify-mcp-environment-identity.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Supabase local seed restore failed; retrying once...');
    expect(readFileSync(callsPath, 'utf8')).toBe(
      [
        'supabase db reset --local --yes --no-seed',
        'psql',
        'supabase db reset --local --yes',
        'supabase db reset --local --yes',
        '',
      ].join('\n'),
    );
  });

  it('seedなしresetが失敗してもtrapで通常seedの復元を再試行する', () => {
    const { callsPath, env } = createTestEnvironment({
      failSeedlessResets: 2,
      failSeedRestores: 1,
    });

    const result = spawnSync('bash', ['scripts/verify-mcp-environment-identity.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Supabase local seedless reset failed after 2 attempts.');
    expect(readFileSync(callsPath, 'utf8')).toBe(
      [
        'supabase db reset --local --yes --no-seed',
        'supabase db reset --local --yes --no-seed',
        'supabase db reset --local --yes',
        'supabase db reset --local --yes',
        '',
      ].join('\n'),
    );
  });

  it('通常seedを二度復元できなければ失敗し、trapでは重複実行しない', () => {
    const { callsPath, env } = createTestEnvironment({ failSeedRestores: 2 });

    const result = spawnSync('bash', ['scripts/verify-mcp-environment-identity.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Supabase local seed restore failed after 2 attempts.');
    expect(result.stdout).not.toContain('MCP environment identity rehearsal passed.');
    expect(readFileSync(callsPath, 'utf8')).toBe(
      [
        'supabase db reset --local --yes --no-seed',
        'psql',
        'supabase db reset --local --yes',
        'supabase db reset --local --yes',
        '',
      ].join('\n'),
    );
  });
});
