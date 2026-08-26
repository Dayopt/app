/**
 * Supabase Browser Client
 *
 * Client Components用のSupabaseクライアント
 *
 * @see https://supabase.com/docs/guides/auth/server-side/creating-a-client
 * @see Issue #531 - Supabase × Vercel × Next.js 認証チェックリスト
 *
 * 使用箇所:
 * - Client Components ('use client')
 * - ブラウザ側での認証処理（サインイン/サインアウト/OAuth）
 * - onAuthStateChange リスナー
 *
 * 使用例:
 * ```tsx
 * 'use client'
 * import { createClient } from '@/lib/supabase/client'
 *
 * export function SignInButton() {
 *   const supabase = createClient()
 *
 *   const handleSignIn = async () => {
 *     const { data, error } = await supabase.auth.signInWithPassword({
 *       email: 'user@example.com',
 *       password: 'password'
 *     })
 *   }
 * }
 * ```
 *
 * 重要:
 * - このクライアントはブラウザでのみ動作します
 * - Server Components/Actions では server.ts を使用してください
 * - Middleware では middleware.ts を使用してください
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database';

import {
  createDegradedFetch,
  isPlaceholderSupabaseConfig,
  isPreviewSupabaseDegraded,
  PLACEHOLDER_SUPABASE_ANON_KEY,
  PLACEHOLDER_SUPABASE_URL,
} from './preview-degradation';

/**
 * env var 未設定 / placeholder 値のまま起動された場合の設定エラー。
 * 呼び出し側（useAuthStore 等）が Supabase の認証エラーと区別して扱えるよう
 * 専用クラスにしている（instanceof で判定）。
 */
export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

/**
 * Preview スコープ（#2416 未導入のため Shared Preview Supabase が無い）で
 * Supabase env が placeholder のまま起動されたかどうか。
 *
 * `NEXT_PUBLIC_VERCEL_ENV === 'preview'` の時だけ true になる境界にしているため、
 * local dev（未設定）や production への設定ミスは対象外のまま
 * — createClient() は従来どおり SupabaseConfigError を throw し、検出能力を下げない。
 *
 * @see apps/product/src/lib/analytics/DeferredAnalytics.tsx - 同じ NEXT_PUBLIC_VERCEL_ENV を
 *      client 側で参照する先例
 * @see ./preview-degradation.ts - 判定式・fail-open にしない設計の詳細
 */
export function isSupabasePreviewDegraded() {
  return isPreviewSupabaseDegraded(
    process.env.NEXT_PUBLIC_VERCEL_ENV,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Browser用Supabaseクライアント作成
 *
 * Preview で env 未設定の場合（isSupabasePreviewDegraded() 参照）は throw せず、
 * 実ネットワークへ出ない degraded client を返す（fetch は常に reject する —
 * ログインフォーム等が引き続き submit 可能なまま残っても、実 credential が
 * placeholder host へ送出されることはない）。実際のメソッド呼び出し失敗は
 * 既存の try/catch 経由の失敗処理（resolveAuthErrorKey 等）に委ねる。
 *
 * @returns Supabase Browser Client
 */
export function createClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (isPlaceholderSupabaseConfig(url, anonKey)) {
    if (isSupabasePreviewDegraded()) {
      return createBrowserClient<Database>(
        PLACEHOLDER_SUPABASE_URL,
        PLACEHOLDER_SUPABASE_ANON_KEY,
        {
          global: { fetch: createDegradedFetch() },
        },
      );
    }

    throw new SupabaseConfigError(
      '❌ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です:\n\n' +
        'これらは pnpm dev が Supabase local（supabase status -o env）から注入します。' +
        'pnpm dev で起動してください。詳細は docs/operations/secrets.md を参照してください。',
    );
  }

  // isPlaceholderSupabaseConfig(url, anonKey) が false ということは、内部の
  // `!url || !anonKey` も false ということ。isPlaceholderSupabaseConfig は type guard
  // ではないため TS はここで narrowing できないが、実行時には url/anonKey は
  // 非空文字列であることが保証されている。
  return createBrowserClient<Database>(url!, anonKey!);
}
