/**
 * scripts/ 呼ばれ方別再編（#2476）の常設 contract test・下書き。
 *
 * **意図的に `.test.ts` を名乗らない。** vitest.scripts.config.ts の
 * `include: ['scripts/**\/*.test.ts']` に拾われないため、`pnpm test:scripts` /
 * `pnpm check` の対象に含まれない（= CI に配線されない）。理由: Phase B 時点
 * では package.json エントリを持つ script（tasks/ 行き、#2475 の writer 集合
 * である package.json への書き込みを伴うため Phase C 送り）がまだ
 * `scripts/tasks/` へ移っておらず、下記の判定はほぼ確実に fail する。
 *
 * **Phase C で「有効化」する際の手順**:
 * 1. `scripts/tasks/**` への移動と package.json の path 書き換えを完了する
 * 2. 本ファイルを `scripts/__tests__/scripts-taxonomy.test.ts` へ rename する
 * 3. `describe`/`it`（vitest）でラップし直す（下記の `runCheck()` の中身を
 *    そのまま `it('...', () => { ... })` の本体へ移すだけで足りる）
 * 4. `pnpm typecheck:scripts` と `pnpm exec vitest run --config
 *    vitest.scripts.config.ts` が green になることを確認する
 *
 * ローカルで今すぐ実行するには: `npx tsx scripts/__tests__/scripts-taxonomy.draft.ts`
 */
import { classifyAllScripts } from '../lib/scripts-taxonomy';

// 呼ばれ方別ディレクトリと、そこに置かれるべきカテゴリの対応。
// scripts/lib/scripts-taxonomy.ts の 6 分類（tasks/ci/hooks/agent/runbook/lib）と 1:1。
const CATEGORY_DIR: Record<string, string> = {
  tasks: 'scripts/tasks/',
  ci: 'scripts/ci/',
  hooks: 'scripts/hooks/',
  agent: 'scripts/agent/',
  runbook: 'scripts/runbook/',
  lib: 'scripts/lib/',
};

function runCheck() {
  const repoRoot = process.cwd();
  const classified = classifyAllScripts(repoRoot);

  const problems: string[] = [];

  // 1. 無参照 script が 1 件でもあれば fail（#2476 が解決したい中心問題）
  const unreferenced = classified.filter((c) => c.category === 'unreferenced');
  for (const c of unreferenced) {
    problems.push(
      `無参照: ${c.path} — package.json / workflow / husky・claude hooks / claude rules・skills・CLAUDE.md / docs / 他scriptのいずれからも参照されていません`,
    );
  }

  // 2. カテゴリごとの配置先ディレクトリと実際の配置が一致しない script を報告
  //    （lib は既存 script が複数箇所に残る設計もありうるため対象外にはしない —
  //     ズレを機械的に可視化することが目的で、許容するかどうかは人間が判断する）
  for (const c of classified) {
    if (c.category === 'unreferenced') continue;
    const expectedDir = CATEGORY_DIR[c.category];
    if (expectedDir && !c.path.startsWith(expectedDir)) {
      problems.push(
        `配置ズレ: ${c.path} は ${c.category} 判定だが ${expectedDir} 配下に無い（現在地: ${c.path}）`,
      );
    }
  }

  return { classified, problems };
}

const { classified, problems } = runCheck();

console.log(`分類済み script: ${classified.length} 件`);
const byCategory: Record<string, number> = {};
for (const c of classified) byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
console.log('カテゴリ別件数:', byCategory);

if (problems.length > 0) {
  console.error(`\n問題 ${problems.length} 件:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.log('\n問題なし。');
}
