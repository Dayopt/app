import type { User } from '@supabase/supabase-js';

/**
 * ユーザーの表示名を取得する
 *
 * 優先順位:
 * 1. user_metadata.full_name（ユーザーが設定した表示名）
 * 2. メールアドレスの@前のドット区切り最初のパート（先頭大文字）
 * 3. フォールバック文字列
 */
export function getDisplayName(user: User | null | undefined, fallback = ''): string {
  if (user?.user_metadata?.full_name) {
    return user.user_metadata.full_name as string;
  }

  const local = user?.email?.split('@')[0] ?? '';
  const first = local.split('.')[0] ?? '';
  if (first) {
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  return fallback;
}

/**
 * ユーザーのアバターURLを取得する
 */
export function getAvatarUrl(user: User | null | undefined): string | null {
  return (user?.user_metadata?.avatar_url as string) || null;
}

/**
 * 表示名からイニシャル（先頭1文字）を取得する
 */
export function getInitials(name: string): string {
  return name.charAt(0).toUpperCase();
}
