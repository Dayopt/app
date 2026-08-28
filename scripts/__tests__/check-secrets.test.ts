import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const rootDir = resolve(import.meta.dirname, '../..');
const scriptPath = join(rootDir, 'scripts/tasks/env/check-secrets.ts');
const tsxBin = join(rootDir, 'node_modules/.bin/tsx');
const temporaryDirectories: string[] = [];

/**
 * このファイル自身も `pnpm secrets:check` の走査対象になる。
 *
 * 「検出されるべき」fixture をソースに literal で書くと自分自身が引っかかるので、
 * scheme を変数に出して完全な接続文字列がソース上に現れないようにする。
 * 逆に「除外されるべき」fixture はあえて literal のまま置き、tracked file に
 * 実在する形で例外が効くことを示す。
 */
const scheme = 'postgresql';

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
      const result = runCheck({
        'runbook.md': `psql '${scheme}://postgres:hunter2@127.0.0.1:54322/postgres'\n`,
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('pattern: postgres_url_with_password');
    });

    it('リモートホスト宛は既定 password でも検出する', () => {
      const result = runCheck({
        'runbook.md': `psql '${scheme}://postgres:postgres@db.example.com:5432/prod'\n`,
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('pattern: postgres_url_with_password');
    });
  });

  describe('除外が他の検出を巻き込まないこと', () => {
    // ここは PR #1724 のレビューで見つかった bypass の回帰テスト。
    // いずれも「除外対象のすぐ隣に本物を置く」形で、修正前は素通りしていた。

    it('除外される local URL と同じ行にある本番 URL を検出する', () => {
      const result = runCheck({
        'runbook.sh':
          `psql ${scheme}://postgres:postgres@127.0.0.1:54322/postgres -c 'select 1'; ` +
          `psql ${scheme}://postgres:R3alPr0dPass@db.example.com:5432/postgres -f dump.sql\n`,
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('pattern: postgres_url_with_password');
    });

    it('local URL に query を足して本物を運ばせない', () => {
      const result = runCheck({
        'runbook.sh': `psql '${scheme}://postgres:postgres@127.0.0.1:54322/postgres?password=R3alPr0dPass'\n`,
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('pattern: postgres_url_with_password');
    });

    it('行頭が test- でも JWT は検出する', () => {
      // 行全体を placeholder 判定へ渡していたため、行頭の `test-` だけで
      // jwt_like_token の検査が丸ごと飛んでいた。
      const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJyb2xlIjoic2VydmljZV9yb2xlIn0', 'c2lnbmF0dXJl0000'];
      const result = runCheck({ 'config.yml': `test-token: ${jwt.join('.')}\n` });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('pattern: jwt_like_token');
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

    it('test- で始まっても値全体が fixture の形でなければ検出する', () => {
      // `test-` 接頭辞だけを見ていた頃は、これが素通りしていた。
      // 大文字を含む時点で fixture の形（小文字・数字・ハイフン）から外れる。
      // 実 credential らしい高エントロピー文字列を書くと gitleaks 側に拾われるので、
      // 「fixture の形ではない」ことだけが分かる最小の値にする。
      const result = runCheck({
        'stub.sh': 'SERVICE_ROLE_KEY="test-NOT-A-FIXTURE"\n',
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
