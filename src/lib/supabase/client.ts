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
import type { SupabaseClient as SupabaseClientType } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/**
 * Browser用Supabaseクライアント作成
 *
 * @returns Supabase Browser Client
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * 型定義
 */
export type SupabaseClient = SupabaseClientType<Database>;
