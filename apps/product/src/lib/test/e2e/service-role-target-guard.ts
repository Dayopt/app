/**
 * service role で破壊的な seed / cleanup を行う E2E の実行先ガード。
 *
 * 対象 suite は auth user、profile、user_settings、tag、plan、record を作って
 * 消す。`NEXT_PUBLIC_SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が「揃っている
 * こと」だけを条件にすると、Production の認証情報を持つ shell から起動された
 * 瞬間に Production のデータを mutate する。AGENTS.md の `EXPLICIT AUTHORITY`
 * （production mutation・データ削除は明示指示が揃うまで実行しない）に反するので、
 * 実行先が安全であることを確認できた場合だけ suite を有効にする。
 *
 * 既定はローカル stack のみ。PR Preview など非ローカルで走らせる場合は
 * `E2E_ALLOW_NONLOCAL_SUPABASE=1` の明示的な opt-in を要求する。
 * Production project ref は opt-in があっても許可しない。
 */

/** Production Supabase project ref（docs/engineering/infra.md §Supabase Project）。 */
const PRODUCTION_PROJECT_REF = 'yvglwblxrnrenfifsnje';

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export type ServiceRoleTarget = { safe: true } | { safe: false; reason: string };

export function resolveServiceRoleTarget(
  supabaseUrl: string | undefined,
  serviceRoleKey: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ServiceRoleTarget {
  if (!supabaseUrl || !serviceRoleKey) {
    return { safe: false, reason: 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定' };
  }

  let hostname: string;
  try {
    hostname = new URL(supabaseUrl).hostname;
  } catch {
    return {
      safe: false,
      reason: `NEXT_PUBLIC_SUPABASE_URL を URL として解釈できない: ${supabaseUrl}`,
    };
  }

  // opt-in があっても Production だけは通さない
  if (hostname.includes(PRODUCTION_PROJECT_REF)) {
    return {
      safe: false,
      reason: 'Production project を指しているため実行しない（破壊的 seed / cleanup を含む）',
    };
  }

  if (LOCAL_HOSTNAMES.has(hostname)) return { safe: true };

  if (env.E2E_ALLOW_NONLOCAL_SUPABASE === '1') return { safe: true };

  return {
    safe: false,
    reason: `非ローカルの Supabase (${hostname}) には E2E_ALLOW_NONLOCAL_SUPABASE=1 の明示 opt-in が必要`,
  };
}
