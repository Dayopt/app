import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { globSync } from 'glob';
import { describe, expect, it } from 'vitest';

/**
 * Web の全 route handler の Function 実行時間上限。
 *
 * 以前は `src/app/api/**` だけを見ていたため、`api/` の外にある RSS feed 2 件が契約表から
 * 漏れて project 既定（300s）を継承していた（#1701 Phase 2 で発見）。glob は `src/app/**`
 * まで広げ、`dot: true` を付けて dot ディレクトリ配下も取りこぼさない。
 */
const ROUTE_DURATION_CONTRACT = {
  'src/app/api/compass-docs/route.ts': 30,
  'src/app/api/contact/route.ts': 30,
  'src/app/api/csp-report/route.ts': 30,
  'src/app/api/og/route.tsx': 25,
  'src/app/api/search/route.ts': 30,
  'src/app/api/v1/system/[...retired]/route.ts': 5,
  'src/app/api/webhooks/resend/route.ts': 15,
  'src/app/blog/feed.xml/route.ts': 30,
  'src/app/ja/blog/feed.xml/route.ts': 30,
} as const;

describe('Web route duration contract', () => {
  it('全 route が静的な maxDuration を明示する', () => {
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
});
