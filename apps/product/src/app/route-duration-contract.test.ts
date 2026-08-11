import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { globSync } from 'glob';
import { describe, expect, it } from 'vitest';

/**
 * Product の全 route handler の Function 実行時間上限（#1701 Phase 2）。
 *
 * 値は「速そうだから短く」ではなく **内側の timeout 定数の worst path より大きく** 取る。
 * 下回ると handler が自前のエラー応答を返す前に kill され、graceful failure（4xx/5xx の
 * JSON）が Vercel の 504 に化ける。既存の cron が `maxDuration 60` に対し内部予算
 * `TIME_BUDGET_MS = 50_000` を持つのと同じ規律。
 */
const ROUTE_DURATION_CONTRACT = {
  // 外部 I/O 無し
  'src/app/.well-known/oauth-authorization-server/route.ts': 15,
  'src/app/.well-known/oauth-protected-resource/route.ts': 15,
  'src/app/api/v1/system/[...retired]/route.ts': 5,
  'src/app/maintenance/route.ts': 15,

  // 外部 I/O 1-2 本
  'src/app/api/csp-report/route.ts': 30,
  'src/app/api/health/route.ts': 30,
  'src/app/api/webhooks/resend/route.ts': 30,
  'src/app/api/webhooks/stripe/route.ts': 30,

  // 外部 I/O が複数逐次
  'src/app/[locale]/(auth)/auth/callback/route.ts': 60,
  'src/app/[locale]/(auth)/auth/confirm/route.ts': 60,
  'src/app/api/auth/route.ts': 60,
  'src/app/api/cron/calendar-sync/route.ts': 60,
  'src/app/api/cron/external-connection-maintenance/route.ts': 60,
  'src/app/api/integrations/google-calendar/callback/route.ts': 60,
  'src/app/api/integrations/google-calendar/start/route.ts': 60,
  'src/app/api/mcp/route.ts': 60,
  'src/app/api/oauth/token/route.ts': 60,
  'src/app/api/v1/calendar/[token]/route.ts': 60,
  'src/app/mcp/route.ts': 60,
  'src/app/oauth/token/route.ts': 60,

  // 構造的に上限が無い（下記 §tRPC を参照）
  'src/app/api/trpc/[trpc]/route.ts': 300,
} as const;

/**
 * 外部 I/O をしない route。§内側 timeout の下限 の対象外にする。
 *
 * ここへ足すのは「本当に外部へ出ない」route だけ。安易に足すと下限チェックが空洞化する。
 */
const NO_EXTERNAL_IO_ROUTES = new Set<string>([
  'src/app/.well-known/oauth-authorization-server/route.ts',
  'src/app/.well-known/oauth-protected-resource/route.ts',
  'src/app/api/v1/system/[...retired]/route.ts',
  'src/app/maintenance/route.ts',
]);

/**
 * 内側 timeout は import ではなく **source から読む**。
 *
 * route module や `lib/supabase/server.ts` を import すると env 検証・Sentry 初期化・
 * `next/headers` が走って test が環境依存になる。source を読む形なら副作用ゼロで、
 * 定数が動けば正規表現が外れて fail closed になる。
 */
function readTimeoutConstant(relativePath: string, pattern: RegExp): number {
  const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
  const matched = source.match(pattern);

  if (!matched?.[1]) {
    throw new Error(
      `${relativePath} から timeout 定数を読めなかった。定数の書き方が変わったなら、この test の正規表現と ROUTE_DURATION_CONTRACT の値を両方見直すこと。`,
    );
  }

  return Number(matched[1].replaceAll('_', ''));
}

describe('Product route duration contract', () => {
  it('全 route が静的な maxDuration を明示する', () => {
    // `dot: true` が無いと `.well-known` 配下の 2 route を取りこぼし、契約表から静かに漏れる
    // （実測: 付けないと 19 件、付けると 21 件）。
    const discoveredRoutes = globSync('src/app/**/route.{ts,tsx}', {
      cwd: process.cwd(),
      dot: true,
    }).sort();
    const contractRoutes = Object.keys(ROUTE_DURATION_CONTRACT).sort();

    const missing = discoveredRoutes.filter((route) => !contractRoutes.includes(route));
    const stale = contractRoutes.filter((route) => !discoveredRoutes.includes(route));

    expect(
      { missing, stale },
      '新しい route を足したら ROUTE_DURATION_CONTRACT にも 1 行足すこと（route を消したら削ること）',
    ).toEqual({ missing: [], stale: [] });

    for (const [routePath, maxDuration] of Object.entries(ROUTE_DURATION_CONTRACT)) {
      const source = readFileSync(resolve(process.cwd(), routePath), 'utf8');

      // Next.js は route segment config を静的解析するため、数値リテラルでなければ効かない。
      expect(
        source,
        `${routePath} は maxDuration = ${maxDuration} を数値リテラルで export すること`,
      ).toMatch(new RegExp(`export\\s+const\\s+maxDuration\\s*=\\s*${maxDuration}\\s*;`));
    }
  });

  it('vercel.json は route config と競合する functions override を持たない', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as Record<string, unknown>;

    expect(config).not.toHaveProperty('functions');
  });

  it('外部 I/O を行う route の maxDuration が内側 timeout の下限を上回る', () => {
    const supabaseFetchTimeoutMs = readTimeoutConstant(
      'src/lib/supabase/server.ts',
      /AbortSignal\.timeout\((\d[\d_]*)\)/u,
    );
    const rateLimitTimeoutMs = readTimeoutConstant(
      'src/lib/rate-limit/upstash.ts',
      /RATE_LIMIT_TIMEOUT_MS\s*=\s*(\d[\d_]*)/u,
    );

    // 「Supabase 1 往復 + rate limit 1 回」すら完走できない route を作らないための床。
    // 内側 timeout を伸ばした変更が route を黙って kill 側へ倒すのを、ここで落とす。
    const floorMs = supabaseFetchTimeoutMs + rateLimitTimeoutMs;

    const tooTight = Object.entries(ROUTE_DURATION_CONTRACT)
      .filter(([routePath]) => !NO_EXTERNAL_IO_ROUTES.has(routePath))
      .filter(([, maxDuration]) => maxDuration * 1000 < floorMs)
      .map(([routePath, maxDuration]) => `${routePath} (${maxDuration}s < ${floorMs / 1000}s)`);

    expect(
      tooTight,
      `内側 timeout の合計 ${floorMs}ms を下回る route がある。maxDuration を上げるか、内側 timeout を短くすること`,
    ).toEqual([]);
  });
});
