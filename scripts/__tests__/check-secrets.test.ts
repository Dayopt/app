import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const rootDir = resolve(import.meta.dirname, '../..');
const scriptPath = join(rootDir, 'scripts/env/check-secrets.ts');
const tsxBin = join(rootDir, 'node_modules/.bin/tsx');
const temporaryDirectories: string[] = [];

/**
 * check-secrets.ts は cwd の `git ls-files` を走査対象にするので、
 * fixture ごとに使い捨ての git repo を作って本体をそのまま起動する。
 * commit は不要（`git ls-files` は index を読む）。
 */
function runCheck(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'dayopt-check-secrets-'));
  temporaryDirectories.push(directory);

  execFileSync('git', ['init', '-q'], { cwd: directory });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(directory, name), content);
  }
  execFileSync('git', ['add', '-A'], { cwd: directory });

  return spawnSync(tsxBin, [scriptPath], { cwd: directory, encoding: 'utf8' });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('check-secrets.ts', () => {
  it('秘密らしい値が無ければ成功する', () => {
    const result = runCheck({ 'notes.md': '# just docs\n' });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('OK: no secret literals found');
  });

  describe('postgres 接続文字列', () => {
    it('Supabase local の既定接続文字列は手順書に書ける', () => {
      const result = runCheck({
        'runbook.md': "psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -At\n",
      });

      expect(result.status, result.stdout).toBe(0);
    });

    it('loopback でも既定 password でなければ検出する', () => {
      // 実 secret が literal で 1 行に並ばないよう組み立てる（CI の gitleaks 対策）。
      const password = 'hunter2';
      const result = runCheck({
        'runbook.md': `psql 'postgresql://postgres:${password}@127.0.0.1:54322/postgres'\n`,
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('pattern: postgres_url_with_password');
    });

    it('リモートホスト宛は既定 password でも検出する', () => {
      const host = 'db.example.com';
      const result = runCheck({
        'runbook.md': `psql 'postgresql://postgres:postgres@${host}:5432/prod'\n`,
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('pattern: postgres_url_with_password');
    });
  });

  describe('sensitive な env 代入', () => {
    it('test- 接頭辞の fixture は通す', () => {
      const result = runCheck({
        'stub.sh': 'SERVICE_ROLE_KEY="test-service-role-key"\n',
      });

      expect(result.status, result.stdout).toBe(0);
    });

    it('placeholder でない値は検出する', () => {
      const result = runCheck({
        'stub.sh': 'SERVICE_ROLE_KEY="notaplaceholder"\n',
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('pattern: sensitive_env_assignment');
    });

    it('検出しても値そのものは出力しない', () => {
      const value = 'notaplaceholder';
      const result = runCheck({ 'stub.sh': `SERVICE_ROLE_KEY="${value}"\n` });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('value: [redacted]');
      expect(result.stdout).not.toContain(value);
      expect(result.stderr).not.toContain(value);
    });
  });
});
