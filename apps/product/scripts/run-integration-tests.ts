import { spawn } from 'node:child_process';

/**
 * `pnpm test:integration` の実行ラッパー。
 *
 * ローカル実行で `USE_LOCAL_DB` を注入し忘れると、`describe.skipIf(!RUN_LOCAL)` が
 * 収集時に評価されて 24 ファイル・171 テストが無音 skip され、exit 0（緑）で終わる
 * （#2178）。このラッパーは 2 つの安全策を提供する:
 *
 * 1. `USE_LOCAL_DB` の既定値を `true` にする（CI や呼び出し元が別の値を渡せば上書き可能）
 * 2. vitest サマリーの **`Test Files` 行**に `N skipped`（N > 0）が現れたら、vitest 自体の
 *    exit code に関わらず失敗として扱う
 *
 * `Test Files` 行の skip 数だけを見るのは、`describe.skipIf(!RUN_LOCAL)` がファイル単位の
 * describe を丸ごと収集時 skip する挙動（#2178 の対象）が、この行にそのまま反映されるため。
 * 一方 `Tests` 行の skip 数は無視する — `captcha-bypass.integration.test.ts` のように、
 * 実行時 `ctx.skip()` で個別 test だけを意図的に skip する正当なケースがあり（captcha が
 * ローカルで既定無効なため常時 skip、ファイル冒頭のコメント参照）、これを failure 扱いに
 * すると偽陰性になる。ファイル単位の skip か個別 test の意図的 skip かは、この 2 行の
 * 使い分けで見分けられる。
 *
 * 判定基準は絶対値ではなく「Test Files 行の skipped が 0 件であること」の 1 点（#2178 の教訓:
 * ファイル数・テスト数の絶対値は test 追加のたびに動くため success criterion にならない）。
 *
 * 実測確認（vitest 4.1.10、2026-08-19、CI=true / CI 未設定の両方）: 全 test が
 * `ctx.skip()` される `captcha-bypass.integration.test.ts`（3 test 全部が実行時 skip）を
 * 含めて実行しても、`Test Files` 行は `38 passed (38)` のまま skip が現れない
 * （`Tests` 行にのみ `3 skipped` が出る）。ファイル単位の skip か個別 test の意図的 skip
 * かは、この 2 行の使い分けで正しく判別できることを確認済み。子プロセスの stdout は
 * 非 TTY（`stdio: 'pipe'`）のため、CI=true でも vitest は ANSI カラーを出力しない
 * （正規表現がエスケープシーケンスに邪魔されない）。
 */

const USE_LOCAL_DB = process.env.USE_LOCAL_DB ?? 'true';

// `pnpm test:integration -- captcha-bypass` は pnpm 自身が `--` を消費せず
// `tsx run-integration-tests.ts -- captcha-bypass` としてそのまま転送する。
// 先頭の `--` を残したまま vitest へ渡すと、vitest がフィルタとして解釈できず
// 全ファイル実行にフォールバックする（実測確認済み）。pnpm の区切りとして
// 付いた先頭の `--` だけを取り除く。
const rawArgs = process.argv.slice(2);
const extraArgs = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

const child = spawn('vitest', ['run', '--config', 'vitest.config.integration.ts', ...extraArgs], {
  env: { ...process.env, USE_LOCAL_DB },
  stdio: ['inherit', 'pipe', 'pipe'],
});

let combinedOutput = '';

child.stdout.on('data', (chunk: Buffer) => {
  process.stdout.write(chunk);
  combinedOutput += chunk.toString();
});

child.stderr.on('data', (chunk: Buffer) => {
  process.stderr.write(chunk);
  combinedOutput += chunk.toString();
});

child.on('error', (error) => {
  console.error(`[test:integration] vitest の起動に失敗した: ${error.message}`);
  process.exit(1);
});

child.on('close', (exitCode) => {
  const testFilesLine = combinedOutput.split('\n').find((line) => /^\s*Test Files\s/.test(line));
  const skippedFilesMatch = testFilesLine?.match(/(\d+)\s+skipped/);
  const skippedFileCount = skippedFilesMatch ? Number(skippedFilesMatch[1]) : 0;

  if (skippedFileCount > 0 && exitCode === 0) {
    console.error(
      '\n[test:integration] Test Files が skip された(無音 skip、偽 green)。\n' +
        '  USE_LOCAL_DB が効いていないか、ローカル Supabase が未起動の可能性がある。\n' +
        '  前提: Docker Desktop 起動 + `supabase start`(必要なら `pnpm db:fresh`)。\n' +
        '  詳細: https://github.com/Dayopt/dayopt/issues/2178',
    );
    process.exit(1);
  }

  process.exit(exitCode ?? 1);
});
