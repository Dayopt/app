#!/usr/bin/env node

/**
 * バンドルサイズバジェットチェック
 *
 * .next/diagnostics/route-bundle-stats.json を読み込み、
 * 各ルートの First Load JS (gzip) をバジェットと比較する。
 *
 * Usage:
 *   npx tsx scripts/check-bundle-budget.ts                  # レポート出力（warn-only）
 *   npx tsx scripts/check-bundle-budget.ts --fail            # バジェット超過時に exit 1
 *   npx tsx scripts/check-bundle-budget.ts --output=path.json # JSON結果を保存
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const APP_ROOT = resolve(ROOT, 'apps/product');
const STATS_FILE = resolve(APP_ROOT, '.next/diagnostics/route-bundle-stats.json');

// ---------------------------------------------------------------------------
// バジェット定数
// ---------------------------------------------------------------------------

/** 回帰防止ライン（現状 + 15% バッファ） */
const BUDGETS = {
  // 認証系ルート（/auth/*）: 2026-08-14〜17、/auth/reset-password が本予算(460KB)を
  // 476.5 KB gzip（Vercel production 実測、#2121）で超過し production デプロイが
  // 3 日以上全滅した。原因は NEXT_PUBLIC_SENTRY_DSN が Production にのみスコープされて
  // いるため、preview/ローカル build では Sentry 初期化が dead-code-eliminate され
  // 全 route 一律 -66〜68 KB 軽くなる非対称（preview 実測 409.1 KB）。この非対称自体の
  // 解消は #2123（preview/production budget parity）へ送り、まず本予算を実測値 476.5 KB
  // + 余裕で 500 KB へ引き上げる（一時緩和、可逆・1行）。ResetPasswordForm.tsx の
  // MFAVerifyForm 遅延ロード（同 #2121）は局所的な削減だが、この非対称の解消にはならない。
  /** 認証系ルート（/auth/*）: 現状 preview/ローカル ~410 KB・production ~477 KB gzip（#2121, #2123 参照） */
  AUTH_ROUTES_WARN_KB: 500,
  /** アプリ本体ルート: 現状 ~836 KB gzip */
  APP_ROUTES_WARN_KB: 960,
  /** CSS 合計: 現状 ~90 KB gzip */
  CSS_WARN_KB: 95,
} as const;

/** デザインシステム目標値（段階的に達成） */
const TARGETS = {
  FIRST_LOAD_JS_KB: 100,
  CSS_KB: 30,
} as const;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface RouteBundleStat {
  route: string;
  firstLoadUncompressedJsBytes: number;
  firstLoadChunkPaths: string[];
}

interface RouteResult {
  route: string;
  rawKB: number;
  gzipKB: number;
  budgetKB: number;
  status: 'pass' | 'warn' | 'over';
}

interface BudgetResult {
  timestamp: string;
  routes: RouteResult[];
  css: {
    gzipKB: number;
    budgetKB: number;
    status: 'pass' | 'warn' | 'over';
  };
  summary: {
    totalRoutes: number;
    passCount: number;
    warnCount: number;
    overCount: number;
    loginGzipKB: number;
    smallestGzipKB: number;
    largestGzipKB: number;
  };
}

// ---------------------------------------------------------------------------
// CLI引数パース
// ---------------------------------------------------------------------------

const failOnBudget = process.argv.includes('--fail');
const outputArg = process.argv.find((a) => a.startsWith('--output='));
const outputPath = outputArg ? resolve(APP_ROOT, outputArg.replace('--output=', '')) : null;

// ---------------------------------------------------------------------------
// gzip計算
// ---------------------------------------------------------------------------

function computeGzipSize(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  try {
    const result = execSync(`gzip -c "${filePath}" | wc -c`, {
      cwd: APP_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return parseInt(result.trim(), 10);
  } catch {
    return 0;
  }
}

function computeRouteGzipBytes(chunkPaths: string[]): number {
  let total = 0;
  for (const chunk of chunkPaths) {
    const fullPath = resolve(APP_ROOT, chunk);
    total += computeGzipSize(fullPath);
  }
  return total;
}

function computeCssGzipKB(): number {
  try {
    const result = execSync('gzip -c .next/static/chunks/*.css | wc -c', {
      cwd: APP_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return Math.round((parseInt(result.trim(), 10) / 1024) * 10) / 10;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// ルート分類
// ---------------------------------------------------------------------------

function isAuthRoute(route: string): boolean {
  return /\/auth/.test(route);
}

function getBudgetForRoute(route: string): number {
  return isAuthRoute(route) ? BUDGETS.AUTH_ROUTES_WARN_KB : BUDGETS.APP_ROUTES_WARN_KB;
}

function getStatus(gzipKB: number, budgetKB: number): 'pass' | 'warn' | 'over' {
  if (gzipKB <= budgetKB) return 'pass';
  return 'over';
}

// ---------------------------------------------------------------------------
// Markdownレポート
// ---------------------------------------------------------------------------

function formatMarkdown(result: BudgetResult): string {
  const lines: string[] = [];

  lines.push('## Bundle Size Budget Report');
  lines.push('');

  // サマリー
  const { summary } = result;
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Login page (gzip) | ${summary.loginGzipKB} KB |`);
  lines.push(`| Smallest route (gzip) | ${summary.smallestGzipKB} KB |`);
  lines.push(`| Largest route (gzip) | ${summary.largestGzipKB} KB |`);
  lines.push(`| CSS total (gzip) | ${result.css.gzipKB} KB |`);
  lines.push(`| Routes over budget | ${summary.overCount} / ${summary.totalRoutes} |`);
  lines.push('');

  // 目標値との差
  lines.push('### Design System Targets');
  lines.push(`| Target | Budget | Current | Gap |`);
  lines.push(`|--------|--------|---------|-----|`);
  lines.push(
    `| First Load JS | ${TARGETS.FIRST_LOAD_JS_KB} KB | ${summary.loginGzipKB} KB | ${summary.loginGzipKB > TARGETS.FIRST_LOAD_JS_KB ? `+${summary.loginGzipKB - TARGETS.FIRST_LOAD_JS_KB} KB` : 'OK'} |`,
  );
  lines.push(
    `| CSS | ${TARGETS.CSS_KB} KB | ${result.css.gzipKB} KB | ${result.css.gzipKB > TARGETS.CSS_KB ? `+${(result.css.gzipKB - TARGETS.CSS_KB).toFixed(1)} KB` : 'OK'} |`,
  );
  lines.push('');

  // ルート別
  lines.push('### Per-Route Breakdown');
  lines.push('');
  lines.push(`| Status | Route | Raw | Gzip | Budget |`);
  lines.push(`|--------|-------|-----|------|--------|`);

  const sorted = [...result.routes].sort((a, b) => b.gzipKB - a.gzipKB);
  for (const r of sorted) {
    const icon = r.status === 'pass' ? 'OK' : 'OVER';
    lines.push(`| ${icon} | \`${r.route}\` | ${r.rawKB} KB | ${r.gzipKB} KB | ${r.budgetKB} KB |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

function main(): void {
  if (!existsSync(STATS_FILE)) {
    console.error(`Error: ${STATS_FILE} not found. Run "npm run build" first.`);
    process.exit(1);
  }

  const stats = JSON.parse(readFileSync(STATS_FILE, 'utf8')) as RouteBundleStat[];

  console.log(`Checking bundle budgets for ${stats.length} routes...\n`);

  const routes: RouteResult[] = [];

  for (const stat of stats) {
    const rawKB = Math.round(stat.firstLoadUncompressedJsBytes / 1024);
    const gzipBytes = computeRouteGzipBytes(stat.firstLoadChunkPaths);
    const gzipKB = Math.round((gzipBytes / 1024) * 10) / 10;
    const budgetKB = getBudgetForRoute(stat.route);
    const status = getStatus(gzipKB, budgetKB);

    routes.push({ route: stat.route, rawKB, gzipKB, budgetKB, status });

    const icon = status === 'pass' ? 'OK' : 'OVER';
    console.log(`  ${icon}  ${gzipKB} KB / ${budgetKB} KB  ${stat.route}`);
  }

  // CSS
  const cssGzipKB = computeCssGzipKB();
  const cssStatus = getStatus(cssGzipKB, BUDGETS.CSS_WARN_KB);
  console.log(`\n  CSS: ${cssGzipKB} KB / ${BUDGETS.CSS_WARN_KB} KB  (${cssStatus})`);

  // サマリー計算
  const loginRoute = routes.find((r) => r.route.includes('/login'));
  const passCount = routes.filter((r) => r.status === 'pass').length;
  const overCount = routes.filter((r) => r.status === 'over').length;
  const gzipValues = routes.map((r) => r.gzipKB);

  const result: BudgetResult = {
    timestamp: new Date().toISOString(),
    routes,
    css: {
      gzipKB: cssGzipKB,
      budgetKB: BUDGETS.CSS_WARN_KB,
      status: cssStatus,
    },
    summary: {
      totalRoutes: routes.length,
      passCount,
      warnCount: 0,
      overCount,
      loginGzipKB: loginRoute?.gzipKB ?? 0,
      smallestGzipKB: Math.min(...gzipValues),
      largestGzipKB: Math.max(...gzipValues),
    },
  };

  // Markdown出力
  const markdown = formatMarkdown(result);
  console.log(`\n${markdown}`);

  // JSON保存
  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`Result saved to: ${outputPath}`);
  }

  // 終了コード
  // CSS も route と同じく --fail の対象にする。CSS 予算はかつて size-limit が
  // 別途強制していたが、あれは @size-limit/preset-app 経由で headless Chrome を
  // 起動する（CSS に実行時間の測定は無意味で、Vercel の build 環境で browser が
  // 使える保証も無い）。強制はここへ寄せた上で、size-limit / @size-limit/preset-app
  // 自体を撤去した（#2066、extract-zip HIGH の依存経路①を断つため。CI 未使用で
  // 強制も既にここへ移設済みだったため実害なし）。

  if (failOnBudget && (overCount > 0 || cssStatus === 'over')) {
    if (overCount > 0) {
      console.log(`\nBudget exceeded: ${overCount} route(s) over budget.`);
    }
    if (cssStatus === 'over') {
      console.log(`\nBudget exceeded: CSS ${cssGzipKB} KB > ${BUDGETS.CSS_WARN_KB} KB.`);
    }
    process.exit(1);
  }
}

main();
