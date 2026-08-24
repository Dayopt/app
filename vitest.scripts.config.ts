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
    // 複数 test file が並行 worker で同時に git init / clone / worktree add
    // を大量発行すると、各 fixture は mkdtemp + 明示 cwd で隔離されているに
    // もかかわらず、実 repo の .git/config が core.bare=true とテスト用
    // user identity で汚染される事象を実測した（#2365）。file 並列を止める
    // と 1148 test 全 pass・実 repo 無傷を確認済み。原因の完全特定はできて
    // いないが、pre-push hook 経由で毎回実 repo を壊しうる致命度のため、
    // 原因究明を待たず直列化で塞ぐ（実行時間は 24s→67s に増えるが安全優先）。
    fileParallelism: false,
  },
});
