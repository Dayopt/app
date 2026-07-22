import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { onePasswordEnvSchema } from '../env/schema';

const rootDir = resolve(import.meta.dirname, '../..');
const temporaryDirectories: string[] = [];
const sentinelSecret = 'sentinel-secret-must-not-appear';

const fakeOpScript = `#!/bin/sh
case "$1" in
  --version)
    printf '%s\n' '2.0.0'
    ;;
  account)
    printf '%s\n' '[]'
    ;;
  vault)
    exit 0
    ;;
  item)
    case "$FAKE_OP_MODE" in
      error)
        printf '%s\n' "$FAKE_OP_SENTINEL" >&2
        exit 1
        ;;
      invalid-json)
        printf '%s\n' "$FAKE_OP_SENTINEL"
        ;;
      *)
        printf '%s\n' "$FAKE_OP_ITEM_JSON"
        ;;
    esac
    ;;
esac
`;

function createFakeOpDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dayopt-fake-op-'));
  temporaryDirectories.push(directory);
  writeFileSync(join(directory, 'op'), fakeOpScript, { mode: 0o755 });
  return directory;
}

function runCheck(mode?: 'error' | 'invalid-json') {
  const fakeOpDirectory = createFakeOpDirectory();
  const fields = [...new Set(onePasswordEnvSchema.map((entry) => entry.field))].map((field) => ({
    id: field,
    label: field,
    value: sentinelSecret,
  }));

  return spawnSync('pnpm', ['exec', 'tsx', 'scripts/env/check-1password.ts'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      FAKE_OP_ITEM_JSON: JSON.stringify({ fields }),
      FAKE_OP_MODE: mode ?? '',
      FAKE_OP_SENTINEL: sentinelSecret,
      PATH: `${fakeOpDirectory}:${process.env.PATH ?? ''}`,
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('check-1password.ts', () => {
  it('参照先と状態だけを表示し、取得した値を出力しない', () => {
    const result = runCheck();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Dayopt-Staging / supabase / SUPABASE_SERVICE_ROLE_KEY: OK');
    expect(result.stdout).not.toContain(sentinelSecret);
    expect(result.stderr).not.toContain(sentinelSecret);
  });

  it('op の失敗出力を引き継がない', () => {
    const result = runCheck('error');

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('MISSING_ITEM');
    expect(result.stdout).not.toContain(sentinelSecret);
    expect(result.stderr).not.toContain(sentinelSecret);
  });

  it('不正な JSON の raw stdout を引き継がない', () => {
    const result = runCheck('invalid-json');

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('MISSING_ITEM');
    expect(result.stdout).not.toContain(sentinelSecret);
    expect(result.stderr).not.toContain(sentinelSecret);
  });
});
