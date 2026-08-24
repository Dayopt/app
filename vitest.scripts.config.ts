import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
    exclude: ['node_modules'],
    // scripts のテストは spawnSync で実際のスクリプトを子プロセス実行する。
    // 単体では 1-2 秒だが、suite 全体を並列実行すると CPU 競合で default の
    // 5 秒を超えて flaky になるため、integration 相当の余裕を持たせる。
    testTimeout: 30000,
    // pre-push hook 経由でこの suite を起動すると、git が hook プロセスへ
    // GIT_DIR 等を注入しており、mkdtemp + 明示 cwd で隔離したはずの test
    // fixture の git 呼び出しが実 repo の .git/config を core.bare=true と
    // テスト用 user identity で汚染する事象を実測した（#2365）。worker 起動
    // 時に該当 env を消す setupFiles で塞ぐ（詳細はそのファイルのコメント）。
    setupFiles: ['./scripts/__tests__/vitest-git-env-setup.ts'],
  },
});
