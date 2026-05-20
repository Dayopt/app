#!/usr/bin/env node

/**
 * 品質メトリクス収集スクリプト
 *
 * 各品質ツールの出力を構造化JSONに統一し、quality-reports/ へ保存する。
 *
 * Usage:
 *   npx tsx scripts/collect-quality-metrics.ts              # 全メトリクス収集
 *   npx tsx scripts/collect-quality-metrics.ts --skip=a11y,testCoverage  # 一部スキップ
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import type { CoverageMetric, MetricKey, QualitySnapshot } from './quality-metrics-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const APP_ROOT = resolve(ROOT, 'apps/product');
const REPORTS_DIR = resolve(ROOT, 'quality-reports');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const UI_DIR = resolve(APP_ROOT, 'src/lib/components/ui');
const BUDGET_FILE = resolve(APP_ROOT, '.feature-boundary-budget.json');

// ---------------------------------------------------------------------------
// CLI引数パース
// ---------------------------------------------------------------------------

const skipArg = process.argv.find((a) => a.startsWith('--skip='));
const skipMetrics = new Set<string>(skipArg ? skipArg.replace('--skip=', '').split(',') : []);

function shouldSkip(key: MetricKey): boolean {
  return skipMetrics.has(key);
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function exec(cmd: string, opts?: { ignoreError?: boolean }): string {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e: unknown) {
    if (opts?.ignoreError) {
      const error = e as { stdout?: string; stderr?: string };
      return error.stdout ?? error.stderr ?? '';
    }
    throw e;
  }
}

function getGitSha(): string {
  return exec('git rev-parse --short HEAD').trim();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// メトリクス収集
// ---------------------------------------------------------------------------

function collectTypeSafety(): QualitySnapshot['metrics']['typeSafety'] {
  if (shouldSkip('typeSafety')) {
    return { errors: 0, status: 'pass' };
  }

  const output = exec('pnpm --filter @dayopt/product typecheck 2>&1', { ignoreError: true });
  const errorLines = output.split('\n').filter((line) => /error TS\d+/.test(line));
  return {
    errors: errorLines.length,
    status: errorLines.length === 0 ? 'pass' : 'fail',
  };
}

function collectTestCoverage(): QualitySnapshot['metrics']['testCoverage'] {
  const zeroCov: CoverageMetric = { covered: 0, total: 0, pct: 0 };
  if (shouldSkip('testCoverage')) {
    return { statements: zeroCov, functions: zeroCov, branches: zeroCov };
  }

  exec('pnpm --filter @dayopt/product test:coverage', { ignoreError: true });

  const coveragePath = resolve(APP_ROOT, 'coverage/coverage-final.json');
  if (!existsSync(coveragePath)) {
    console.warn('  ⚠ coverage-final.json not found, skipping testCoverage');
    return { statements: zeroCov, functions: zeroCov, branches: zeroCov };
  }

  const raw = JSON.parse(readFileSync(coveragePath, 'utf8')) as Record<
    string,
    {
      s: Record<string, number>;
      f: Record<string, number>;
      b: Record<string, number[]>;
    }
  >;

  let sTotal = 0,
    sCov = 0,
    fTotal = 0,
    fCov = 0,
    bTotal = 0,
    bCov = 0;

  for (const file of Object.values(raw)) {
    for (const count of Object.values(file.s)) {
      sTotal++;
      if (count > 0) sCov++;
    }
    for (const count of Object.values(file.f)) {
      fTotal++;
      if (count > 0) fCov++;
    }
    for (const counts of Object.values(file.b)) {
      for (const count of counts) {
        bTotal++;
        if (count > 0) bCov++;
      }
    }
  }

  const pct = (c: number, t: number) => (t === 0 ? 100 : Math.round((c / t) * 10000) / 100);

  return {
    statements: { covered: sCov, total: sTotal, pct: pct(sCov, sTotal) },
    functions: { covered: fCov, total: fTotal, pct: pct(fCov, fTotal) },
    branches: { covered: bCov, total: bTotal, pct: pct(bCov, bTotal) },
  };
}

function collectRlsCoverage(): QualitySnapshot['metrics']['rlsCoverage'] {
  if (shouldSkip('rlsCoverage')) {
    return { tablesWithRls: 0, totalTables: 0, pct: 0, policies: 0 };
  }

  if (!existsSync(MIGRATIONS_DIR)) {
    return { tablesWithRls: 0, totalTables: 0, pct: 0, policies: 0 };
  }

  const sqlFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  let allSql = '';
  for (const file of sqlFiles) {
    allSql += readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8') + '\n';
  }

  // CREATE TABLE文のカウント（public.スキーマのみ）
  const createTableMatches = allSql.match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+public\.\w+/gi);
  const totalTables = new Set(
    (createTableMatches ?? []).map((m) =>
      m.replace(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+/i, '').toLowerCase(),
    ),
  ).size;

  // ENABLE RLS のテーブル
  const rlsMatches = allSql.match(/ALTER TABLE\s+public\.\w+\s+ENABLE ROW LEVEL SECURITY/gi);
  const tablesWithRls = new Set(
    (rlsMatches ?? []).map((m) =>
      m
        .replace(/ALTER TABLE\s+/i, '')
        .replace(/\s+ENABLE ROW LEVEL SECURITY/i, '')
        .toLowerCase(),
    ),
  ).size;

  // CREATE POLICY のカウント
  const policyMatches = allSql.match(/CREATE POLICY/gi);
  const policies = policyMatches?.length ?? 0;

  const pct = totalTables === 0 ? 100 : Math.round((tablesWithRls / totalTables) * 10000) / 100;

  return { tablesWithRls, totalTables, pct, policies };
}

function collectStoryCoverage(): QualitySnapshot['metrics']['storyCoverage'] {
  if (shouldSkip('storyCoverage')) {
    return { covered: 0, total: 0, pct: 0 };
  }

  if (!existsSync(UI_DIR)) {
    return { covered: 0, total: 0, pct: 0 };
  }

  const componentFiles = readdirSync(UI_DIR).filter(
    (f) =>
      f.endsWith('.tsx') &&
      !f.endsWith('.stories.tsx') &&
      f !== 'index.tsx' &&
      !f.startsWith('use-'),
  );

  let covered = 0;
  for (const file of componentFiles) {
    const base = file.replace(/\.tsx$/, '');
    if (existsSync(resolve(UI_DIR, `${base}.stories.tsx`))) {
      covered++;
    }
  }

  const total = componentFiles.length;
  const pct = total === 0 ? 100 : Math.round((covered / total) * 10000) / 100;

  return { covered, total, pct };
}

function collectFeatureBoundaries(): QualitySnapshot['metrics']['featureBoundaries'] {
  if (shouldSkip('featureBoundaries')) {
    return { violations: 0 };
  }

  if (!existsSync(BUDGET_FILE)) {
    return { violations: 0 };
  }

  const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) as {
    crossImports: Record<string, number>;
    selfImports: Record<string, number>;
  };

  const cross = Object.values(budget.crossImports).reduce((a, b) => a + b, 0);
  const self = Object.values(budget.selfImports).reduce((a, b) => a + b, 0);

  return { violations: cross + self };
}

function collectCircularDeps(): QualitySnapshot['metrics']['circularDeps'] {
  if (shouldSkip('circularDeps')) {
    return { count: 0 };
  }

  const output = exec(
    'pnpm --dir apps/product exec madge --circular --json --ts-config ./tsconfig.json --extensions ts,tsx src/',
    {
      ignoreError: true,
    },
  );

  try {
    const cycles = JSON.parse(output) as string[][];
    return { count: cycles.length };
  } catch {
    return { count: 0 };
  }
}

function collectDeadCode(): QualitySnapshot['metrics']['deadCode'] {
  if (shouldSkip('deadCode')) {
    return { unusedExports: 0, unusedFiles: 0 };
  }

  const output = exec('pnpm --filter @dayopt/product quality:deadcode', { ignoreError: true });

  try {
    const result = JSON.parse(output) as {
      files?: string[];
      exports?: Array<{ symbol: string }>;
      types?: Array<{ symbol: string }>;
      unlisted?: Array<{ symbol: string }>;
    };

    const unusedFiles = result.files?.length ?? 0;
    const unusedExports = (result.exports?.length ?? 0) + (result.types?.length ?? 0);

    return { unusedExports, unusedFiles };
  } catch {
    return { unusedExports: 0, unusedFiles: 0 };
  }
}

function collectA11y(): QualitySnapshot['metrics']['a11y'] {
  if (shouldSkip('a11y')) {
    return { violations: 0, status: 'skipped' };
  }

  const output = exec(
    'pnpm --filter @dayopt/storybook test-storybook -- --run --reporter json 2>&1',
    {
      ignoreError: true,
    },
  );

  try {
    const jsonStart = output.indexOf('{');
    if (jsonStart === -1) {
      return { violations: 0, status: 'skipped' };
    }

    const result = JSON.parse(output.slice(jsonStart)) as {
      testResults?: Array<{
        assertionResults?: Array<{
          status: string;
          failureMessages?: string[];
        }>;
      }>;
    };

    let violations = 0;
    for (const suite of result.testResults ?? []) {
      for (const test of suite.assertionResults ?? []) {
        if (test.status === 'failed') {
          const hasAxe = test.failureMessages?.some((m) => /axe|accessibility|a11y/i.test(m));
          if (hasAxe) violations++;
        }
      }
    }

    return { violations, status: violations === 0 ? 'pass' : 'fail' };
  } catch {
    return { violations: 0, status: 'skipped' };
  }
}

function collectBundleSize(): QualitySnapshot['metrics']['bundleSize'] {
  if (shouldSkip('bundleSize')) {
    return {
      loginPageGzipKB: 0,
      smallestRouteGzipKB: 0,
      largestRouteGzipKB: 0,
      cssGzipKB: 0,
      status: 'skipped',
    };
  }

  const statsFile = resolve(APP_ROOT, '.next/diagnostics/route-bundle-stats.json');
  if (!existsSync(statsFile)) {
    console.log('    (.next/diagnostics not found — skipping bundle size)');
    return {
      loginPageGzipKB: 0,
      smallestRouteGzipKB: 0,
      largestRouteGzipKB: 0,
      cssGzipKB: 0,
      status: 'skipped',
    };
  }

  try {
    exec(
      'pnpm --filter @dayopt/product exec tsx ../../scripts/check-bundle-budget.ts --output=.next/diagnostics/budget-result.json',
      {
        ignoreError: true,
      },
    );

    const resultFile = resolve(APP_ROOT, '.next/diagnostics/budget-result.json');
    if (!existsSync(resultFile)) {
      return {
        loginPageGzipKB: 0,
        smallestRouteGzipKB: 0,
        largestRouteGzipKB: 0,
        cssGzipKB: 0,
        status: 'skipped',
      };
    }

    const result = JSON.parse(readFileSync(resultFile, 'utf8')) as {
      summary: {
        loginGzipKB: number;
        smallestGzipKB: number;
        largestGzipKB: number;
        overCount: number;
      };
      css: { gzipKB: number };
    };

    return {
      loginPageGzipKB: result.summary.loginGzipKB,
      smallestRouteGzipKB: result.summary.smallestGzipKB,
      largestRouteGzipKB: result.summary.largestGzipKB,
      cssGzipKB: result.css.gzipKB,
      status: result.summary.overCount > 0 ? 'warn' : 'pass',
    };
  } catch {
    return {
      loginPageGzipKB: 0,
      smallestRouteGzipKB: 0,
      largestRouteGzipKB: 0,
      cssGzipKB: 0,
      status: 'skipped',
    };
  }
}

// ---------------------------------------------------------------------------
// スナップショット書き出し
// ---------------------------------------------------------------------------

function findPreviousSnapshot(): QualitySnapshot | null {
  if (!existsSync(REPORTS_DIR)) return null;

  const files = readdirSync(REPORTS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();

  // 今日のファイルをスキップして前回分を探す
  const todayFile = `${today()}.json`;
  const prevFile = files.find((f) => f !== todayFile);

  if (!prevFile) return null;

  try {
    return JSON.parse(readFileSync(resolve(REPORTS_DIR, prevFile), 'utf8')) as QualitySnapshot;
  } catch {
    return null;
  }
}

function writeSnapshots(snapshot: QualitySnapshot): void {
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const dateFile = resolve(REPORTS_DIR, `${today()}.json`);
  const latestFile = resolve(REPORTS_DIR, 'latest.json');
  const previousFile = resolve(REPORTS_DIR, 'previous.json');

  // 既存のlatestをpreviousに退避
  const prev = findPreviousSnapshot();
  if (existsSync(latestFile)) {
    const currentLatest = readFileSync(latestFile, 'utf8');
    writeFileSync(previousFile, currentLatest);
  } else if (prev) {
    writeFileSync(previousFile, JSON.stringify(prev, null, 2) + '\n');
  } else {
    // 初回: previousはlatestと同じ内容
    writeFileSync(previousFile, JSON.stringify(snapshot, null, 2) + '\n');
  }

  const json = JSON.stringify(snapshot, null, 2) + '\n';
  writeFileSync(dateFile, json);
  writeFileSync(latestFile, json);
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('品質メトリクス収集を開始します...\n');

  const metrics: Record<string, unknown> = {};

  const collectors: Array<{ key: MetricKey; label: string; fn: () => unknown }> = [
    { key: 'typeSafety', label: '型安全性', fn: collectTypeSafety },
    { key: 'testCoverage', label: 'テストカバレッジ', fn: collectTestCoverage },
    { key: 'rlsCoverage', label: 'RLSカバレッジ', fn: collectRlsCoverage },
    { key: 'storyCoverage', label: 'Storyカバレッジ', fn: collectStoryCoverage },
    { key: 'featureBoundaries', label: 'Feature境界', fn: collectFeatureBoundaries },
    { key: 'circularDeps', label: '循環依存', fn: collectCircularDeps },
    { key: 'deadCode', label: 'Dead Code', fn: collectDeadCode },
    { key: 'a11y', label: 'アクセシビリティ', fn: collectA11y },
    { key: 'bundleSize', label: 'バンドルサイズ', fn: collectBundleSize },
  ];

  for (const { key, label, fn } of collectors) {
    if (shouldSkip(key)) {
      console.log(`  ⏭ ${label} (スキップ)`);
    } else {
      console.log(`  📊 ${label} を収集中...`);
    }
    metrics[key] = fn();
  }

  const snapshot: QualitySnapshot = {
    version: 1,
    timestamp: new Date().toISOString(),
    gitSha: getGitSha(),
    metrics: metrics as QualitySnapshot['metrics'],
  };

  writeSnapshots(snapshot);

  console.log(`\n✅ スナップショットを保存しました: quality-reports/${today()}.json`);
  console.log('\nサマリー:');
  console.log(`  型エラー: ${snapshot.metrics.typeSafety.errors}`);
  console.log(`  テストカバレッジ: ${snapshot.metrics.testCoverage.statements.pct}% (statements)`);
  console.log(
    `  RLS: ${snapshot.metrics.rlsCoverage.tablesWithRls}/${snapshot.metrics.rlsCoverage.totalTables} tables, ${snapshot.metrics.rlsCoverage.policies} policies`,
  );
  console.log(
    `  Story: ${snapshot.metrics.storyCoverage.covered}/${snapshot.metrics.storyCoverage.total}`,
  );
  console.log(`  境界違反: ${snapshot.metrics.featureBoundaries.violations}`);
  console.log(`  循環依存: ${snapshot.metrics.circularDeps.count}`);
  console.log(
    `  Dead Code: ${snapshot.metrics.deadCode.unusedExports} exports, ${snapshot.metrics.deadCode.unusedFiles} files`,
  );
  console.log(
    `  A11y: ${snapshot.metrics.a11y.violations} violations (${snapshot.metrics.a11y.status})`,
  );
  console.log(
    `  Bundle: login=${snapshot.metrics.bundleSize.loginPageGzipKB}KB, css=${snapshot.metrics.bundleSize.cssGzipKB}KB (${snapshot.metrics.bundleSize.status})`,
  );
}

main().catch((err) => {
  console.error('メトリクス収集に失敗しました:', err);
  process.exit(1);
});
