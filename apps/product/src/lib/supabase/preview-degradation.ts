/**
 * Preview Supabase Degradation の共有 primitive
 *
 * #2416（Shared Preview Supabase）が凍結中のため、一般 Preview スコープには
 * Supabase env が存在しない。以前は各所の Supabase client 生成が同期的に throw し、
 * Preview 全体が起動時に落ちていた（#2419）。
 *
 * この判定は「Preview + Supabase env が placeholder（未設定含む）」の時だけ true になり、
 * local dev（未設定）や production への設定ミスは対象外のまま
 * — 呼び出し元（client.ts / env.ts）は従来どおり throw し、検出能力を下げない。
 *
 * fail-open にしない: この判定は「機能を無効表示する」ための signal であり、
 * 認証チェックの成否には一切関与しない。degraded 時に生成する client は
 * {@link createDegradedFetch} で実ネットワークへの egress も塞ぐ
 * （placeholder host へ実 credential / session token を送出させない）。
 *
 * client.ts（browser）と env.ts（server）の両方が参照するため、
 * 判定式・placeholder 値の 2 重管理・drift を避けるためにこのファイルへ集約する。
 * pure module（'use client' / 'server-only' のいずれも持たない）として
 * どちらの実行環境からも安全に import できるようにする。
 *
 * @see apps/product/next.config.mjs - 同じ placeholder 値を持つ build-time env fallback
 */

// next.config.mjs の env フォールバック値と同じ値を保つ必要がある。
export const PLACEHOLDER_SUPABASE_URL = 'https://placeholder.supabase.co';
export const PLACEHOLDER_SUPABASE_ANON_KEY = 'placeholder';

/** url/anonKey が未設定、または placeholder 値のままかどうか */
export function isPlaceholderSupabaseConfig(
  url: string | undefined,
  anonKey: string | undefined,
): boolean {
  return (
    !url ||
    !anonKey ||
    url === PLACEHOLDER_SUPABASE_URL ||
    anonKey === PLACEHOLDER_SUPABASE_ANON_KEY
  );
}

/**
 * Preview + Supabase env が placeholder（未設定含む）かどうか。
 *
 * 呼び出し元は自身の実行環境に応じた値を渡す（client 側は build-time inline される
 * `NEXT_PUBLIC_VERCEL_ENV` / `NEXT_PUBLIC_SUPABASE_*`、server 側（env.ts）は
 * `Object.entries(process.env)` 由来の runtime 実値）。この関数自体は値の
 * 読み出し元を知らない純関数のまま保つ — server 側で literal dot-access（build-time
 * inline 対象）を混ぜて渡すと、実 env が後から追加されても再 build するまで
 * degraded 判定が固定されたままになる事故につながるため。
 */
export function isPreviewSupabaseDegraded(
  vercelEnv: string | undefined,
  url: string | undefined,
  anonKey: string | undefined,
): boolean {
  return vercelEnv === 'preview' && isPlaceholderSupabaseConfig(url, anonKey);
}

/**
 * degraded 時に Supabase client へ注入する fetch。実ネットワークへは一切出ず、
 * 呼び出しのたびに reject する。placeholder host（実在しない可能性がある外部ドメイン）
 * へ credential / session token を送出させないための egress 遮断。
 *
 * 既存の呼び出し元は Supabase SDK のメソッド呼び出し結果を try/catch や
 * `{ error }` の resolve で処理する設計のため、reject してもこの fetch 自体は
 * クラッシュを起こさない。
 */
export function createDegradedFetch(): typeof fetch {
  return () =>
    Promise.reject(
      new Error('Supabase is disabled in this Preview deployment (env not configured, see #2419).'),
    );
}
