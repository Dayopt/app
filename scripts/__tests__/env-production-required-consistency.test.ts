/**
 * `apps/product/src/env.ts` の「production では必須」refine と、
 * `apps/product/production-build-gate.mjs` の必須 env リストの整合を固定する。
 *
 * #2115（2026-08-17）で production の `RECOVERY_CODE_PEPPER` が空文字のまま放置され、
 * recovery code 機能が約 40 日間機能死していた。`env.ts` 側には
 * `NODE_ENV === 'production' && !data.RECOVERY_CODE_PEPPER` を拒否する refine が
 * 存在していたが、この検証は `env` Proxy の**初回アクセス時にのみ**評価される遅延実行で、
 * 未使用パス（recovery code 機能）に依存して検知が起きなかった。build gate は deploy 前に
 * 必ず評価されるため、同じ「production では必須」という契約を build gate 側にも重複して
 * 持たせておけば、未使用パスに依存せず deploy を止められる。
 *
 * #2104（env の placeholder / 空値が健全判定をすり抜ける class の機械検出）の対応の一部。
 * env.ts に「production では必須」の単一変数 refine（`!(data.NODE_ENV === 'production' &&
 * !data.XXX)` の形）を足したのに build gate の必須リストへ足し忘れる、という #2115 と同型の
 * 再発を機械的に検出する。
 *
 * ## 保証境界
 *
 * 検出できるのは env.ts の refine が「単一変数の truthy 必須」という単純な形の時だけ。
 * STRIPE のペア必須、UPSTASH の条件付き必須（VERCEL_ENV or MCP preview）、GOOGLE_CALENDAR の
 * all-or-nothing のような複合条件の refine はこの正規表現にマッチしない（意図的）。これらは
 * 「production なら常に必須」という build gate の単純な契約と意味が異なり、機械的に
 * build gate の必須リストへ写すと過剰検知になるため、対象に含めない。
 *
 * 現時点で web app（`apps/web/src/platform/config/env.ts`）にはこの形の refine が無いため
 * 対象外。追加された場合はこの test の対象を拡張する。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV } from '../../apps/product/production-build-gate.mjs';

const PRODUCT_ENV_TS_PATH = '../../apps/product/src/env.ts';

// `.refine((data) => !(data.NODE_ENV === 'production' && !data.XXX), {` の形だけを拾う。
// server-only package の import 制約を避けるため env.ts は実行せずソーステキストを読む。
const SINGLE_VAR_PRODUCTION_REQUIRED_PATTERN =
  /!\(data\.NODE_ENV === 'production' && !data\.([A-Z][A-Z0-9_]*)\)/gu;

function extractSingleVarProductionRequiredEnvNames(source: string): string[] {
  return [...source.matchAll(SINGLE_VAR_PRODUCTION_REQUIRED_PATTERN)].map((match) => match[1]!);
}

describe('env.ts の production 必須 refine と build gate の整合', () => {
  const envTsSource = readFileSync(
    fileURLToPath(new URL(PRODUCT_ENV_TS_PATH, import.meta.url)),
    'utf8',
  );
  const singleVarRequiredNames = extractSingleVarProductionRequiredEnvNames(envTsSource);

  it('少なくとも1つの単一変数 production 必須 refine を検出できる（正規表現の生存確認）', () => {
    // この test 自体が空振りしていないこと（正規表現が env.ts の実際の書き方とズレて
    // 何も拾えなくなっていないこと）を固定する。0 件になったら正規表現側を見直す。
    expect(singleVarRequiredNames.length).toBeGreaterThan(0);
    expect(singleVarRequiredNames).toContain('RECOVERY_CODE_PEPPER');
  });

  it.each(singleVarRequiredNames.length > 0 ? singleVarRequiredNames : ['__none__'])(
    'env.ts が production 必須とする %s は build gate の必須リストにも入っている',
    (name) => {
      expect(REQUIRED_PRODUCT_OPERATIONAL_BUILD_ENV).toContain(name);
    },
  );
});
