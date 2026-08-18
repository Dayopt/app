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
  // 全 route 一律 -66〜68 KB 軽くなる非対称（preview 実測 409.1 KB）。この非対称自体は
  // 下記 SENTRY_PREVIEW_COMPENSATION_KB で解消済み（#2123）。本予算は実測値 476.5 KB
  // + 余裕で 500 KB のまま（一時緩和時の値を継続、再引き締めは別途判断）。
  // ResetPasswordForm.tsx の MFAVerifyForm 遅延ロード（同 #2121）は局所的な削減。
  /** 認証系ルート（/auth/*）: production 実測 ~477 KB gzip。#2123 の補正により preview/ローカルも同じ土俵で比較する（#2121, #2123 参照） */
  AUTH_ROUTES_WARN_KB: 500,
  /** アプリ本体ルート: 現状 ~836 KB gzip */
  APP_ROUTES_WARN_KB: 960,
  /** CSS 合計: 現状 ~90 KB gzip */
  CSS_WARN_KB: 95,
} as const;

/**
 * preview/production budget parity（#2123）。
 *
 * `NEXT_PUBLIC_SENTRY_DSN` は Production にのみスコープされている（意図的、preview
 * のノイズを Sentry へ送らない設計。`apps/product/production-build-gate.mjs` の
 * `FORBIDDEN_PRODUCT_PREVIEW_BUILD_ENV` が preview への実値混入を禁止する）。
 * `apps/product/instrumentation-client.ts` の Sentry 初期化はこの値でガードされているため、
 * preview/ローカル build では Sentry client SDK（browserTracingIntegration 等）が
 * dead-code-elimination で全 route から一律に消え、production 実測より軽くなる。
 *
 * 対応として instrumentation-client.ts 側を変更する案（dummy DSN 注入・lazy load）は
 * 両方とも見送った: dummy DSN 注入は preview で `Sentry.init()` を実際に呼ぶことになり、
 * `enabled: false` を渡しても公式ドキュメントが明記する通り「doesn't prevent all overhead」
 * （fetch/console 等の instrumentation hook は enabled に関わらず動きうる）。lazy load
 * は同意済みリピーターの hydration 直後〜import 解決までの窓でエラー捕捉が抜ける
 * リスクがある。どちらも observability の本来目的を bundle 削減と天秤にかける必要が
 * あるため、ここでは budget check 側の補正で対応する（アプリ実行パスには一切触れない）。
 *
 * 実測: Vercel production ビルドは preview/ローカルより全 route 一律 +66〜68 KB gzip
 * 重い（#2121）。この既知の重量差を preview/ローカル計測値に加算してから budget と
 * 比較することで、preview の budget check が production 相当の重さを検出できるようにする。
 *
 * 更新条件: Sentry SDK のバージョン更新や instrumentation-client.ts の integrations
 * 構成変更でこの差分が変わったら、対象 PR の Vercel production デプロイログ実測値で
 * この定数を更新する（ローカル/preview 実測との差分を再計算する）。
 */
const SENTRY_PREVIEW_COMPENSATION_KB = 67; // #2121 実測 66〜68 KB の中央値
const IS_PRODUCTION_BUILD = process.env.VERCEL_ENV === 'production';

/**
 * Supabase Preview Branch の実 credential による二重計上の暫定減額（#2159）。
 *
 * `SENTRY_PREVIEW_COMPENSATION_KB`（67 KB）は「production 実測 − placeholder preview
 * 実測」の一括差分として較正されており、Sentry 分と Supabase credential inline 分が
 * 混在している。Supabase Preview Branch を持つ PR（`supabase/migrations/**` を含む PR）
 * には Vercel integration が実 `NEXT_PUBLIC_SUPABASE_URL` / 実 JWT 形式 anon key を注入し、
 * 他の PR は `apps/product/next.config.mjs` の短い placeholder
 * （`https://placeholder.supabase.co` / `placeholder`）のまま build される
 * （`docs/engineering/infra.md` §PR Preview の Supabase Vercel integration 参照）。
 *
 * 実 credential を持つ preview では、実際にビルドへ埋め込まれた長い credential 文字列
 * （信頼できる複数箇所から参照される: `lib/supabase/{client,server,middleware}.ts`,
 * `lib/trpc/{context,server}.ts` 等）と、既存の一括補正（67 KB）が二重計上になり、
 * 偽陽性の budget 超過を招く（#2159 で発見）。
 *
 * 三点実測（2026-08-18、PR #2159）: production 476.0 KB / placeholder preview
 * 報告値 475.5 KB（構造的に一致）/ 実 credential preview 報告値 502.4 KB。
 * 502.4 − 475.5 ≈ 27 KB が credential inline 分の推定値。
 *
 * これは暫定の lump 減額であり、Sentry 分・credential 分を個別に較正し直す恒久対応は
 * #2163 に切り出し済み。
 */
const SUPABASE_REAL_CRED_ADJUSTMENT_KB = 27; // #2159 実測（475.5 KB 基準の暫定値、詳細は #2163）
const PLACEHOLDER_SUPABASE_URL = 'https://placeholder.supabase.co'; // next.config.mjs と同じ値

/**
 * preview/local build に実 Supabase URL（`next.config.mjs` の placeholder 以外）が
 * 埋め込まれているかを判定する。`NEXT_PUBLIC_SUPABASE_URL` を直接読まず引数で受けるのは、
 * env mock 無しで単体テストできるようにするため。
 */
export function hasRealSupabaseCredentials(supabaseUrl: string | undefined): boolean {
  return (
    typeof supabaseUrl === 'string' &&
    supabaseUrl.length > 0 &&
    supabaseUrl !== PLACEHOLDER_SUPABASE_URL
  );
}

/**
 * preview/local build に適用する補正値（KB）。production build には適用しない
 * （呼び出し側で `IS_PRODUCTION_BUILD` を先に見て 0 に倒す）。
 */
export function resolvePreviewCompensationKB(supabaseUrl: string | undefined): number {
  return hasRealSupabaseCredentials(supabaseUrl)
    ? SENTRY_PREVIEW_COMPENSATION_KB - SUPABASE_REAL_CRED_ADJUSTMENT_KB
    : SENTRY_PREVIEW_COMPENSATION_KB;
}

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
  const previewCompensationKB = IS_PRODUCTION_BUILD
    ? 0
    : resolvePreviewCompensationKB(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!IS_PRODUCTION_BUILD) {
    const suffix = hasRealSupabaseCredentials(process.env.NEXT_PUBLIC_SUPABASE_URL)
      ? '（実 Supabase credential 検出、#2159 の減額調整込み）'
      : '';
    console.log(
      `  (preview/local build: +${previewCompensationKB} KB Sentry compensation applied per route, #2123${suffix})\n`,
    );
  }

  const routes: RouteResult[] = [];

  for (const stat of stats) {
    const rawKB = Math.round(stat.firstLoadUncompressedJsBytes / 1024);
    const gzipBytes = computeRouteGzipBytes(stat.firstLoadChunkPaths);
    const measuredGzipKB = Math.round((gzipBytes / 1024) * 10) / 10;
    const gzipKB = IS_PRODUCTION_BUILD
      ? measuredGzipKB
      : Math.round((measuredGzipKB + previewCompensationKB) * 10) / 10;
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

// テストから純粋関数だけを import した時に CLI 本体を実行しないためのガード
// （STATS_FILE が無い test 環境で process.exit(1) が走ると test runner ごと落ちる）。
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
