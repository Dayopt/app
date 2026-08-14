/**
 * `usability-probe-setup.ts`（#2022）の `--base-url` 安全判定。
 *
 * `apps/product/src/lib/test/e2e/` 配下ではなくここに置く。vitest の unit
 * project は `**\/e2e/**` を exclude するため、あの場所に置くと単体テストが
 * 実行されない（`apps/product/vitest.config.ts` の `UNIT_EXCLUDE` 参照）。
 *
 * `service-role-target-guard.ts` が Supabase 接続先を判定するのと同型で、
 * こちらは headless Playwright が実際にログインフォームへ入力しにいく先
 * （`--base-url`）を判定する。denylist ではなく **allowlist**: 既知の安全な
 * host（localhost 系、Vercel preview）だけを既定許可し、それ以外は明示 opt-in
 * が無ければ拒否する。production app host は opt-in があっても拒否する。
 */

/** Production app host（`docs/engineering/infra.md` の Environment topology）。 */
const PRODUCTION_APP_HOST = 'app.dayopt.app';
const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const VERCEL_PREVIEW_SUFFIX = '.vercel.app';

export type BaseUrlTarget = { safe: true } | { safe: false; reason: string };

export function resolveBaseUrlTarget(
  baseUrl: string,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): BaseUrlTarget {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return { safe: false, reason: `--base-url を URL として解釈できない: ${baseUrl}` };
  }

  // production は allowlist / opt-in のどちらでも通さない
  if (hostname === PRODUCTION_APP_HOST) {
    return { safe: false, reason: `Production app (${PRODUCTION_APP_HOST}) には実行しない` };
  }

  if (LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(VERCEL_PREVIEW_SUFFIX)) {
    return { safe: true };
  }

  if (env.USABILITY_PROBE_ALLOW_NONLOCAL === '1') return { safe: true };

  return {
    safe: false,
    reason: `allowlist（localhost 系 / *.vercel.app）に無い base-url (${hostname}) には USABILITY_PROBE_ALLOW_NONLOCAL=1 の明示 opt-in が必要`,
  };
}
