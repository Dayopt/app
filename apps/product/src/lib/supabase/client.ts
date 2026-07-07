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

import type { Database } from '@/lib/database';

// next.config.mjs の env フォールバック値（env var 未設定時の build 用プレースホルダー）。
// ここと同じ値を保つ必要がある。
const PLACEHOLDER_SUPABASE_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_SUPABASE_ANON_KEY = 'placeholder';

/**
 * Browser用Supabaseクライアント作成
 *
 * @returns Supabase Browser Client
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    !url ||
    !anonKey ||
    url === PLACEHOLDER_SUPABASE_URL ||
    anonKey === PLACEHOLDER_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      '❌ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です:\n\n' +
        '.op-env.local を作成し、op run 経由で起動してください。詳細は docs/operations/secrets.md を参照してください。',
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
