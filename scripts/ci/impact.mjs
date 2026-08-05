#!/usr/bin/env node

/**
 * Impact Resolver — 変更ファイル一覧から「どの検証・build・release が必要か」を判定する。
 *
 * CI の手書き paths、merge gate（finish-branch.sh）、Production Release、Vercel の
 * Ignored Build Step が**同じ規則**を共有するための単一の正本
 * （docs/projects/ci-monorepo-refactor/overview.md §5）。
 *
 * 使い方:
 *   printf '%s\n' file1 file2 | node scripts/ci/impact.mjs --stdin
 *   node scripts/ci/impact.mjs apps/product/src/foo.ts docs/README.md
 *   ... --summary を付けると GITHUB_STEP_SUMMARY 向けの Markdown を出す
 *
 * 出力キーは固定: product / web / integration / productJourney / webPreviewSmoke / docsOnly。
 *
 * 判定の原則:
 * - **未知の path は fail closed（全 affected）**。判定漏れが検証漏れに化けるのを防ぐ。
 *   新しい root ファイルを足した時は本ファイルの分類へ明示的に追加する
 * - workspace 依存グラフは pnpm manifest（dependencies / devDependencies の @dayopt/*）
 *   から実行時に解決する。package 追加時に判定が自動追従し、対応表の腐りを防ぐ。
 *   読むのは**本ファイルを実行している checkout の manifest**（merge gate では通常
 *   main checkout）。PR 側の manifest 変更は直接見ないが、新しい依存 edge を作る
 *   変更は manifest ファイル自体（apps/** または packages/**）に触れるため、その
 *   ファイルの分類で当該 app が affected になり、判定漏れにはならない
 * - 変更ファイルが 1 件も無い入力は判定不能として fail closed（全 affected）に倒す
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** 出力キー。消費側（finish-branch.sh / release / CI）はこの集合に依存する。 */
export const IMPACT_KEYS = [
  'product',
  'web',
  'integration',
  'productJourney',
  'webPreviewSmoke',
  'docsOnly',
];

// ─── docs 系（app build に影響しない）────────────────────────────────
// ci.yml の paths-ignore と同一規則。片方だけ直すと「CI は skip したのに
// merge gate は build を要求する」ズレが出るため、変更時は両方を揃える。
const DOCS_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md']);

function isDocsPath(file) {
  if (DOCS_FILES.has(file)) return true;
  if (file.startsWith('docs/')) return true;
  if (file.startsWith('.claude/') && file.endsWith('.md')) {
    return true;
  }
  return false;
}

// ─── integration（server contract / DB 境界）────────────────────────
// .github/workflows/integration.yml の paths と同一集合。あちらの手書き paths は
// Phase 5 で本ファイルへの参照に置き換える予定（それまで二重管理。変更時は両方を揃える）。
const INTEGRATION_GLOBS = [
  '.nvmrc',
  'package.json',
  'pnpm-lock.yaml',
  'apps/product/package.json',
  '.github/actions/setup/action.yml',
  '.github/workflows/integration.yml',
  'apps/product/src/features/*/domain/**',
  'apps/product/src/features/*/server/**',
  'packages/domain/**',
  'apps/product/src/lib/database/**',
  'apps/product/src/lib/mcp/**',
  'apps/product/src/lib/oauth-server/**',
  'apps/product/src/lib/supabase/**',
  'apps/product/src/lib/trpc/**',
  'apps/product/src/app/api/mcp/**',
  'supabase/migrations/**',
  'apps/product/src/lib/test/integration/**',
  'apps/product/src/lib/test/integration-setup.ts',
  'apps/product/src/lib/test/trpc-test-helpers.ts',
  'apps/product/vitest.config.integration.ts',
  'scripts/generate-rls-snapshot.ts',
  'docs/engineering/data/db/rls-snapshot.md',
];

/**
 * Actions の paths と同じ意味論の最小 glob。`*` は 1 セグメント内、`**` は任意深さ。
 * 依存を増やさないため自前実装（対象はこのファイル内の固定パターンのみ）。
 */
function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '.*');
  return new RegExp(`^${escaped}$`);
}

const INTEGRATION_MATCHERS = INTEGRATION_GLOBS.map(globToRegExp);

function isIntegrationPath(file) {
  return INTEGRATION_MATCHERS.some((re) => re.test(file));
}

// ─── root 設定（両 app の build に影響する）──────────────────────────
// turbo.json の globalDependencies と install / toolchain の入力を含める。
// `.npmrc` は pnpm の依存解決設定（auto-install-peers / strict-peer-dependencies）を
// 持ち、両 app の install 結果＝build 対象を左右する。lockfile の diff を伴わない
// 単独変更がありうるため、中立に倒すと install 起因の build 失敗を検証しないまま
// merge できてしまう（product の build は Actions に無く Vercel だけが持つ）。
const ROOT_BUILD_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.base.json',
  '.nvmrc',
  '.npmrc',
  'eslint.config.packages.mjs',
]);

// ─── Vercel の build が実行する root script ───────────────────────────
// `apps/product/vercel.json` の buildCommand が `pnpm verify:bundle` を呼び、それが
// root の `scripts/` を直接実行する。`scripts/` 全体を中立に倒すと、この検証スクリプト
// 自体を変更した PR が product=false になり、**変更した当の検証を一度も走らせないまま**
// merge できてしまう（Vercel build がその PR で走らないため）。
// 追加漏れ（drift）は `scripts/__tests__/impact.test.ts` が manifest から導出して検査する。
export const PRODUCT_BUILD_SCRIPTS = new Set([
  'scripts/check-client-bundle-secrets.mjs',
  'scripts/check-bundle-budget.ts',
]);

// web の buildCommand（`pnpm generate:search-index && pnpm build`）が呼ぶのは
// `apps/web/scripts/generate-search-index.ts` で、`apps/web/` prefix で既に拾える。

// ─── 中立（appの成果物に影響しない既知の path）──────────────────────
// ここに入れてよいのは「app の build 成果物・runtime 挙動を変えない」ものだけ。
// 迷ったら入れない（未知扱い = fail closed の側に倒れる）。
function isNeutralPath(file) {
  const prefixes = [
    'scripts/', // CI / release / 開発補助。app へ bundle されない
    '.github/', // workflow 定義（integration 対象の 2 path は先に判定済み）
    '.claude/', // agent 設定・hooks
    '.husky/',
    '.vscode/',
    'apps/storybook/', // 開発者向け。Vercel の product / web project に含まれない
  ];
  if (prefixes.some((p) => file.startsWith(p))) return true;
  const rootNeutral = new Set([
    '.gitignore',
    '.gitattributes',
    '.prettierrc',
    '.prettierignore',
    'commitlint.config.mjs',
    'eslint.config.mjs',
    'vitest.scripts.config.ts',
    'LICENSE',
  ]);
  return rootNeutral.has(file);
}

// ─── workspace 依存グラフ ───────────────────────────────────────────

/**
 * `packages/<dir>` ごとに「どの app が（推移的に）依存しているか」を返す。
 * 対応表をハードコードしない: manifest の @dayopt/* を辿るため、package の
 * 追加・依存変更に自動追従する。
 *
 * @returns {Map<string, Set<'product' | 'web'>>} key は `packages/<dir>`
 */
export function readWorkspaceGraph(root = ROOT) {
  const readManifest = (dir) => {
    try {
      return JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
    } catch {
      return null;
    }
  };

  /** @type {Map<string, { dir: string, deps: string[] }>} name -> manifest 情報 */
  const packagesByName = new Map();
  for (const entry of readdirSync(join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = `packages/${entry.name}`;
    const manifest = readManifest(dir);
    if (!manifest?.name) continue;
    const deps = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).filter((name) => name.startsWith('@dayopt/'));
    packagesByName.set(manifest.name, { dir, deps });
  }

  const reachableFrom = (appDir) => {
    const manifest = readManifest(appDir);
    const queue = Object.keys({
      ...manifest?.dependencies,
      ...manifest?.devDependencies,
    }).filter((name) => name.startsWith('@dayopt/'));
    const seen = new Set();
    while (queue.length > 0) {
      const name = queue.pop();
      if (seen.has(name)) continue;
      seen.add(name);
      const pkg = packagesByName.get(name);
      if (pkg) queue.push(...pkg.deps);
    }
    return seen;
  };

  const productDeps = reachableFrom('apps/product');
  const webDeps = reachableFrom('apps/web');

  const graph = new Map();
  for (const [name, { dir }] of packagesByName) {
    const apps = new Set();
    if (productDeps.has(name)) apps.add('product');
    if (webDeps.has(name)) apps.add('web');
    graph.set(dir, apps);
  }
  return graph;
}

// ─── 判定本体 ───────────────────────────────────────────────────────

const ALL_AFFECTED = {
  product: true,
  web: true,
  integration: true,
  productJourney: true,
  webPreviewSmoke: true,
  docsOnly: false,
};

/**
 * @param {string[]} changedFiles repo-root 相対の変更ファイル一覧
 * @param {{ graph?: Map<string, Set<string>> }} [options] test 用の依存グラフ注入
 */
export function resolveImpact(changedFiles, options = {}) {
  const files = changedFiles.map((f) => f.trim()).filter(Boolean);

  // 空入力は「判定できない」であって「影響なし」ではない。fail closed に倒す。
  if (files.length === 0) {
    return {
      ...ALL_AFFECTED,
      reasons: { product: '(判定不能: 変更ファイル一覧が空。fail closed)' },
      unknown: [],
    };
  }

  const graph = options.graph ?? readWorkspaceGraph();

  let product = false;
  let web = false;
  let integration = false;
  let docsOnly = true;
  /** @type {Record<string, string>} 各キーを最初に true にしたファイル（説明用） */
  const reasons = {};
  /** @type {string[]} どの規則にも該当しなかったファイル */
  const unknown = [];

  const mark = (key, file) => {
    if (!reasons[key]) reasons[key] = file;
  };

  for (const file of files) {
    // integration は docs とも app とも独立に判定する（rls-snapshot.md のように
    // docs パスが integration の対象になるものがあるため、先に見る）。
    if (isIntegrationPath(file)) {
      integration = true;
      mark('integration', file);
    }

    if (isDocsPath(file)) continue; // docsOnly を維持

    docsOnly = false;

    if (file.startsWith('apps/product/')) {
      product = true;
      mark('product', file);
      continue;
    }
    if (file.startsWith('apps/web/')) {
      web = true;
      mark('web', file);
      continue;
    }
    if (file.startsWith('supabase/')) {
      product = true;
      integration = true;
      mark('product', file);
      mark('integration', file);
      continue;
    }
    if (file.startsWith('packages/')) {
      const dir = file.split('/').slice(0, 2).join('/');
      const apps = graph.get(dir);
      if (!apps) {
        unknown.push(file); // 未知 package は fail closed
        continue;
      }
      if (apps.has('product')) {
        product = true;
        mark('product', file);
      }
      if (apps.has('web')) {
        web = true;
        mark('web', file);
      }
      continue;
    }
    if (ROOT_BUILD_FILES.has(file)) {
      product = true;
      web = true;
      mark('product', file);
      mark('web', file);
      continue;
    }
    // isNeutralPath より先に見る（どちらも scripts/ に該当するため）
    if (PRODUCT_BUILD_SCRIPTS.has(file)) {
      product = true;
      mark('product', file);
      continue;
    }
    if (isNeutralPath(file)) continue;

    unknown.push(file);
  }

  if (unknown.length > 0) {
    // 未知 path の fail closed。docsOnly も false にする（docs と未知の混在を
    // 「docs のみ」と誤判定して build を skip しないため）。
    return {
      ...ALL_AFFECTED,
      reasons: {
        ...reasons,
        product: reasons.product ?? unknown[0],
        web: reasons.web ?? unknown[0],
      },
      unknown,
    };
  }

  return {
    product,
    web,
    integration,
    // journey / smoke は現状 app 影響と同値。Phase 5 で E2E の実行判定に使う
    // 独立キーとして先に固定しておく（消費側の contract を後から変えない）。
    productJourney: product,
    webPreviewSmoke: web,
    docsOnly,
    reasons,
    unknown,
  };
}

// ─── Markdown summary（GITHUB_STEP_SUMMARY 向け）────────────────────

export function formatSummary(impact) {
  const row = (key) => {
    const value = impact[key] ? '✅ 必要' : '⬜ skip';
    const reason = impact.reasons?.[key] ? ` — \`${impact.reasons[key]}\`` : '';
    return `| ${key} | ${value}${reason} |`;
  };
  const lines = [
    '## Impact Resolver',
    '',
    '| 対象 | 判定 |',
    '| --- | --- |',
    ...IMPACT_KEYS.map((key) =>
      key === 'docsOnly' ? `| docsOnly | ${impact.docsOnly ? '✅' : '⬜'} |` : row(key),
    ),
  ];
  if (impact.unknown?.length > 0) {
    lines.push(
      '',
      `⚠️ 未知の path を検出したため fail closed（全 affected）: ${impact.unknown
        .map((f) => `\`${f}\``)
        .join(', ')}`,
      '分類は `scripts/ci/impact.mjs` に追加する。',
    );
  }
  return `${lines.join('\n')}\n`;
}

// ─── CLI ────────────────────────────────────────────────────────────

async function readStdinLines() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.split('\n');
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const args = process.argv.slice(2);
  const useStdin = args.includes('--stdin');
  const summary = args.includes('--summary');
  const fileArgs = args.filter((a) => !a.startsWith('--'));

  const files = useStdin ? await readStdinLines() : fileArgs;
  const impact = resolveImpact(files);

  if (summary) {
    process.stdout.write(formatSummary(impact));
  } else {
    process.stdout.write(`${JSON.stringify(impact, null, 2)}\n`);
  }
}
