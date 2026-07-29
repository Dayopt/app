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
  invalidSeedlessStates = 0,
  invalidSeedRestoreStates = 0,
  unavailableApiChecks = 0,
  unavailableApiPath = '/auth/v1/health',
}: {
  failSeedlessResets?: number;
  failSeedRestores?: number;
  invalidSeedlessStates?: number;
  invalidSeedRestoreStates?: number;
  unavailableApiChecks?: number;
  unavailableApiPath?: '/auth/v1/health' | '/rest/v1/' | '/storage/v1/status';
} = {}) {
  const temporaryDirectory = mkdtempSync(join(rootDir, '.mcp-environment-identity-test-'));
  const binDirectory = join(temporaryDirectory, 'bin');
  const callsPath = join(temporaryDirectory, 'calls.log');
  const seedlessAttemptsPath = join(temporaryDirectory, 'seedless-attempts');
  const seedRestoreAttemptsPath = join(temporaryDirectory, 'seed-restore-attempts');
  const seedlessStateChecksPath = join(temporaryDirectory, 'seedless-state-checks');
  const seedRestoreStateChecksPath = join(temporaryDirectory, 'seed-restore-state-checks');
  const apiChecksPath = join(temporaryDirectory, 'api-checks');

  temporaryDirectories.push(temporaryDirectory);
  mkdirSync(binDirectory);
  writeFileSync(callsPath, '');
  writeFileSync(seedlessAttemptsPath, '0');
  writeFileSync(seedRestoreAttemptsPath, '0');
  writeFileSync(seedlessStateChecksPath, '0');
  writeFileSync(seedRestoreStateChecksPath, '0');
  writeFileSync(apiChecksPath, '0');

  writeExecutable(
    join(binDirectory, 'find'),
    `#!/bin/bash
set -euo pipefail
printf 'supabase/migrations/99999999999999_future.sql\\n'
`,
  );
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
sql=$(cat)

if [[ "$sql" == *"MCP_RESET_STATE_SEEDLESS"* ]]; then
  [[ "$sql" == *"WHERE version = '99999999999999'"* ]]
  printf 'psql verify-seedless\\n' >> "$MCP_IDENTITY_TEST_CALLS"
  checks=$(<"$MCP_IDENTITY_TEST_SEEDLESS_STATE_CHECKS")
  checks=$((checks + 1))
  printf '%s' "$checks" > "$MCP_IDENTITY_TEST_SEEDLESS_STATE_CHECKS"
  if ((checks <= MCP_IDENTITY_TEST_INVALID_SEEDLESS_STATES)); then
    printf 'f\\n'
  else
    printf 't\\n'
  fi
  exit
fi

if [[ "$sql" == *"MCP_RESET_STATE_SEEDED"* ]]; then
  [[ "$sql" == *"WHERE version = '99999999999999'"* ]]
  [[ "$sql" == *"FROM storage.buckets AS bucket"* ]]
  [[ "$sql" == *"bucket.file_size_limit = 5242880"* ]]
  [[ "$sql" == *"'image/webp'"* ]]
  printf 'psql verify-seeded\\n' >> "$MCP_IDENTITY_TEST_CALLS"
  checks=$(<"$MCP_IDENTITY_TEST_SEED_RESTORE_STATE_CHECKS")
  checks=$((checks + 1))
  printf '%s' "$checks" > "$MCP_IDENTITY_TEST_SEED_RESTORE_STATE_CHECKS"
  if ((checks <= MCP_IDENTITY_TEST_INVALID_SEED_RESTORE_STATES)); then
    printf 'f\\n'
  else
    printf 't\\n'
  fi
  exit
fi

printf 'psql rehearsal\\n' >> "$MCP_IDENTITY_TEST_CALLS"
`,
  );
  writeExecutable(
    join(binDirectory, 'curl'),
    `#!/bin/bash
set -euo pipefail
url="\${*: -1}"
printf 'curl %s\\n' "$url" >> "$MCP_IDENTITY_TEST_CALLS"
if [[ "$url" != *"$MCP_IDENTITY_TEST_UNAVAILABLE_API_PATH" ]]; then
  exit 0
fi
checks=$(<"$MCP_IDENTITY_TEST_API_CHECKS")
checks=$((checks + 1))
printf '%s' "$checks" > "$MCP_IDENTITY_TEST_API_CHECKS"
((checks > MCP_IDENTITY_TEST_UNAVAILABLE_API_CHECKS))
`,
  );
  writeExecutable(
    join(binDirectory, 'sleep'),
    `#!/bin/bash
set -euo pipefail
printf 'sleep %s\\n' "$*" >> "$MCP_IDENTITY_TEST_CALLS"
`,
  );

  return {
    callsPath,
    env: {
      ...process.env,
      MCP_IDENTITY_TEST_CALLS: callsPath,
      MCP_IDENTITY_TEST_FAIL_SEEDLESS_RESETS: String(failSeedlessResets),
      MCP_IDENTITY_TEST_FAIL_SEED_RESTORES: String(failSeedRestores),
      MCP_IDENTITY_TEST_INVALID_SEEDLESS_STATES: String(invalidSeedlessStates),
      MCP_IDENTITY_TEST_INVALID_SEED_RESTORE_STATES: String(invalidSeedRestoreStates),
      MCP_IDENTITY_TEST_UNAVAILABLE_API_CHECKS: String(unavailableApiChecks),
      MCP_IDENTITY_TEST_UNAVAILABLE_API_PATH: unavailableApiPath,
      MCP_IDENTITY_TEST_SEEDLESS_ATTEMPTS: seedlessAttemptsPath,
      MCP_IDENTITY_TEST_SEED_RESTORE_ATTEMPTS: seedRestoreAttemptsPath,
      MCP_IDENTITY_TEST_SEEDLESS_STATE_CHECKS: seedlessStateChecksPath,
      MCP_IDENTITY_TEST_SEED_RESTORE_STATE_CHECKS: seedRestoreStateChecksPath,
      MCP_IDENTITY_TEST_API_CHECKS: apiChecksPath,
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
        'psql verify-seedless',
        'psql rehearsal',
        'supabase db reset --local --yes',
        'psql verify-seeded',
        'curl http://127.0.0.1:54321/auth/v1/health',
        'curl http://127.0.0.1:54321/rest/v1/',
        'curl http://127.0.0.1:54321/storage/v1/status',
        '',
      ].join('\n'),
    );
  });

  it('CLIが失敗しても通常seedのDBとAPIが揃っていれば再試行しない', () => {
    const { callsPath, env } = createTestEnvironment({ failSeedRestores: 1 });

    const result = spawnSync('bash', ['scripts/verify-mcp-environment-identity.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      'Supabase local seed restore returned an error after reaching the verified target state; continuing.',
    );
    expect(readFileSync(callsPath, 'utf8')).toBe(
      [
        'supabase db reset --local --yes --no-seed',
        'psql verify-seedless',
        'psql rehearsal',
        'supabase db reset --local --yes',
        'psql verify-seeded',
        'curl http://127.0.0.1:54321/auth/v1/health',
        'curl http://127.0.0.1:54321/rest/v1/',
        'curl http://127.0.0.1:54321/storage/v1/status',
        '',
      ].join('\n'),
    );
  });

  it.each(['/auth/v1/health', '/rest/v1/', '/storage/v1/status'] as const)(
    '%sが遅れて起動してもDBは再構築しない',
    (unavailableApiPath) => {
      const { callsPath, env } = createTestEnvironment({
        unavailableApiChecks: 1,
        unavailableApiPath,
      });

      const result = spawnSync('bash', ['scripts/verify-mcp-environment-identity.sh'], {
        cwd: rootDir,
        encoding: 'utf8',
        env,
      });

      expect(result.status).toBe(0);
      const calls = readFileSync(callsPath, 'utf8');
      expect(calls.match(/supabase db reset --local --yes$/gm)).toHaveLength(1);
      expect(
        calls.match(new RegExp(`curl http://127\\.0\\.0\\.1:54321${unavailableApiPath}`, 'g')),
      ).toHaveLength(2);
      expect(calls.match(/sleep 2/g)).toHaveLength(1);
    },
  );

  it('CLIが失敗してもseedなしDBが揃っていれば再試行しない', () => {
    const { callsPath, env } = createTestEnvironment({ failSeedlessResets: 1 });

    const result = spawnSync('bash', ['scripts/verify-mcp-environment-identity.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      'Supabase local seedless reset returned an error after reaching the verified target state; continuing.',
    );
    expect(
      readFileSync(callsPath, 'utf8').match(/supabase db reset --local --yes --no-seed/g),
    ).toHaveLength(1);
  });

  it('seedなしDBが未完成なら一度だけ再試行する', () => {
    const { callsPath, env } = createTestEnvironment({ invalidSeedlessStates: 1 });

    const result = spawnSync('bash', ['scripts/verify-mcp-environment-identity.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(
      'Supabase local seedless reset did not reach its verified target state; retrying once...',
    );
    expect(
      readFileSync(callsPath, 'utf8').match(/supabase db reset --local --yes --no-seed/g),
    ).toHaveLength(2);
  });

  it('seedなしreset後のDBが二度とも未完成でもtrapで通常seedを復元する', () => {
    const { callsPath, env } = createTestEnvironment({
      failSeedlessResets: 2,
      invalidSeedlessStates: 2,
      failSeedRestores: 1,
    });

    const result = spawnSync('bash', ['scripts/verify-mcp-environment-identity.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Supabase local seedless reset did not reach its verified target state after 2 attempts.',
    );
    const calls = readFileSync(callsPath, 'utf8');
    expect(calls.match(/supabase db reset --local --yes --no-seed/g)).toHaveLength(2);
    expect(calls.match(/supabase db reset --local --yes$/gm)).toHaveLength(1);
  });

  it('通常seedのDBが二度とも未完成なら失敗し、trapでは重複実行しない', () => {
    const { callsPath, env } = createTestEnvironment({
      failSeedRestores: 2,
      invalidSeedRestoreStates: 2,
    });

    const result = spawnSync('bash', ['scripts/verify-mcp-environment-identity.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Supabase local seed restore did not reach its verified target state after 2 attempts.',
    );
    expect(result.stdout).not.toContain('MCP environment identity rehearsal passed.');
    const calls = readFileSync(callsPath, 'utf8');
    expect(calls.match(/supabase db reset --local --yes$/gm)).toHaveLength(2);
  });

  it('通常seed後のAPIが起動しなければDBを一度だけ再構築して失敗する', () => {
    const { callsPath, env } = createTestEnvironment({ unavailableApiChecks: 30 });

    const result = spawnSync('bash', ['scripts/verify-mcp-environment-identity.sh'], {
      cwd: rootDir,
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Supabase local seed restore did not reach its verified target state after 2 attempts.',
    );
    const calls = readFileSync(callsPath, 'utf8');
    expect(calls.match(/supabase db reset --local --yes$/gm)).toHaveLength(2);
    expect(calls.match(/curl http:\/\/127\.0\.0\.1:54321\/auth\/v1\/health/g)).toHaveLength(30);
    expect(calls.match(/sleep 2/g)).toHaveLength(28);
  });
});
