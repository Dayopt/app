import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

/**
 * `storage-backup.sh` / `storage-restore.sh` を実プロセスとして動かし、`rclone` だけ
 * 呼び出し記録を残す stub に差し替えて契約を固定する。実際の S3/local backend での
 * 動作は 2026-08-13 にローカル Supabase Storage 相手に手動検証済み（avatars/attachments
 * 双方向 sync + copy が byte-identical で復元できることを確認、#1972 PR 参照）。
 */

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const backupScript = join(rootDir, 'scripts/storage-backup.sh');
const restoreScript = join(rootDir, 'scripts/storage-restore.sh');
const temporaryDirectories: string[] = [];

function makeStubBin(rcloneBehavior: 'record' | 'missing'): string {
  const dir = mkdtempSync(join(tmpdir(), 'storage-script-test-'));
  temporaryDirectories.push(dir);

  if (rcloneBehavior === 'record') {
    const logPath = join(dir, 'rclone-calls.log');
    writeFileSync(logPath, '');
    const stubPath = join(dir, 'rclone');
    writeFileSync(stubPath, `#!/bin/bash\necho "$@" >> "${logPath}"\nexit 0\n`);
    chmodSync(stubPath, 0o755);
  }

  return dir;
}

function readCallLog(binDir: string): string[] {
  const logPath = join(binDir, 'rclone-calls.log');
  return readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
}

function run(scriptPath: string, binDir: string, env: Record<string, string> = {}) {
  return spawnSync('bash', [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}:/usr/bin:/bin`, ...env },
  });
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop() as string, { recursive: true, force: true });
  }
});

describe('storage-backup.sh', () => {
  it('rclone が無ければ 0 以外で終了し、明確なメッセージを出す', () => {
    const binDir = makeStubBin('missing');

    const result = run(backupScript, binDir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('rclone');
  });

  it('既定では avatars / attachments の 2 バケットを source から dest へ sync する', () => {
    const binDir = makeStubBin('record');

    const result = run(backupScript, binDir);

    expect(result.status).toBe(0);
    const calls = readCallLog(binDir);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('sync source:avatars dest:avatars');
    expect(calls[1]).toContain('sync source:attachments dest:attachments');
  });

  it('STORAGE_BACKUP_BUCKETS でバケット一覧を上書きできる', () => {
    const binDir = makeStubBin('record');

    const result = run(backupScript, binDir, { STORAGE_BACKUP_BUCKETS: 'only-one' });

    expect(result.status).toBe(0);
    const calls = readCallLog(binDir);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('sync source:only-one dest:only-one');
  });

  it('SOURCE_REMOTE / DEST_REMOTE でリモート名を上書きできる', () => {
    const binDir = makeStubBin('record');

    const result = run(backupScript, binDir, {
      SOURCE_REMOTE: 'prod-source',
      DEST_REMOTE: 'r2-backup',
      STORAGE_BACKUP_BUCKETS: 'avatars',
    });

    expect(result.status).toBe(0);
    expect(readCallLog(binDir)[0]).toContain('sync prod-source:avatars r2-backup:avatars');
  });

  it('DRY_RUN=true 以外では --dry-run を付けない', () => {
    const binDir = makeStubBin('record');

    const result = run(backupScript, binDir, { STORAGE_BACKUP_BUCKETS: 'avatars' });

    expect(result.status).toBe(0);
    expect(readCallLog(binDir)[0]).not.toContain('--dry-run');
  });

  it('DRY_RUN=true で --dry-run を付ける', () => {
    const binDir = makeStubBin('record');

    const result = run(backupScript, binDir, {
      DRY_RUN: 'true',
      STORAGE_BACKUP_BUCKETS: 'avatars',
    });

    expect(result.status).toBe(0);
    expect(readCallLog(binDir)[0]).toContain('--dry-run');
  });

  it('macOS 標準の bash 3.2 でも unbound variable にならない（DRY_RUN 未設定）', () => {
    const binDir = makeStubBin('record');

    const result = spawnSync('/bin/bash', [backupScript], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${binDir}:/usr/bin:/bin`, STORAGE_BACKUP_BUCKETS: 'avatars' },
    });

    expect(result.stderr).not.toContain('unbound variable');
    expect(result.status).toBe(0);
  });
});

describe('storage-restore.sh', () => {
  it('sync ではなく copy を使う（復元先の既存オブジェクトを消さないため）', () => {
    const binDir = makeStubBin('record');

    const result = run(restoreScript, binDir, { STORAGE_BACKUP_BUCKETS: 'avatars' });

    expect(result.status).toBe(0);
    expect(readCallLog(binDir)[0]).toContain('copy dest:avatars restore_target:avatars');
  });

  it('rclone が無ければ 0 以外で終了する', () => {
    const binDir = makeStubBin('missing');

    const result = run(restoreScript, binDir);

    expect(result.status).not.toBe(0);
  });

  it('DRY_RUN=true で --dry-run を付ける', () => {
    const binDir = makeStubBin('record');

    const result = run(restoreScript, binDir, {
      DRY_RUN: 'true',
      STORAGE_BACKUP_BUCKETS: 'avatars',
    });

    expect(result.status).toBe(0);
    expect(readCallLog(binDir)[0]).toContain('--dry-run');
  });

  it('macOS 標準の bash 3.2 でも unbound variable にならない（DRY_RUN 未設定）', () => {
    const binDir = makeStubBin('record');

    const result = spawnSync('/bin/bash', [restoreScript], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${binDir}:/usr/bin:/bin`, STORAGE_BACKUP_BUCKETS: 'avatars' },
    });

    expect(result.stderr).not.toContain('unbound variable');
    expect(result.status).toBe(0);
  });
});
