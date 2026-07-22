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
    if [ -n "$FAKE_OP_MISSING_ITEM" ] && [ "$3" = "$FAKE_OP_MISSING_ITEM" ]; then
      exit 1
    fi
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

interface CheckOptions {
  emptyField?: string;
  missingItem?: string;
  mode?: 'error' | 'invalid-json';
}

function runCheck(options: CheckOptions = {}) {
  const fakeOpDirectory = createFakeOpDirectory();
  const fields = [...new Set(onePasswordEnvSchema.map((entry) => entry.field))].map((field) => ({
    id: field,
    label: field,
    value: field === options.emptyField ? '' : sentinelSecret,
  }));

  return spawnSync('pnpm', ['exec', 'tsx', 'scripts/env/check-1password.ts'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      FAKE_OP_ITEM_JSON: JSON.stringify({ fields }),
      FAKE_OP_MISSING_ITEM: options.missingItem ?? '',
      FAKE_OP_MODE: options.mode ?? '',
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
    const result = runCheck({ mode: 'error' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('MISSING_ITEM');
    expect(result.stdout).not.toContain(sentinelSecret);
    expect(result.stderr).not.toContain(sentinelSecret);
  });

  it('不正な JSON の raw stdout を引き継がない', () => {
    const result = runCheck({ mode: 'invalid-json' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('MISSING_ITEM');
    expect(result.stdout).not.toContain(sentinelSecret);
    expect(result.stderr).not.toContain(sentinelSecret);
  });

  it('optional item が未作成でも状態を表示して成功する', () => {
    const result = runCheck({ missingItem: 'google' });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'Dayopt-Shared / google / GOOGLE_SITE_VERIFICATION: MISSING_ITEM (optional)',
    );
  });

  it('optional field が空でも状態を表示して成功する', () => {
    const result = runCheck({ emptyField: 'GOOGLE_SITE_VERIFICATION' });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'Dayopt-Shared / google / GOOGLE_SITE_VERIFICATION: EMPTY (optional)',
    );
  });

  it('required item が未作成なら失敗する', () => {
    const result = runCheck({ missingItem: 'sentry-web' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Dayopt-Production / sentry-web / SENTRY_DSN: MISSING_ITEM');
  });

  it('required field が空なら失敗する', () => {
    const result = runCheck({ emptyField: 'SENTRY_DSN' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Dayopt-Production / sentry / SENTRY_DSN: EMPTY');
  });

  it('required operational item が未作成なら失敗する', () => {
    const result = runCheck({ missingItem: 'recovery-codes' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Dayopt-Shared / recovery-codes: MISSING_ITEM');
  });
});
